import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import AdvisorForm from './AdvisorForm'
import { AdvisorComposer, AdvisorHome, AdvisorTopBar, RonyTyping } from './AdvisorChrome'
import BusinessChart from './BusinessChart'
import { blocksFrom, clearHistory, linkHandler, persistableBlocks, revealReply } from './chatBlocks'
import CompareTable from './CompareTable'
import FilterPill from './FilterPill'
import PropertyResultCard from './PropertyResultCard'
import RonyReply from './RonyReply'
import { BUSINESS_TOPICS, useAdvisorLiveCards } from './useAdvisorContext'

// Shown in the side panel over Payments, where questions are about rent.
const COMPACT_WELCOME_TEXT =
    'Hi, ask me about your **rent**, your **leases** or your payments — or about finding another space.'
const COMPACT_STARTERS = ['When is my next payment due?', 'Am I late on anything?', 'When does my lease end?']

const RELAXED_LABELS = {
    required_services: 'dropped the required services',
    municipality: 'searched the whole department instead of one municipality',
    budget_max_15: 'raised the budget by 15%',
    budget_max_30: 'raised the budget by 30%',
    property_type_other: 'included other property types',
}

const HISTORY_LIMIT = 20

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

    if (lastTurn.intent === 'account') {
        return ['How much do I still owe this year?', 'When is my next payment due?', 'Am I late on anything?']
    }

    return ['Something cheaper', 'What should I check before signing?']
}

// A rent answer always offers a way to Payments, even when the model didn't
// add the button itself (and for answers saved before buttons existed).
function linksWithPayments(links = [], paymentsLink) {
    if (!paymentsLink || links.some((l) => l.target === 'payments')) return links
    return [{ label: 'Open Payments', target: 'payments', contractId: paymentsLink.contractId ?? null }, ...links].slice(0, 2)
}

function buildResultsBlock(payload) {
    return {
        type: 'results',
        items: payload.results || [],
        highlight: payload.highlight || [],
        chart: payload.chart || null,
        budgetMax: payload.filter?.budget_max ?? null,
    }
}

