import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { createNotification } from '../../../lib/notifications'
import { AdvisorComposer, AdvisorHome, AdvisorTopBar, RonyTyping } from './AdvisorChrome'
import AuditTable from './AuditTable'
import { blocksFrom, clearHistory, linkHandler, persistableBlocks, revealReply } from './chatBlocks'
import OwnerChart from './OwnerChart'
import RonyReply from './RonyReply'
import { OWNER_TOPICS, useAdvisorLiveCards } from './useAdvisorContext'

// Older chats opened with this automatic question; it stays hidden when
// those chats are loaded. New chats start on the welcome screen instead.
const KICKOFF_MESSAGE = 'Give me a quick overview of my portfolio and tell me what needs attention first.'
const COMPACT_WELCOME_TEXT = 'Hi, ask me about **rent collection**, your leases or your tenants.'
const COMPACT_STARTERS = ['Who is late on rent?', 'How much will I still collect this year?', 'Which lease ends soonest?']
const HISTORY_LIMIT = 20

function computeChips(intent) {
    if (intent === 'analyze' || intent === 'audit') {
        return ['Who is late on rent?', 'How much will I still collect this year?', 'Improve my listings']
    }
    if (intent === 'draft_message') {
        return ['Draft another message', 'What else needs attention?']
    }
    if (intent === 'simulate') {
        return ['Try a different rent change', 'What else needs attention?']
    }
    return ['What needs my attention?', 'Who is late on rent?', 'Improve my listings']
}

