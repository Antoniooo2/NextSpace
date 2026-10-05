import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate, formatTime } from '../../lib/format'
import { personName } from '../../lib/contracts'
import { DOT } from '../../lib/symbols'
import { timeLabel } from '../../lib/notificationKinds'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import {
    MESSAGE_MAX_LENGTH,
    listConversations,
    loadMessages,
    markConversationRead,
    sendMessage,
} from '../../lib/chat'
import './messages.css'

const COMPOSER_MAX_HEIGHT = 140

function initialsOf(first, last) {
    return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?'
}

function dayKey(iso) {
    return new Date(iso).toDateString()
}

function dayLabel(iso, t) {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return t('messages.today')
    if (d.toDateString() === yesterday.toDateString()) return t('messages.yesterday')
    return formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' })
}

// Tenant <-> owner chat: inbox on the left, the open thread on the right (one
// at a time on phones). New messages arrive live: liveTick changes whenever
// Realtime reports an insert or a read receipt in one of this user's chats.
export default function Messages({
    user,
    accountType,
    liveTick = 0,
    initialConversationId = null,
    onActiveChange,
    onUnreadChanged,
    onViewProperty,
}) {
    const { t } = useTranslation()
    const myDui = user?.user_metadata?.dui
    const [conversations, setConversations] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [activeId, setActiveId] = useState(initialConversationId)
    const [messages, setMessages] = useState([])
    const [threadLoading, setThreadLoading] = useState(false)
    const [threadError, setThreadError] = useState('')
    const [draft, setDraft] = useState('')
    const [sending, setSending] = useState(false)
    const [sendError, setSendError] = useState('')
    const activeRef = useRef(activeId)
    const scrollRef = useRef(null)
    const composerRef = useRef(null)

    const loadList = useCallback(async () => {
        const { conversations: rows, error } = await listConversations()
        if (error) setLoadError(describeSupabaseError(error))
        else {
            setLoadError('')
            setConversations(rows)
        }
        setLoading(false)
    }, [])

    const loadThread = useCallback(
        async (id, { quiet = false } = {}) => {
            if (!quiet) setThreadLoading(true)
            const { messages: rows, error } = await loadMessages(id)
            if (activeRef.current !== id) return
            setThreadLoading(false)
            if (error) {
                setThreadError(describeSupabaseError(error))
                return
            }
            setThreadError('')
            setMessages(rows)
            if (myDui && rows.some((m) => !m.read_at && m.sender_dui !== myDui)) {
                await markConversationRead(id, myDui)
                setConversations((prev) => prev.map((c) => (c.conversation_id === id ? { ...c, unread_count: 0 } : c)))
                onUnreadChanged?.()
            }
        },
        [myDui, onUnreadChanged]
    )

    useEffect(() => {
        loadList()
    }, [loadList])

    useEffect(() => {
        activeRef.current = activeId
        setMessages([])
        setThreadError('')
        setSendError('')
        setDraft('')
        if (activeId) loadThread(activeId)
    }, [activeId, loadThread])

    useEffect(() => {
        if (liveTick === 0) return
        loadList()
        if (activeRef.current) loadThread(activeRef.current, { quiet: true })
    }, [liveTick, loadList, loadThread])

    // Keep the newest message in view when one arrives or a thread opens.
    useLayoutEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [messages.length, activeId, threadLoading])

    // The composer grows with the text up to a few lines.
    useLayoutEffect(() => {
        const el = composerRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
    }, [draft, activeId])

    const select = (id) => {
        setActiveId(id)
        onActiveChange?.(id)
    }

    const send = async () => {
        const body = draft.trim()
        const id = activeId
        if (!body || sending || !id) return
        setSending(true)
        setSendError('')
        setDraft('')
        const { message, error } = await sendMessage(id, body)
        setSending(false)
        if (error || !message) {
            setSendError(error ? describeSupabaseError(error) : t('messages.sendFailed'))
            setDraft(body)
            return
        }
        if (activeRef.current === id) {
            setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
        }
        setConversations((prev) =>
            prev
                .map((c) =>
                    c.conversation_id === id
                        ? { ...c, last_message_body: message.body, last_message_sender_dui: message.sender_dui, last_message_at: message.created_at }
                        : c
                )
                .sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
        )
        composerRef.current?.focus()
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            send()
        }
    }

    const active = conversations.find((c) => c.conversation_id === activeId) || null
    const unreadChats = conversations.filter((c) => c.unread_count > 0).length

    // Day separators between messages from different days.
    const items = useMemo(() => {
        const out = []
        let lastDay = null
        for (const m of messages) {
            const key = dayKey(m.created_at)
            if (key !== lastDay) {
                out.push({ type: 'day', key: `day-${key}`, label: dayLabel(m.created_at, t) })
                lastDay = key
            }
            out.push({ type: 'message', key: m.id, message: m })
        }
        return out
    }, [messages, t])

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>{t('messages.loading')}</p>
            </div>
        )
    }

    const counterpartName = (c) => personName({ first_name: c.counterpart_first_name, last_name: c.counterpart_last_name })
    const roleLabel = (c) => (c.my_role === 'owner' ? t('messages.role.business') : t('messages.role.owner'))

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>{t('messages.title')}</h1>
                    <p>{unreadChats > 0 ? t('messages.unreadChats', { count: unreadChats }) : t('messages.subtitle')}</p>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            {conversations.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-chat-dots"></i>
                    <h3>{t('messages.empty.title')}</h3>
                    <p>{accountType === 'property-owner' ? t('messages.empty.owner') : t('messages.empty.business')}</p>
                </div>
            ) : (
                <div className={`ns-chat ${active ? 'has-active' : ''}`}>
                    <aside className="ns-chat-list" aria-label={t('messages.listLabel')}>
                        <ul>
                            {conversations.map((c) => {
                                const mine = c.last_message_sender_dui === myDui
                                return (
                                    <li key={c.conversation_id}>
                                        <button
                                            type="button"
                                            className={`ns-chat-item ${c.conversation_id === activeId ? 'active' : ''} ${c.unread_count > 0 ? 'is-unread' : ''}`}
                                            onClick={() => select(c.conversation_id)}
                                            aria-current={c.conversation_id === activeId ? 'true' : undefined}
                                        >
                                            <span className="ns-chat-avatar">{initialsOf(c.counterpart_first_name, c.counterpart_last_name)}</span>
                                            <span className="ns-chat-item-text">
                                                <span className="ns-chat-item-top">
                                                    <strong>{counterpartName(c)}</strong>
                                                    <small>{c.last_message_body ? timeLabel(c.last_message_at) : ''}</small>
                                                </span>
                                                <span className="ns-chat-item-property">
                                                    <i className="bi bi-building"></i> {c.property_name}
                                                </span>
                                                <span className="ns-chat-item-bottom">
                                                    <span className="ns-chat-item-preview">
                                                        {c.last_message_body
                                                            ? `${mine ? `${t('messages.you')}: ` : ''}${c.last_message_body}`
                                                            : t('messages.noMessagesYet')}
                                                    </span>
                                                    {c.unread_count > 0 && (
                                                        <span className="ns-chat-badge" aria-label={t('messages.unreadCount', { count: c.unread_count })}>
                                                            {c.unread_count}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    </aside>

                    <section className="ns-chat-thread" aria-label={active ? t('messages.threadLabel', { name: counterpartName(active) }) : undefined}>
                        {!active ? (
                            <div className="ns-chat-placeholder">
                                <i className="bi bi-chat-square-text"></i>
                                <p>{t('messages.pick')}</p>
                            </div>
                        ) : (
                            <>
                                <header className="ns-chat-thread-head">
                                    <button type="button" className="ns-chat-back" onClick={() => select(null)} aria-label={t('messages.backToList')}>
                                        <i className="bi bi-arrow-left"></i>
                                    </button>
                                    <span className="ns-chat-avatar">{initialsOf(active.counterpart_first_name, active.counterpart_last_name)}</span>
                                    <div className="ns-chat-thread-who">
                                        <strong>{counterpartName(active)}</strong>
                                        <small>
                                            {roleLabel(active)}
                                            {` ${DOT} `}
                                            {onViewProperty ? (
                                                <button type="button" className="ns-link-btn" onClick={() => onViewProperty({ property_id: active.property_id })}>
                                                    {active.property_name}
                                                </button>
                                            ) : (
                                                active.property_name
                                            )}
                                        </small>
                                    </div>
                                </header>

                                <div className="ns-chat-messages" ref={scrollRef} aria-live="polite">
                                    {threadLoading ? (
                                        <div className="ns-chat-placeholder">
                                            <div className="ns-dash-spinner" />
                                        </div>
                                    ) : threadError ? (
                                        <div className="alert alert-danger py-2 m-3" role="alert">
                                            {threadError}
                                        </div>
                                    ) : items.length === 0 ? (
                                        <div className="ns-chat-placeholder">
                                            <i className="bi bi-emoji-smile"></i>
                                            <p>
                                                {active.my_role === 'tenant'
                                                    ? t('messages.firstMessageHint', { name: counterpartName(active) })
                                                    : t('messages.noMessagesYet')}
                                            </p>
                                        </div>
                                    ) : (
                                        items.map((item) => {
                                            if (item.type === 'day') {
                                                return (
                                                    <div key={item.key} className="ns-chat-day">
                                                        <span>{item.label}</span>
                                                    </div>
                                                )
                                            }
                                            const m = item.message
                                            const mine = m.sender_dui === myDui
                                            return (
                                                <div key={item.key} className={`ns-chat-bubble-row ${mine ? 'is-mine' : ''}`}>
                                                    <div className="ns-chat-bubble">
                                                        <p>{m.body}</p>
                                                        <span className="ns-chat-meta">
                                                            {formatTime(m.created_at)}
                                                            {mine && (
                                                                <i
                                                                    className={`bi ${m.read_at ? 'bi-check2-all is-read' : 'bi-check2'}`}
                                                                    aria-label={m.read_at ? t('messages.read') : t('messages.sent')}
                                                                    title={m.read_at ? t('messages.read') : t('messages.sent')}
                                                                ></i>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>

                                {sendError && (
                                    <div className="alert alert-danger py-2 mx-3 mb-0" role="alert">
                                        {sendError}
                                    </div>
                                )}

                                <form
                                    className="ns-chat-composer"
                                    onSubmit={(e) => {
                                        e.preventDefault()
                                        send()
                                    }}
                                >
                                    <textarea
                                        ref={composerRef}
                                        rows={1}
                                        value={draft}
                                        maxLength={MESSAGE_MAX_LENGTH}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={t('messages.placeholder')}
                                        aria-label={t('messages.placeholder')}
                                    />
                                    {draft.length > MESSAGE_MAX_LENGTH - 200 && (
                                        <span className="ns-chat-count">
                                            {draft.length}/{MESSAGE_MAX_LENGTH}
                                        </span>
                                    )}
                                    <button
                                        type="submit"
                                        className="ns-chat-send"
                                        disabled={sending || !draft.trim()}
                                        aria-label={t('common.send')}
                                        title={t('messages.sendHint')}
                                    >
                                        <i className={`bi ${sending ? 'bi-hourglass-split' : 'bi-send-fill'}`}></i>
                                    </button>
                                </form>
                            </>
                        )}
                    </section>
                </div>
            )}
        </>
    )
}
