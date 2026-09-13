import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import RonyAvatar from '../../RonyAvatar'
import OwnerChart from './OwnerChart'
import SuggestedChips from './SuggestedChips'

const KICKOFF_MESSAGE = 'Give me a quick overview of my portfolio and tell me what needs attention first.'

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
    const [messages, setMessages] = useState([])
    const [chatLog, setChatLog] = useState([])
    const [chips, setChips] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [copiedIndex, setCopiedIndex] = useState(null)
    const scrollRef = useRef(null)

    useEffect(() => {
        sendTurn({ userVisibleText: KICKOFF_MESSAGE, silent: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [chatLog, loading])

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
                },
            ])
            setChips(computeChips(result.intent))
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
                                    {item.draft && (
                                        <div className="advisor-draft">
                                            <p>{item.draft}</p>
                                            <button type="button" className="advisor-draft-copy" onClick={() => copyDraft(item.draft, i)}>
                                                <i className="bi bi-clipboard"></i> {copiedIndex === i ? 'Copied' : 'Copy'}
                                            </button>
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
