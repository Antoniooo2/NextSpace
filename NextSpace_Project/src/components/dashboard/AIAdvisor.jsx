import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const WELCOME_MESSAGE = {
    'property-owner':
        "Hi, I'm Rony. Ask me about your listings and I'll tell you what deserves attention first.",
    business:
        "Hi, I'm Rony. Tell me what kind of space you're looking for -- budget, type, location -- and I'll help narrow it down.",
}

function describeFilter(filter) {
    if (!filter) return null
    const parts = []
    if (filter.property_type?.length) parts.push(filter.property_type.join(', '))
    if (filter.municipality) parts.push(filter.municipality)
    if (filter.department) parts.push(filter.department)
    if (filter.budget_min != null) parts.push(`from $${filter.budget_min}`)
    if (filter.budget_max != null) parts.push(`up to $${filter.budget_max}`)
    return parts.length > 0 ? parts.join(' · ') : null
}

export default function AIAdvisor({ accountType }) {
    const [messages, setMessages] = useState(() => [
        { role: 'assistant', content: WELCOME_MESSAGE[accountType] || WELCOME_MESSAGE.business },
    ])
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [filter, setFilter] = useState(null)
    const scrollRef = useRef(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, sending])

    const handleSend = async (e) => {
        e.preventDefault()
        const text = input.trim()
        if (!text || sending) return

        const nextMessages = [...messages, { role: 'user', content: text }]
        setMessages(nextMessages)
        setInput('')
        setSending(true)
        setError('')

        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData?.session?.access_token

        if (!accessToken) {
            setSending(false)
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
                    role: accountType,
                    messages: nextMessages.map(({ role, content }) => ({ role, content })),
                    filter,
                }),
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Something went wrong. Please try again.')
            }

            const isFilterIntent = result.intent === 'search' || result.intent === 'refine'
            if (isFilterIntent && result.filter) {
                setFilter(result.filter)
            }

            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: result.reply,
                    filter: isFilterIntent ? result.filter : null,
                    missing: result.missing,
                },
            ])
        } catch (err) {
            setError(err.message || 'Could not reach Rony. Please try again.')
        } finally {
            setSending(false)
        }
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>AI Advisor</h1>
                    <p>Chat with Rony about {accountType === 'property-owner' ? 'your listings' : 'your next space'}.</p>
                </div>
            </div>

            <div className="ns-advisor-chat">
                <div className="ns-advisor-messages" ref={scrollRef}>
                    {messages.map((m, i) => {
                        const filterSummary = describeFilter(m.filter)
                        return (
                            <div key={i} className={`ns-advisor-msg ns-advisor-msg-${m.role}`}>
                                {m.role === 'assistant' && (
                                    <div className="ns-advisor-avatar">
                                        <i className="bi bi-stars"></i>
                                    </div>
                                )}
                                <div className="ns-advisor-bubble">
                                    <p>{m.content}</p>
                                    {filterSummary && (
                                        <div className="ns-advisor-filter-chip">
                                            <i className="bi bi-funnel"></i> {filterSummary}
                                        </div>
                                    )}
                                    {m.missing?.length > 0 && (
                                        <p className="ns-advisor-missing">Still need: {m.missing.join(', ')}</p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                    {sending && (
                        <div className="ns-advisor-msg ns-advisor-msg-assistant">
                            <div className="ns-advisor-avatar">
                                <i className="bi bi-stars"></i>
                            </div>
                            <div className="ns-advisor-bubble ns-advisor-typing">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="alert alert-danger py-2 ns-advisor-error" role="alert">
                        {error}
                    </div>
                )}

                <form className="ns-advisor-input-row" onSubmit={handleSend}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Rony anything..."
                        disabled={sending}
                    />
                    <button type="submit" className="ns-filled-btn ns-advisor-send-btn" disabled={sending || !input.trim()}>
                        <i className="bi bi-send"></i>
                    </button>
                </form>
            </div>
        </>
    )
}