export default function OwnerAdvisor({ firstName, onNavigate, seed, onSeedConsumed, compact = false }) {
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [messages, setMessages] = useState([])
    const [chatLog, setChatLog] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [copiedIndex, setCopiedIndex] = useState(null)
    const [actionStatus, setActionStatus] = useState({})
    const scrollRef = useRef(null)
    const liveCards = useAdvisorLiveCards('property-owner', !compact)

    useEffect(() => {
        let cancelled = false

        const loadHistory = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser()

            if (cancelled) return
            if (!user) {
                setHistoryLoaded(true)
                return
            }

            // Newest first so the limit keeps the most recent turns (ascending
            // + limit would keep the oldest ones and hide everything after),
            // then flipped back into reading order. message_id breaks ties
            // between the user/model rows inserted together in one call.
            const { data: newestFirst, error: historyError } = await supabase
                .from('advisor_messages')
                .select('role, content, payload, created_at')
                .eq('user_auth_id', user.id)
                .order('created_at', { ascending: false })
                .order('message_id', { ascending: false })
                .limit(HISTORY_LIMIT)

            if (cancelled) return

            let data = newestFirst ? [...newestFirst].reverse() : newestFirst
            // The limit can cut a turn in half; never start on a model reply
            // whose user message was left out.
            while (data && data.length > 0 && data[0].role !== 'user') data = data.slice(1)

            if (historyError || !data || data.length === 0) {
                setHistoryLoaded(true)
                return
            }

            const loadedChatLog = []
            data.forEach((row) => {
                if (row.role === 'user') {
                    const isSilentKickoff = row.content === KICKOFF_MESSAGE
                    if (!isSilentKickoff) {
                        loadedChatLog.push({ type: 'user', text: row.content })
                    }
                    return
                }

                const payload = row.payload || {}
                loadedChatLog.push({
                    type: 'assistant',
                    text: row.content,
                    at: row.created_at,
                    ...blocksFrom(payload),
                    draft: payload.draft || null,
                    chart: payload.chart || null,
                    stats: payload.stats || null,
                    simulation: payload.simulation || null,
                    intent: payload.intent || null,
                    highlightPropertyId: payload.highlightPropertyId || null,
                    highlightContractId: payload.highlightContractId || null,
                    recipientDui: payload.recipientDui || null,
                    audit: payload.audit || null,
                })
            })

            setMessages(data.map((row) => ({ role: row.role, content: row.content })))
            setChatLog(loadedChatLog)
            setHistoryLoaded(true)
        }

        loadHistory()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [chatLog, loading])

    const persistTurn = async (accessTokenUserId, userText, modelText, payload) => {
        if (!accessTokenUserId) return
        const { error: insertError } = await supabase.from('advisor_messages').insert([
            { user_auth_id: accessTokenUserId, role: 'user', content: userText },
            { user_auth_id: accessTokenUserId, role: 'model', content: modelText, payload },
        ])
        if (insertError) {
            console.error('Advisor: could not save chat history', insertError)
        }
    }

    const sendTurn = async ({ userVisibleText }) => {
        if (loading) return
        setError('')
        setLoading(true)

        const nextMessages = [...messages, { role: 'user', content: userVisibleText }]
        setMessages(nextMessages)
        setChatLog((prev) => [...prev, { type: 'user', text: userVisibleText }])

        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData?.session?.access_token
        const userId = sessionData?.session?.user?.id

        if (!accessToken) {
            setLoading(false)
            setError('Your session expired. Please sign in again.')
            return
        }

        try {
            const response = await fetch('/api/advisor', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    role: 'property-owner',
                    messages: nextMessages,
                }),
            })

            const result = await response.json()
            if (!response.ok) {
                throw new Error(result.error || 'Something went wrong. Please try again.')
            }

            const blocks = blocksFrom(result, computeChips(result.intent))
            setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }])
            setChatLog((prev) => [
                ...prev,
                {
                    type: 'assistant',
                    text: result.reply,
                    at: new Date().toISOString(),
                    fresh: true,
                    ...blocks,
                    draft: result.draft || null,
                    chart: result.chart || null,
                    stats: result.stats || null,
                    simulation: result.simulation || null,
                    intent: result.intent || null,
                    highlightPropertyId: result.highlightPropertyId || null,
                    highlightContractId: result.highlightContractId || null,
                    recipientDui: result.recipientDui || null,
                    audit: result.audit || null,
                },
            ])
            persistTurn(userId, userVisibleText, result.reply, {
                draft: result.draft || null,
                chart: result.chart || null,
                stats: result.stats || null,
                simulation: result.simulation || null,
                intent: result.intent || null,
                highlightPropertyId: result.highlightPropertyId || null,
                highlightContractId: result.highlightContractId || null,
                recipientDui: result.recipientDui || null,
                audit: result.audit || null,
                ...persistableBlocks(blocks),
            })
        } catch (err) {
            setError(err.message || 'Could not reach Rony. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handleComposerSubmit = () => {
        const text = input.trim()
        if (!text || loading) return
        setInput('')
        sendTurn({ userVisibleText: text })
    }

    const ask = (text) => {
        if (loading) return
        sendTurn({ userVisibleText: text })
    }

    const handleNewChat = async () => {
        const { error: deleteError } = await clearHistory()
        if (deleteError) {
            setError('Could not clear the conversation. Please try again.')
            return
        }
        setChatLog([])
        setMessages([])
        setActionStatus({})
        setError('')
    }

    // Arriving here from a page-level "Ask Rony" action (a contract, a payment
    // reminder): pre-fill the composer with a default question instead of
    // sending it right away, so the user can read, edit, or just hit send.
    useEffect(() => {
        if (!historyLoaded || !seed) return
        setInput(seed.text || '')
        onSeedConsumed?.()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historyLoaded, seed])

    const copyDraft = async (text, index) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopiedIndex(index)
            setTimeout(() => setCopiedIndex((prev) => (prev === index ? null : prev)), 2000)
        } catch {
            // Clipboard access can be blocked by the browser; the text is still
            // selectable and readable in the draft box, so this is not fatal.
        }
    }

    const handleRewrite = (row) => {
        if (loading) return
        sendTurn({ userVisibleText: `Rewrite the description for ${row.property_name}.` })
    }

    const handleSaveListing = async (item, index) => {
        if (!item.highlightPropertyId || !item.draft) return
        setActionStatus((prev) => ({ ...prev, [index]: { kind: 'pending' } }))

        const { error: updateError } = await supabase
            .from('add_business')
            .update({ description: item.draft })
            .eq('property_id', item.highlightPropertyId)
            .select()

        if (updateError) {
            setActionStatus((prev) => ({ ...prev, [index]: { kind: 'error', text: 'Could not save the listing.' } }))
            return
        }

        setActionStatus((prev) => ({ ...prev, [index]: { kind: 'success', text: 'Saved to listing' } }))
    }

    const handleSendMessage = async (item, index) => {
        if (!item.recipientDui || !item.draft || !item.highlightContractId) return
        setActionStatus((prev) => ({ ...prev, [index]: { kind: 'pending' } }))

        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
            setActionStatus((prev) => ({ ...prev, [index]: { kind: 'error', text: 'Could not send the message.' } }))
            return
        }

        const { data: userRow, error: userError } = await supabase
            .from('users')
            .select('dui')
            .eq('id_supabase_auth', user.id)
            .single()

        if (userError || !userRow) {
            setActionStatus((prev) => ({ ...prev, [index]: { kind: 'error', text: 'Could not send the message.' } }))
            return
        }

        const { error: notifyError } = await createNotification({
            recipientDui: item.recipientDui,
            senderDui: userRow.dui,
            process: 'Advisor',
            title: 'Message from your property owner',
            description: item.draft,
            contractId: item.highlightContractId,
        })

        if (notifyError) {
            setActionStatus((prev) => ({ ...prev, [index]: { kind: 'error', text: 'Could not send the message.' } }))
            return
        }

        setActionStatus((prev) => ({ ...prev, [index]: { kind: 'success', text: 'Message sent' } }))
    }

    if (!historyLoaded) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading your conversation...</p>
            </div>
        )
    }

    const onLink = linkHandler(onNavigate)
    const lastAssistant = chatLog.reduce((last, item, i) => (item.type === 'assistant' ? i : last), -1)
    const isEmpty = chatLog.length === 0 && !loading

    const renderDraft = (item, i) => (
        <div className="advisor-draft">
            <span className="advisor-draft-label">
                <i className="bi bi-pencil-square"></i> {item.intent === 'rewrite_listing' ? 'New description' : 'Draft message'}
            </span>
            <p>{item.draft}</p>
            <div className="advisor-draft-actions">
                <button type="button" className="advisor-draft-copy" onClick={() => copyDraft(item.draft, i)}>
                    <i className="bi bi-clipboard"></i> {copiedIndex === i ? 'Copied' : 'Copy'}
                </button>
                {item.intent === 'rewrite_listing' && item.highlightPropertyId && actionStatus[i]?.kind !== 'success' && (
                    <button
                        type="button"
                        className="advisor-draft-copy is-primary"
                        onClick={() => handleSaveListing(item, i)}
                        disabled={actionStatus[i]?.kind === 'pending'}
                    >
                        <i className="bi bi-check2"></i> Save to listing
                    </button>
                )}
                {item.intent === 'draft_message' &&
                    item.recipientDui &&
                    item.highlightContractId &&
                    actionStatus[i]?.kind !== 'success' && (
                        <button
                            type="button"
                            className="advisor-draft-copy is-primary"
                            onClick={() => handleSendMessage(item, i)}
                            disabled={actionStatus[i]?.kind === 'pending'}
                        >
                            <i className="bi bi-send"></i> Send
                        </button>
                    )}
            </div>
            {actionStatus[i]?.kind === 'success' && (
                <p className="advisor-action-success">
                    <i className="bi bi-check-circle"></i> {actionStatus[i].text}
                </p>
            )}
            {actionStatus[i]?.kind === 'error' && (
                <div className="alert alert-danger py-1 px-2 mb-0 mt-2" style={{ fontSize: '11.5px' }}>
                    {actionStatus[i].text}
                </div>
            )}
        </div>
    )

    return (
        <div className={`advisor-shell ${compact ? 'is-compact' : ''}`}>
            {!compact && (
                <AdvisorTopBar
                    subtitle="Knows your properties, tenants and rent"
                    canReset={chatLog.length > 0}
                    onNewChat={handleNewChat}
                />
            )}

            <div className={`advisor-stream ${isEmpty && !compact ? 'is-home' : ''}`} ref={scrollRef}>
                {isEmpty && !compact && (
                    <AdvisorHome
                        firstName={firstName}
                        intro="I watch your properties, tenants and rent, and help you act on what matters."
                        liveCards={liveCards}
                        topics={OWNER_TOPICS}
                        onAsk={ask}
                    />
                )}

                {isEmpty && compact && (
                    <RonyReply item={{ text: COMPACT_WELCOME_TEXT, followUps: COMPACT_STARTERS }} onFollowUp={ask} />
                )}

                {chatLog.map((item, i) => {
                    if (item.type === 'user') {
                        return (
                            <div key={i} className="advisor-msg advisor-msg-user">
                                <div className="advisor-bubble">
                                    <p>{item.text}</p>
                                </div>
                            </div>
                        )
                    }

                    return (
                        <RonyReply
                            key={i}
                            item={item}
                            onLink={onLink}
                            onFollowUp={ask}
                            showFollowUps={i === lastAssistant && !loading}
                            disabled={loading}
                            onSettled={(el) => revealReply(scrollRef.current, el)}
                        >
                            {item.intent === 'audit' && item.audit && (
                                <AuditTable audit={item.audit} onRewrite={handleRewrite} disabled={loading} />
                            )}
                            {item.draft && renderDraft(item, i)}
                            <OwnerChart chart={item.chart} stats={item.stats} simulation={item.simulation} />
                        </RonyReply>
                    )
                })}

                {loading && <RonyTyping />}
            </div>

            {error && (
                <div className="alert alert-danger py-2 mb-0" role="alert">
                    {error}
                </div>
            )}

            <AdvisorComposer
                value={input}
                onChange={setInput}
                onSubmit={handleComposerSubmit}
                disabled={loading}
                placeholder="Ask about your portfolio, tenants or listings..."
            />
        </div>
    )
}
