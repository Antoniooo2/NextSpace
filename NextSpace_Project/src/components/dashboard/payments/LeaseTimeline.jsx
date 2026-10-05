import { useTranslation } from 'react-i18next'
import { PAYMENT_STATUS_LABEL, formatDueDate, todayInElSalvador } from '../../../lib/rentSchedule'
import { daysLate, money } from '../../../lib/leaseInsights'
import { DOT } from '../../../lib/symbols'

const LEGEND = ['Paid', 'Pending', 'Late', 'Scheduled']

// One segment per month of the lease, colored by status, with a "today"
// marker. Each month is a button that opens its details.
export default function LeaseTimeline({ installments, onSelect, today = todayInElSalvador() }) {
    const { t } = useTranslation()
    if (installments.length === 0) return <p className="ns-pay-muted mb-0">{t('timeline.empty')}</p>

    // Position of "today": after the last month already due.
    const dueCount = installments.filter((p) => p.payment_date <= today).length
    const todayPct = Math.min(100, Math.max(0, (dueCount / installments.length) * 100))

    return (
        <div className="ns-timeline">
            <div className="ns-timeline-track">
                {installments.map((p) => {
                    const late = daysLate(p, today)
                    const title =
                        `${formatDueDate(p.payment_date, { month: 'long', year: 'numeric' })} ${DOT} ${money(p.amount)} ${DOT} ` +
                        `${PAYMENT_STATUS_LABEL[p.status] || p.status}` +
                        (late > 0 ? ` (${t('rent.daysLate', { count: late })})` : '')
                    return (
                        <button
                            type="button"
                            key={p.payment_id}
                            className={`ns-timeline-seg status-${p.status.toLowerCase()} ${p.status === 'Paid' && late > 0 ? 'paid-late' : ''}`}
                            onClick={() => onSelect?.(p)}
                            title={title}
                            aria-label={title}
                        >
                            <span className="ns-timeline-bar">
                                {p.status === 'Late' && <i className="bi bi-exclamation"></i>}
                                {p.status === 'Paid' && <i className="bi bi-check"></i>}
                            </span>
                            <span className="ns-timeline-label">
                                {formatDueDate(p.payment_date, { month: 'short' })}
                            </span>
                        </button>
                    )
                })}
                {dueCount > 0 && dueCount < installments.length && (
                    <span className="ns-timeline-today" style={{ left: `${todayPct}%` }}>
                        <span>{t('notifications.groups.today')}</span>
                    </span>
                )}
            </div>
            <div className="ns-timeline-legend" aria-hidden="true">
                {LEGEND.map((status) => (
                    <span key={status}>
                        <i className={`status-${status.toLowerCase()}`} /> {PAYMENT_STATUS_LABEL[status]}
                    </span>
                ))}
            </div>
        </div>
    )
}
