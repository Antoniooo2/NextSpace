import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { createNotification } from '../../../lib/notifications'
import RonyAvatar from '../../RonyAvatar'
import OwnerChart from './OwnerChart'
import SuggestedChips from './SuggestedChips'
import AuditTable from './AuditTable'

const KICKOFF_MESSAGE = 'Give me a quick overview of my portfolio and tell me what needs attention first.'
const HISTORY_LIMIT = 20

function computeChips(intent) {
    if (intent === 'analyze' || intent === 'audit') {
        return ['Why are they vacant?', 'Improve my listings', 'Who owes me money?']
    }
    if (intent === 'draft_message') {
        return ['Draft another message', 'What else needs attention?']
    }
    if (intent === 'simulate') {
        return ['Try a different rent change', 'What else needs attention?']
    }
    return ['What needs my attention?', 'Improve my listings']
}

export default function OwnerAdvisor() {
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [messages, setMessages] = useState([])
    const [chatLog, setChatLog] = useState([])
    const [chips, setChips] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [copiedIndex, setCopiedIndex] = useState(null)
    const [actionStatus, setActionStatus] = useState({})
    const scrollRef = useRef(null)

    useEffect(() => {
        let cancelled = false

        const loadHistory = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser()

            if (cancelled) return
            if (!user) {
                setHistoryLoaded(true)
                sendTurn({ userVisibleText: KICKOFF_MESSAGE, silent: true })
                return
            }

            const { data, error: historyError } = await supabase
                .from('advisor_messages')
                .select('role, content, payload, created_at')
                .eq('user_auth_id', user.id)
                .order('created_at', { ascending: true })
                .limit(HISTORY_LIMIT)

            if (cancelled) return

            if (historyError || !data || data.length === 0) {
                setHistoryLoaded(true)
                sendTurn({ userVisibleText: KICKOFF_MESSAGE, silent: true })
                return
            }

            const loadedChatLog = []
            data.forEach((row, index) => {
                if (row.role === 'user') {
                    const isSilentKickoff = index === 0 && row.content === KICKOFF_MESSAGE
                    if (!isSilentKickoff) {
                        loadedChatLog.push({ type: 'user', text: row.content })
                    }
                    return
                }

                const payload = row.payload || {}
                loadedChatLog.push({
                    type: 'assistant',
                    text: row.content,
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const sendTurn = async ({ userVisibleText, silent }) => {
        setError('')
        setLoading(true)

        const nextMessages = [...messages, { role: 'user', content: userVisibleText }]
        setMessages(nextMessages)
        if (!silent) {
            setChatLog((prev) => [...prev, { type: 'user', text: userVisibleText }])
        }

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

            setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }])
            setChatLog((prev) => [
                ...prev,
                {
                    type: 'assistant',
                    text: result.reply,
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
            setChips(computeChips(result.intent))

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
            })
        } catch (err) {
            setError(err.message || 'Could not reach Rony. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handleComposerSubmit = (e) => {
        e.preventDefault()
        const text = input.trim()
        if (!text || loading) return
        setInput('')
        sendTurn({ userVisibleText: text })
    }

    const handleChipPick = (text) => {
        if (loading) return
        setChips([])
        sendTurn({ userVisibleText: text })
    }

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

    return (
        <>
            <div className="advisor-header ns-dash-header">
                <div>
                    <h1>AI Advisor</h1>
                    <p>Rony reviews your portfolio and tells you what needs attention.</p>
                </div>
            </div>

            <div className="advisor-shell">
                <div className="advisor-stream" ref={scrollRef}>
                    {chatLog.length === 0 && loading && (
                        <div className="advisor-msg advisor-msg-assistant">
                            <div className="advisor-avatar">
                                <RonyAvatar size={30} />
                            </div>
                            <div className="advisor-bubble advisor-typing">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    )}

                    {chatLog.map((item, i) => {
                        if (item.type === 'user') {
                            return (
                                <div key={i} className="advisor-msg advisor-msg-user">
                                    <div className="advisor-user-avatar">You</div>
                                    <div className="advisor-bubble">
                                        <p>{item.text}</p>
                                    </div>
                                </div>
                            )
                        }

                        return (
                            <div key={i} className="advisor-msg advisor-msg-assistant">
                                <div className="advisor-avatar">
                                    <RonyAvatar size={30} />
                                </div>
                                <div className="advisor-bubble">
                                    <p>{item.text}</p>
                                    {item.intent === 'audit' && item.audit && (
                                        <AuditTable audit={item.audit} onRewrite={handleRewrite} disabled={loading} />
                                    )}
                                    {item.draft && (
                                        <div className="advisor-draft">
                                            <p>{item.draft}</p>
                                            <div className="advisor-draft-actions">
                                                <button type="button" className="advisor-draft-copy" onClick={() => copyDraft(item.draft, i)}>
                                                    <i className="bi bi-clipboard"></i> {copiedIndex === i ? 'Copied' : 'Copy'}
                                                </button>
                                                {item.intent === 'rewrite_listing' &&
                                                    item.highlightPropertyId &&
                                                    actionStatus[i]?.kind !== 'success' && (
                                                        <button
                                                            type="button"
                                                            className="advisor-draft-copy"
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
                                                            className="advisor-draft-copy"
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
                                    )}
                                    <OwnerChart chart={item.chart} stats={item.stats} simulation={item.simulation} />
                                </div>
                            </div>
                        )
                    })}

                    {loading && chatLog.length > 0 && (
                        <div className="advisor-msg advisor-msg-assistant">
                            <div className="advisor-avatar">
                                <RonyAvatar size={30} />
                            </div>
                            <div className="advisor-bubble advisor-typing">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="alert alert-danger py-2" role="alert">
                        {error}
                    </div>
                )}

                <SuggestedChips chips={chips} onPick={handleChipPick} disabled={loading} />

                <form className="advisor-composer" onSubmit={handleComposerSubmit}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about your portfolio, or what to change..."
                        disabled={loading}
                    />
                    <button type="submit" className="advisor-composer-send" disabled={loading || !input.trim()}>
                        <i className="bi bi-send"></i>
                    </button>
                </form>
            </div>
        </>
    )
}
