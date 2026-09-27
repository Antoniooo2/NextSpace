import { PAYMENT_STATUS_LABEL, formatDueDate, todayInElSalvador } from '../../../lib/rentSchedule'
import { daysLate, money } from '../../../lib/leaseInsights'

const LEGEND = [
    { status: 'Paid', label: 'Paid' },
    { status: 'Pending', label: 'Due' },
    { status: 'Late', label: 'Late' },
    { status: 'Scheduled', label: 'Upcoming' },
]

// One segment per month of the lease, colored by status, with a "today"
// marker. Each month is a button that opens its details.
export default function LeaseTimeline({ installments, onSelect, today = todayInElSalvador() }) {
    if (installments.length === 0) return <p className="ns-pay-muted mb-0">No rent schedule for this lease yet.</p>

    // Position of "today": after the last month already due.
    const dueCount = installments.filter((p) => p.payment_date <= today).length
    const todayPct = Math.min(100, Math.max(0, (dueCount / installments.length) * 100))

    return (
        <div className="ns-timeline">
            <div className="ns-timeline-track">
                {installments.map((p) => {
                    const late = daysLate(p, today)
                    const title =
                        `${formatDueDate(p.payment_date, { month: 'long', year: 'numeric' })} · ${money(p.amount)} · ` +
                        `${PAYMENT_STATUS_LABEL[p.status] || p.status}` +
                        (late > 0 ? ` (${late} days late)` : '')
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
                        <span>Today</span>
                    </span>
                )}
            </div>
            <div className="ns-timeline-legend" aria-hidden="true">
                {LEGEND.map((l) => (
                    <span key={l.status}>
                        <i className={`status-${l.status.toLowerCase()}`} /> {l.label}
                    </span>
                ))}
            </div>
        </div>
    )
}