export default function BusinessAdvisor({ firstName, onViewProperty, onNavigate, seed, onSeedConsumed, compact = false }) {
    const [servicesCatalog, setServicesCatalog] = useState([])
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [formOpen, setFormOpen] = useState(true)
    const [filter, setFilter] = useState(null)
    const [results, setResults] = useState([])
    const [relaxed, setRelaxed] = useState([])
    const [messages, setMessages] = useState([])
    const [chatLog, setChatLog] = useState([])
    const [input, setInput] = useState('')
    const [pendingAttachment, setPendingAttachment] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [searchFormOpen, setSearchFormOpen] = useState(false)
    const scrollRef = useRef(null)
    const liveCards = useAdvisorLiveCards('business', !compact)
    // React does not run a setState updater synchronously, so anything computed
    // inside one (like the highlight-move logic below) is not readable right
    // after the call. This ref mirrors chatLog so sendTurn can build the next
    // array as a plain synchronous value instead, and read the result
    // immediately for persistTurn.
    const chatLogRef = useRef([])

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
            let lastFilter = null
            let lastResults = []
            let lastRelaxed = []

            for (const row of data) {
                if (row.role === 'user') {
                    loadedChatLog.push({ type: 'user', text: row.content, attachment: row.payload?.attachment || null })
                    continue
                }

                const payload = row.payload || {}
                loadedChatLog.push({
                    type: 'assistant',
                    text: row.content,
                    at: row.created_at,
                    relaxed: payload.isSearchTurn ? payload.relaxed || [] : [],
                    ...blocksFrom(payload),
                    links: linksWithPayments(payload.links, payload.paymentsLink),
                })
                if (payload.isSearchTurn) {
                    loadedChatLog.push(buildResultsBlock(payload))
                }

                lastFilter = payload.filter ?? null
                lastResults = payload.results || []
                lastRelaxed = payload.relaxed || []
            }

            setMessages(data.map((row) => ({ role: row.role, content: row.content })))
            chatLogRef.current = loadedChatLog
            setChatLog(loadedChatLog)
            setFilter(lastFilter)
            setResults(lastResults)
            setRelaxed(lastRelaxed)
            setFormOpen(false)
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

    const persistTurn = async (accessTokenUserId, userText, modelText, payload, attachment) => {
        if (!accessTokenUserId) return
        const { error: insertError } = await supabase.from('advisor_messages').insert([
            {
                user_auth_id: accessTokenUserId,
                role: 'user',
                content: userText,
                payload: attachment ? { attachment } : null,
            },
            { user_auth_id: accessTokenUserId, role: 'model', content: modelText, payload },
        ])
        if (insertError) {
            console.error('Advisor: could not save chat history', insertError)
        }
    }

    const sendTurn = async ({ formFilter, userVisibleText, resultsOverride, attachment }) => {
        if (loading) return

        setError('')
        setLoading(true)
        setFormOpen(false)

        const nextMessages = [...messages, { role: 'user', content: userVisibleText }]
        setMessages(nextMessages)
        chatLogRef.current = [...chatLogRef.current, { type: 'user', text: userVisibleText, attachment: attachment || null }]
        setChatLog(chatLogRef.current)

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
                    role: 'business',
                    messages: nextMessages,
                    filter,
                    results: resultsOverride ?? results,
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
            // An answer about their own rent gets a shortcut to Payments, on
            // the lease it was about when Rony said which one.
            const paymentsLink =
                result.intent === 'account' && result.hasActiveLease ? { contractId: result.contractId ?? null } : null

            const blocks = blocksFrom(
                result,
                computeChips({
                    intent: result.intent,
                    resultsCount: (result.results || []).length,
                    relaxedCount: (result.relaxed || []).length,
                })
            )
            blocks.links = linksWithPayments(blocks.links, paymentsLink)

            let next = [
                ...chatLogRef.current,
                {
                    type: 'assistant',
                    text: result.reply,
                    at: new Date().toISOString(),
                    fresh: true,
                    relaxed: isSearch ? result.relaxed || [] : [],
                    ...blocks,
                },
            ]

            let finalHighlight = result.highlight || []
            let finalResults = result.results || []
            let finalChart = result.chart || null

            if (isSearch) {
                next.push(buildResultsBlock(result))
            } else if (result.highlight?.length > 0) {
                // An explain/general turn can still point back at a result
                // already on screen ("why do you recommend that one?"). Move
                // the pick to the most recent results block instead of
                // leaving whatever was highlighted during the original search.
                const lastResultsIndex = [...next].reverse().findIndex((item) => item.type === 'results')
                if (lastResultsIndex !== -1) {
                    const index = next.length - 1 - lastResultsIndex
                    const targetItem = next[index]
                    const validIds = new Set(targetItem.items.map((p) => p.property_id))
                    const newHighlight = result.highlight.filter((id) => validIds.has(id))
                    if (newHighlight.length > 0) {
                        next = [...next]
                        next[index] = { ...targetItem, highlight: newHighlight }
                        finalHighlight = newHighlight
                        finalResults = targetItem.items
                        finalChart = targetItem.chart
                    }
                }
            }

            const persistPayload = {
                paymentsLink,
                isSearchTurn: isSearch,
                relaxed: result.relaxed || [],
                filter: result.filter ?? null,
                results: finalResults,
                highlight: finalHighlight,
                chart: finalChart,
                ...persistableBlocks(blocks),
            }

            chatLogRef.current = next
            setChatLog(next)

            persistTurn(userId, userVisibleText, result.reply, persistPayload, attachment)
        } catch (err) {
            setError(err.message || 'Could not reach Rony. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handleFormSubmit = (formFilter, description) => {
        sendTurn({ formFilter, userVisibleText: description })
    }

    // Arriving here from a page-level "Ask Rony" action (a property detail page,
    // a contract, a payment): pre-fill the composer with a default question
    // instead of sending it right away, so the user can read, edit, or just
    // hit send. When the seed carries a property, attach it to the composer
    // like a file attachment - it rides along once the message is sent.
    useEffect(() => {
        if (!historyLoaded || !seed) return

        setFormOpen(false)
        setInput(seed.text || '')
        setPendingAttachment(seed.property || null)

        onSeedConsumed?.()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historyLoaded, seed])

    const handleComposerSubmit = () => {
        const text = input.trim()
        if (!text) return
        setInput('')
        const attachment = pendingAttachment
        setPendingAttachment(null)
        sendTurn({
            userVisibleText: text,
            // The attached property goes first, followed by whatever search
            // results were already on screen, so asking about it doesn't
            // throw away the earlier search.
            resultsOverride: attachment
                ? [attachment, ...results.filter((p) => p.property_id !== attachment.property_id)]
                : undefined,
            attachment,
        })
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
        chatLogRef.current = []
        setChatLog([])
        setMessages([])
        setFilter(null)
        setResults([])
        setRelaxed([])
        setFormOpen(false)
        setSearchFormOpen(false)
        setError('')
    }

    const onLink = linkHandler(onNavigate)
    const lastAssistant = chatLog.reduce((last, item, i) => (item.type === 'assistant' ? i : last), -1)
    const isEmpty = chatLog.length === 0 && !loading

    if (!historyLoaded) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading your conversation...</p>
            </div>
        )
    }

    const renderResults = (item) => {
        if (!item || item.items.length === 0) return null
        return (
            <div className="rony-results">
                <BusinessChart chart={item.chart} results={item.items} budgetMax={item.budgetMax} />
                <CompareTable results={item.items} highlight={item.highlight} />
                <div className="advisor-results-grid rony-carousel">
                    {item.items.map((property) => (
                        <PropertyResultCard
                            key={property.property_id}
                            property={property}
                            isHighlighted={item.highlight.includes(property.property_id)}
                            onView={onViewProperty ? () => onViewProperty(property) : undefined}
                        />
                    ))}
                </div>
            </div>
        )
    }

    const searchForm = (
        <AdvisorForm initialFilter={filter} servicesCatalog={servicesCatalog} onSubmit={handleFormSubmit} />
    )

    return (
        <div className={`advisor-shell ${compact ? 'is-compact' : ''}`}>
            {!compact && (
                <AdvisorTopBar
                    subtitle={filter ? 'Searching with your filters' : 'Knows the marketplace, your rent and your leases'}
                    canReset={chatLog.length > 0}
                    onNewChat={handleNewChat}
                >
                    {filter && !formOpen && (
                        <FilterPill filter={filter} servicesCatalog={servicesCatalog} onEdit={() => setFormOpen(true)} />
                    )}
                </AdvisorTopBar>
            )}

            {filter && formOpen && <div className="advisor-edit-form">{searchForm}</div>}

            <div className={`advisor-stream ${isEmpty && !compact ? 'is-home' : ''}`} ref={scrollRef}>
                {isEmpty && !compact && (
                    <AdvisorHome
                        firstName={firstName}
                        intro="I search the NextSpace marketplace for you and keep an eye on your rent and leases."
                        liveCards={liveCards}
                        topics={BUSINESS_TOPICS}
                        onAsk={ask}
                        extra={
                            <div className="rony-home-form">
                                {searchFormOpen ? (
                                    searchForm
                                ) : (
                                    <button type="button" className="ns-link-btn" onClick={() => setSearchFormOpen(true)}>
                                        <i className="bi bi-sliders"></i> Prefer filters? Search with a form
                                    </button>
                                )}
                            </div>
                        }
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
                                    {item.attachment && (
                                        <div className="advisor-attachment-chip">
                                            {item.attachment.photo_url ? (
                                                <img src={item.attachment.photo_url} alt={item.attachment.property_name} />
                                            ) : (
                                                <i className="bi bi-shop"></i>
                                            )}
                                            <span>{item.attachment.property_name}</span>
                                        </div>
                                    )}
                                    <p>{item.text}</p>
                                </div>
                            </div>
                        )
                    }
                    if (item.type === 'assistant') {
                        const following = chatLog[i + 1]
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
                                {item.relaxed?.length > 0 && (
                                    <p className="advisor-relaxed-note">
                                        <i className="bi bi-funnel"></i> I{' '}
                                        {item.relaxed.map((key) => RELAXED_LABELS[key] || key).join(', ')} to find more.
                                    </p>
                                )}
                                {following?.type === 'results' && renderResults(following)}
                            </RonyReply>
                        )
                    }
                    return null
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
                placeholder="Ask Rony anything, or say what to change..."
                attachment={
                    pendingAttachment && (
                        <div className="advisor-attachment-preview">
                            {pendingAttachment.photo_url ? (
                                <img src={pendingAttachment.photo_url} alt={pendingAttachment.property_name} />
                            ) : (
                                <i className="bi bi-shop"></i>
                            )}
                            <span>{pendingAttachment.property_name}</span>
                            <button
                                type="button"
                                className="advisor-attachment-remove"
                                onClick={() => setPendingAttachment(null)}
                                aria-label="Remove attachment"
                            >
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </div>
                    )
                }
            />
        </div>
    )
}
