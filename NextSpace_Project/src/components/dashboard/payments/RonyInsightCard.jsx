import { useTranslation } from 'react-i18next'
import RonyAvatar from '../../RonyAvatar'
import { BRAND_VALUES } from '../../../lib/brand'

// Rony's read of the screen, computed by the app (no AI call, so it's
// instant). Each insight may carry an action button; "Ask Rony" opens the
// chat for a deeper answer.
export default function RonyInsightCard({ title, insights, onAction, onAskRony, askLabel }) {
    const { t } = useTranslation()
    if (!insights || insights.length === 0) return null
    const heading = title || t('ronyCard.title', BRAND_VALUES)

    return (
        <section className="ns-rony-card" aria-label={heading}>
            <div className="ns-rony-card-head">
                <RonyAvatar size={34} />
                <div>
                    <h3>{heading}</h3>
                    <span>{t('ronyCard.updated')}</span>
                </div>
                {onAskRony && (
                    <button type="button" className="ns-outline-btn ns-rony-ask" onClick={onAskRony}>
                        <i className="bi bi-stars"></i> {askLabel || t('insights.owner.askRony', BRAND_VALUES)}
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
