import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import RonyAvatar from '../../RonyAvatar'
import AdvisorForm from './AdvisorForm'
import FilterPill from './FilterPill'
import PropertyResultCard from './PropertyResultCard'
import SuggestedChips from './SuggestedChips'

const WELCOME_TEXT =
    'Hi, I can help you find a commercial space from the listings on NextSpace.'

const RELAXED_LABELS = {
    required_services: 'dropped the required services',
    municipality: 'searched the whole department instead of one municipality',
    budget_max_15: 'raised the budget by 15%',
    budget_max_30: 'raised the budget by 30%',
    property_type_other: 'included other property types',
}

function computeChips(lastTurn) {
    if (!lastTurn) return []

    if (lastTurn.intent === 'search' || lastTurn.intent === 'refine') {
        if (lastTurn.resultsCount === 0) {
            return ['Raise my budget', 'Try a different area']
        }
        const chips = ['Something cheaper', 'Why that one?', 'What should I check before signing?']
        if (lastTurn.relaxedCount > 0) chips.push('Widen the search more')
        return chips
    }

    if (lastTurn.intent === 'explain') {
        return ['Something cheaper', 'Any other options?']
    }

    return ['Something cheaper', 'What should I check before signing?']
}

export default function BusinessAdvisor() {
    const [servicesCatalog, setServicesCatalog] = useState([])
    const [formOpen, setFormOpen] = useState(true)
    const [filter, setFilter] = useState(null)
    const [results, setResults] = useState([])
    const [relaxed, setRelaxed] = useState([])
    const [messages, setMessages] = useState([])
    const [chatLog, setChatLog] = useState([])
    const [chips, setChips] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const scrollRef = useRef(null)

    useEffect(() => {
        let cancelled = false

        supabase
            .from('services')
            .select('service_id, service_name')
            .order('service_id')
            .then(({ data, error: fetchError }) => {
                if (cancelled || fetchError) return
                setServicesCatalog(data || [])
            })

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [chatLog, loading])

    const sendTurn = async ({ formFilter, userVisibleText }) => {
        if (loading) return

        setError('')
        setLoading(true)
        setFormOpen(false)

        const nextMessages = [...messages, { role: 'user', content: userVisibleText }]
        setMessages(nextMessages)
        setChatLog((prev) => [...prev, { type: 'user', text: userVisibleText }])

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
                    role: 'business',
                    messages: nextMessages,
                    filter,
                    results,
                    relaxed,
                    formFilter: formFilter || undefined,
                }),
            })

            const result = await response.json()
            if (!response.ok) {
                throw new Error(result.error || 'Something went wrong. Please try again.')
            }

            setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }])
            setFilter(result.filter ?? null)
            setResults(result.results ?? [])
            setRelaxed(result.relaxed ?? [])

            const isSearch = result.intent === 'search' || result.intent === 'refine'
            setChatLog((prev) => {
                const next = [
                    ...prev,
                    { type: 'assistant', text: result.reply, relaxed: isSearch ? result.relaxed || [] : [] },
                ]
                if (isSearch) {
                    next.push({
                        type: 'results',
                        items: result.results || [],
                        highlight: result.highlight || [],
                    })
                }
                return next
            })

            setChips(
                computeChips({
                    intent: result.intent,
                    resultsCount: (result.results || []).length,
                    relaxedCount: (result.relaxed || []).length,
                })
            )
        } catch (err) {
            setError(err.message || 'Could not reach Rony. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handleFormSubmit = (formFilter, description) => {
        sendTurn({ formFilter, userVisibleText: description })
    }

    const handleComposerSubmit = (e) => {
        e.preventDefault()
        const text = input.trim()
        if (!text) return
        setInput('')
        sendTurn({ userVisibleText: text })
    }

    const handleChipPick = (text) => {
        setChips([])
        sendTurn({ userVisibleText: text })
    }

    return (
        <>
            <div className="advisor-header ns-dash-header">
                <div>
                    <h1>AI Advisor</h1>
                    <p>Chat with Rony about your next space.</p>
                </div>
            </div>

            <div className="advisor-shell">
                {filter && !formOpen && (
                    <FilterPill
                        filter={filter}
                        servicesCatalog={servicesCatalog}
                        onEdit={() => setFormOpen(true)}
                    />
                )}

                {filter && formOpen && (
                    <div className="advisor-edit-form">
                        <AdvisorForm
                            initialFilter={filter}
                            servicesCatalog={servicesCatalog}
                            onSubmit={handleFormSubmit}
                        />
                    </div>
                )}

                <div className="advisor-stream" ref={scrollRef}>
                    <div className="advisor-msg advisor-msg-assistant">
                        <div className="advisor-avatar">
                            <RonyAvatar size={30} />
                        </div>
                        <div className="advisor-bubble">
                            <p>{WELCOME_TEXT}</p>
                        </div>
                    </div>

                    {!filter && formOpen && (
                        <div className="advisor-msg advisor-msg-assistant">
                            <div className="advisor-avatar">
                                <RonyAvatar size={30} />
                            </div>
                            <div className="advisor-bubble advisor-bubble-form">
                                <AdvisorForm
                                    initialFilter={filter}
                                    servicesCatalog={servicesCatalog}
                                    onSubmit={handleFormSubmit}
                                />
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
                        if (item.type === 'assistant') {
                            return (
                                <div key={i} className="advisor-msg advisor-msg-assistant">
                                    <div className="advisor-avatar">
                                        <RonyAvatar size={30} />
                                    </div>
                                    <div className="advisor-bubble">
                                        <p>{item.text}</p>
                                        {item.relaxed?.length > 0 && (
                                            <p className="advisor-relaxed-note">
                                                <i className="bi bi-funnel"></i>{' '}
                                                {item.relaxed.map((key) => RELAXED_LABELS[key] || key).join(', ')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )
                        }
                        if (item.type === 'results') {
                            if (item.items.length === 0) return null
                            return (
                                <div key={i} className="advisor-results-grid">
                                    {item.items.map((property) => (
                                        <PropertyResultCard
                                            key={property.property_id}
                                            property={property}
                                            isHighlighted={item.highlight.includes(property.property_id)}
                                        />
                                    ))}
                                </div>
                            )
                        }
                        return null
                    })}

                    {loading && (
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
                        placeholder="Ask anything, or say what to change..."
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
