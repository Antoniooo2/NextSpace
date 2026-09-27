import RonyAvatar from '../../RonyAvatar'

// Rony's read of the screen, computed by the app (no AI call, so it's
// instant). Each insight may carry an action button; "Ask Rony" opens the
// chat for a deeper answer.
export default function RonyInsightCard({ title = "Rony's summary", insights, onAction, onAskRony, askLabel = 'Ask Rony' }) {
    if (!insights || insights.length === 0) return null

    return (
        <section className="ns-rony-card" aria-label={title}>
            <div className="ns-rony-card-head">
                <RonyAvatar size={34} />
                <div>
                    <h3>{title}</h3>
                    <span>Updated just now from your rent schedule</span>
                </div>
                {onAskRony && (
                    <button type="button" className="ns-outline-btn ns-rony-ask" onClick={onAskRony}>
                        <i className="bi bi-stars"></i> {askLabel}
                    </button>
                )}
            </div>
            <ul className="ns-rony-list">
                {insights.map((item, i) => (
                    <li key={i} className={`tone-${item.tone}`}>
                        <i className={`bi ${item.icon}`}></i>
                        <span>{item.text}</span>
                        {item.action && onAction && (
                            <button type="button" className="ns-rony-action" onClick={() => onAction(item.action)}>
                                {item.action.label} <i className="bi bi-arrow-right"></i>
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    )
}
