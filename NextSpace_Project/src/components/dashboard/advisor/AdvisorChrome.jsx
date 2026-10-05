import { useEffect, useRef, useState } from 'react'
import RonyAvatar from '../../RonyAvatar'
import ConfirmDialog from '../ConfirmDialog'

// Top bar of the full AI Advisor page: who Rony is, what it knows, and a
// way to start over. `children` sits in the middle (e.g. the search pill).
export function AdvisorTopBar({ subtitle, onNewChat, canReset, children }) {
    const [confirming, setConfirming] = useState(false)
    return (
        <div className="rony-topbar">
            <div className="rony-topbar-id">
                <span className="rony-topbar-avatar">
                    <RonyAvatar size={38} />
                    <span className="rony-online" aria-hidden="true" />
                </span>
                <div>
                    <strong>Rony</strong>
                    <span>{subtitle}</span>
                </div>
            </div>
            <div className="rony-topbar-mid">{children}</div>
            {canReset && (
                <button type="button" className="ns-outline-btn rony-newchat" onClick={() => setConfirming(true)}>
                    <i className="bi bi-plus-lg"></i> New chat
                </button>
            )}
            {confirming && (
                <ConfirmDialog
                    icon="bi-chat-left-dots"
                    title="Start a new chat?"
                    description="This conversation will be deleted. Rony still knows your data, it just forgets what you talked about."
                    confirmLabel="Start new chat"
                    cancelLabel="Cancel"
                    onConfirm={() => {
                        setConfirming(false)
                        onNewChat()
                    }}
                    onCancel={() => setConfirming(false)}
                />
            )}
        </div>
    )
}

// Welcome screen before the first message: live cards built from the user's
// real data (each one asks Rony about it) and topics with sample questions.
export function AdvisorHome({ firstName, intro, liveCards = [], topics = [], onAsk, extra }) {
    const [topic, setTopic] = useState(topics[0]?.id)
    const active = topics.find((t) => t.id === topic) || topics[0]

    return (
        <div className="rony-home">
            <div className="rony-home-hero">
                <span className="rony-home-avatar">
                    <RonyAvatar size={64} />
                </span>
                <h2>{firstName ? `Hi ${firstName}, how can I help today?` : 'How can I help today?'}</h2>
                <p>{intro}</p>
            </div>

            {liveCards.length > 0 && (
                <div className="rony-live">
                    {liveCards.map((card, i) => (
                        <button type="button" key={i} className={`rony-live-card tone-${card.tone}`} onClick={() => onAsk(card.prompt)} style={{ animationDelay: `${i * 80}ms` }}>
                            <span className="rony-live-icon">
                                <i className={`bi ${card.icon}`}></i>
                            </span>
                            <span className="rony-live-text">
                                <strong>{card.title}</strong>
                                <small>{card.subtitle}</small>
                            </span>
                            <i className="bi bi-arrow-up-right rony-live-go"></i>
                        </button>
                    ))}
                </div>
            )}

            {topics.length > 0 && (
                <div className="rony-topics">
                    <div className="rony-topic-tabs" role="tablist">
                        {topics.map((t) => (
                            <button type="button" key={t.id} role="tab" aria-selected={active?.id === t.id} className={active?.id === t.id ? 'active' : ''} onClick={() => setTopic(t.id)}>
                                <i className={`bi ${t.icon}`}></i> {t.label}
                            </button>
                        ))}
                    </div>
                    <div className="rony-topic-prompts">
                        {active?.prompts.map((q) => (
                            <button type="button" key={q} onClick={() => onAsk(q)}>
                                <i className="bi bi-chat-right-text"></i> {q}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {extra}
        </div>
    )
}

// Message box that grows with the text. Enter sends, Shift+Enter breaks line.
export function AdvisorComposer({ value, onChange, onSubmit, disabled, placeholder, attachment }) {
    const ref = useRef(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }, [value])

    return (
        <form
            className="rony-composer"
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        >
            {attachment}
            <div className="rony-composer-box">
                <textarea
                    ref={ref}
                    rows={1}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (!disabled && value.trim()) onSubmit()
                        }
                    }}
                    placeholder={placeholder}
                    disabled={disabled}
                    aria-label="Message Rony"
                />
                <button type="submit" className="rony-send" disabled={disabled || !value.trim()} aria-label="Send">
                    <i className="bi bi-arrow-up"></i>
                </button>
            </div>
            <small className="rony-composer-hint">Rony answers from your NextSpace data · Enter to send, Shift+Enter for a new line</small>
        </form>
    )
}

export function RonyTyping() {
    return (
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
    )
}
