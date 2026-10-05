import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ADVISOR_NAME, BRAND_VALUES } from '../../../lib/brand'
import { DOT } from '../../../lib/symbols'
import RonyAvatar from '../../RonyAvatar'
import ConfirmDialog from '../ConfirmDialog'

// Top bar of the full AI Advisor page: who Rony is, what it knows, and a
// way to start over. `children` sits in the middle (e.g. the search pill).
export function AdvisorTopBar({ subtitle, onNewChat, canReset, children }) {
    const { t } = useTranslation()
    const [confirming, setConfirming] = useState(false)
    return (
        <div className="rony-topbar">
            <div className="rony-topbar-id">
                <span className="rony-topbar-avatar">
                    <RonyAvatar size={38} />
                    <span className="rony-online" aria-hidden="true" />
                </span>
                <div>
                    <strong>{ADVISOR_NAME}</strong>
                    <span>{subtitle}</span>
                </div>
            </div>
            <div className="rony-topbar-mid">{children}</div>
            {canReset && (
                <button type="button" className="ns-outline-btn rony-newchat" onClick={() => setConfirming(true)}>
                    <i className="bi bi-plus-lg"></i> {t('advisor.newChat')}
                </button>
            )}
            {confirming && (
                <ConfirmDialog
                    icon="bi-chat-left-dots"
                    title={t('advisor.newChatConfirm.title')}
                    description={t('advisor.newChatConfirm.description', BRAND_VALUES)}
                    confirmLabel={t('advisor.newChatConfirm.confirm')}
                    cancelLabel={t('common.cancel')}
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
    const { t } = useTranslation()
    const [topic, setTopic] = useState(topics[0]?.id)
    const active = topics.find((item) => item.id === topic) || topics[0]

    return (
        <div className="rony-home">
            <div className="rony-home-hero">
                <span className="rony-home-avatar">
                    <RonyAvatar size={64} />
                </span>
                <h2>{firstName ? t('advisor.home.greetingName', { name: firstName }) : t('advisor.home.greeting')}</h2>
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
                        {topics.map((item) => (
                            <button type="button" key={item.id} role="tab" aria-selected={active?.id === item.id} className={active?.id === item.id ? 'active' : ''} onClick={() => setTopic(item.id)}>
                                <i className={`bi ${item.icon}`}></i> {item.label}
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
    const { t } = useTranslation()
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
                    aria-label={t('advisor.composer.label', BRAND_VALUES)}
                />
                <button type="submit" className="rony-send" disabled={disabled || !value.trim()} aria-label={t('common.send')}>
                    <i className="bi bi-arrow-up"></i>
                </button>
            </div>
            <small className="rony-composer-hint">{t('advisor.composer.hint', { ...BRAND_VALUES, dot: DOT })}</small>
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
