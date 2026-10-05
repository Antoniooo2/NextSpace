import { useEffect, useRef, useState } from 'react'
import RonyAvatar from '../../RonyAvatar'

const TONE_ICON = { good: 'bi-check-circle-fill', warn: 'bi-exclamation-circle-fill', bad: 'bi-exclamation-triangle-fill', info: 'bi-dot' }

const LINK_ICON = {
    payments: 'bi-credit-card',
    contracts: 'bi-file-earmark-text',
    property: 'bi-shop',
    marketplace: 'bi-grid',
    my_properties: 'bi-buildings',
}

// **bold** → <strong>. The model marks the one figure that matters most.
export function RichText({ text }) {
    const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part
    )
}

function timeOf(at) {
    if (!at) return ''
    return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// One answer from Rony: the headline (typed out when it's new), then key
// figures, short points, buttons to act, anything extra the turn carries
// (results, charts, drafts) and follow-up questions.
export default function RonyReply({ item, onLink, onFollowUp, showFollowUps = true, disabled, onSettled, children }) {
    const text = item.text || ''
    const [shown, setShown] = useState(item.fresh ? 0 : text.length)
    const [copied, setCopied] = useState(false)
    const typing = shown < text.length
    const rootRef = useRef(null)

    useEffect(() => {
        if (item.fresh && !typing) onSettled?.(rootRef.current)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typing])

    useEffect(() => {
        if (!item.fresh) return undefined
        const step = Math.max(2, Math.ceil(text.length / 45))
        const timer = setInterval(() => {
            setShown((n) => {
                if (n + step >= text.length) {
                    clearInterval(timer)
                    return text.length
                }
                return n + step
            })
        }, 22)
        return () => clearInterval(timer)
    }, [item.fresh, text])

    const copy = async () => {
        const lines = [text.replace(/\*\*/g, '')]
        for (const h of item.highlights || []) lines.push(`${h.value} — ${h.label}`)
        for (const pt of item.points || []) lines.push(`• ${pt.text}`)
        try {
            await navigator.clipboard.writeText(lines.join('\n'))
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
        } catch {
            // Clipboard can be blocked; the text is still selectable.
        }
    }

    const highlights = item.highlights || []
    const points = item.points || []
    const links = item.links || []
    const followUps = item.followUps || []

    return (
        <div className="advisor-msg advisor-msg-assistant rony-msg" ref={rootRef}>
            <div className="advisor-avatar">
                <RonyAvatar size={30} />
            </div>
            <div className="rony-reply">
                <div className="advisor-bubble rony-lead">
                    <p>
                        <RichText text={typing ? text.slice(0, shown) : text} />
                        {typing && <span className="rony-caret" aria-hidden="true" />}
                    </p>
                </div>

                {!typing && (
                    <div className="rony-blocks">
                        {highlights.length > 0 && (
                            <div className={`rony-highlights n-${highlights.length}`}>
                                {highlights.map((h, i) => (
                                    <div key={i} className={`rony-highlight tone-${h.tone}`} style={{ animationDelay: `${i * 70}ms` }}>
                                        <strong>{h.value}</strong>
                                        <span>{h.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {points.length > 0 && (
                            <ul className="rony-points">
                                {points.map((pt, i) => (
                                    <li key={i} className={`tone-${pt.tone}`} style={{ animationDelay: `${120 + i * 70}ms` }}>
                                        <i className={`bi ${TONE_ICON[pt.tone] || 'bi-dot'}`}></i>
                                        <span>
                                            <RichText text={pt.text} />
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {children}

                        {links.length > 0 && onLink && (
                            <div className="rony-links">
                                {links.map((l, i) => (
                                    <button type="button" key={i} onClick={() => onLink(l)}>
                                        <i className={`bi ${LINK_ICON[l.target] || 'bi-arrow-right'}`}></i> {l.label}
                                        <i className="bi bi-arrow-right rony-link-arrow"></i>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="rony-meta">
                            {item.at && <span>{timeOf(item.at)}</span>}
                            <button type="button" onClick={copy} aria-label="Copy answer">
                                <i className={`bi ${copied ? 'bi-check2' : 'bi-copy'}`}></i> {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>

                        {showFollowUps && followUps.length > 0 && onFollowUp && (
                            <div className="rony-followups">
                                {followUps.map((q) => (
                                    <button type="button" key={q} onClick={() => onFollowUp(q)} disabled={disabled}>
                                        {q}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
