import { useEffect, useRef, useState } from 'react'
import { daysUntil, formatDueDate, todayInElSalvador } from '../../../lib/rentSchedule'
import { daysLate, leaseTimeProgress, money, tenantName } from '../../../lib/leaseInsights'
import PaymentDetailModal from '../PaymentDetailModal'
import LeaseTimeline from './LeaseTimeline'
import NoticeComposerModal from './NoticeComposerModal'
import ProgressRing from './ProgressRing'
import RiskBadge from './RiskBadge'

const ACTIVITY_PAGE = 8

function activityFor(lease, events, today) {
    const { contract, installments } = lease
    const items = []

    for (const p of installments) {
        const month = formatDueDate(p.payment_date, { month: 'long', year: 'numeric' })
        if (p.status === 'Paid') {
            const late = daysLate(p, today)
            items.push({
                at: p.paid_at || p.payment_date,
                icon: 'bi-check-circle-fill',
                tone: 'success',
                text: `Paid ${money(p.amount)} for ${month} rent`,
                sub: `${p.payment_method || 'Wompi'} · ${late > 0 ? `${late} days late` : 'on time'}${
                    p.wompi_transaction_id ? ` · Tx ${p.wompi_transaction_id.slice(0, 8)}…` : ''
                }`,
            })
        } else if (p.status === 'Late') {
            items.push({
                at: p.payment_date,
                icon: 'bi-exclamation-octagon-fill',
                tone: 'danger',
                text: `${month} rent (${money(p.amount)}) became late`,
                sub: `${daysLate(p, today)} days overdue`,
            })
        }
    }

    for (const e of events) {
        items.push({
            at: e.created_at,
            icon: e.kind === 'renewal_offer' ? 'bi-arrow-repeat' : e.kind === 'reminder' ? 'bi-send-fill' : 'bi-bell-fill',
            tone: e.kind === 'renewal_offer' ? 'info' : 'neutral',
            text:
                e.kind === 'renewal_offer'
                    ? 'You offered a renewal'
                    : e.kind === 'reminder'
                      ? `You sent a ${e.tone || ''} reminder`.replace('  ', ' ')
                      : 'Automatic reminder sent',
            sub: e.message,
        })
    }

    if (contract.start_date) {
        items.push({ at: contract.start_date, icon: 'bi-flag-fill', tone: 'neutral', text: 'Lease started' })
    }

    return items.sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

function formatWhen(at) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return formatDueDate(at)
    return new Date(at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/El_Salvador',
    })
}

export default function OwnerLeaseDetail({ lease, events, ownerFirstName, onBack, onAskRony, onNoticeSent }) {
    const today = todayInElSalvador()
    const { contract, installments, stats, risk } = lease
    const property = contract.add_business || {}
    const [composer, setComposer] = useState(null)
    const [detailId, setDetailId] = useState(null)
    const [sentNotice, setSentNotice] = useState('')
    const [shown, setShown] = useState(ACTIVITY_PAGE)
    const topRef = useRef(null)

    // Opened from a card further down the overview: start at the top.
    useEffect(() => {
        // The dashboard header is sticky, so scroll the page itself to the
        // very top rather than scrolling the back button under the header.
        window.scrollTo({ top: 0 })
        topRef.current?.focus({ preventScroll: true })
    }, [contract.contract_id])

    const daysToEnd = contract.end_date ? daysUntil(contract.end_date, today) : null
    const canOfferRenewal = daysToEnd != null && daysToEnd >= 0 && daysToEnd <= 60
    const activity = activityFor(lease, events, today)
    const detailPayment = installments.find((p) => p.payment_id === detailId) || null
    const timeProgress = leaseTimeProgress(contract, today)
    const onTimePct = stats.onTimeRate == null ? null : Math.round(stats.onTimeRate * 100)
    const tenant = tenantName(contract.users)

    const askRony = () =>
        onAskRony?.({
            text: `How is ${tenant} doing with rent on ${property.property_name || 'this property'}? What should I do next?`,
        })

    return (
        <>
            <button type="button" className="ns-detail-back" onClick={onBack} ref={topRef}>
                <i className="bi bi-arrow-left"></i> All properties
            </button>

            <section className="ns-lease-hero">
                <div className="ns-lease-hero-photo">
                    {property.photo_url ? <img src={property.photo_url} alt={property.property_name} /> : <i className="bi bi-shop"></i>}
                </div>
                <div className="ns-lease-hero-info">
                    <div className="ns-lease-hero-title">
                        <h1>{property.property_name || 'Property'}</h1>
                        <RiskBadge risk={risk} onAskRony={onAskRony ? askRony : undefined} />
                    </div>
                    <p>
                        <i className="bi bi-person"></i> {tenant}
                        <span className="ns-pay-dot">•</span>
                        {money(contract.monthly_rent)}/month
                        <span className="ns-pay-dot">•</span>
                        {formatDueDate(contract.start_date)} → {formatDueDate(contract.end_date)}
                    </p>
                    <div className="ns-lease-time">
                        <div className="ns-pay-progress-track">
                            <div className="ns-pay-progress-fill ns-fill-navy" style={{ width: `${Math.round(timeProgress * 100)}%` }} />
                        </div>
                        <span>
                            {daysToEnd == null
                                ? 'No end date'
                                : daysToEnd >= 0
                                  ? `${daysToEnd} days left on the lease`
                                  : 'Lease ended'}
                        </span>
                    </div>
                </div>
                <div className="ns-lease-hero-actions">
                    {stats.lateMonths > 0 && (
                        <button type="button" className="ns-filled-btn" onClick={() => setComposer('reminder')}>
                            <i className="bi bi-bell"></i> Send reminder
                        </button>
                    )}
                    {canOfferRenewal && (
                        <button type="button" className="ns-outline-btn" onClick={() => setComposer('renewal_offer')}>
                            <i className="bi bi-arrow-repeat"></i> Offer renewal
                        </button>
                    )}
                    {onAskRony && (
                        <button type="button" className="ns-outline-btn" onClick={askRony}>
                            <i className="bi bi-stars"></i> Ask Rony
                        </button>
                    )}
                </div>
            </section>

            {sentNotice && (
                <div className="alert alert-success d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>
                        <i className="bi bi-check-circle-fill"></i> {sentNotice}
                    </span>
                    <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setSentNotice('')} />
                </div>
            )}

            <div className="ns-lease-kpis">
                <div className="ns-lease-kpi">
                    <ProgressRing
                        value={stats.monthsTotal > 0 ? stats.monthsPaid / stats.monthsTotal : 0}
                        label={`${stats.monthsPaid} of ${stats.monthsTotal} months paid`}
                    >
                        <strong>{stats.monthsPaid}</strong>
                        <small>/{stats.monthsTotal}</small>
                    </ProgressRing>
                    <div>
                        <span className="ns-lease-kpi-value">Months paid</span>
                        <span className="ns-lease-kpi-label">
                            {money(stats.collectedTotal)} of {money(stats.leaseTotal)}
                        </span>
                    </div>
                </div>
                <div className="ns-lease-kpi">
                    <span className={`ns-lease-kpi-big ${onTimePct != null && onTimePct < 85 ? 'is-bad' : ''}`}>
                        {onTimePct == null ? '—' : `${onTimePct}%`}
                    </span>
                    <div>
                        <span className="ns-lease-kpi-value">On time</span>
                        <span className="ns-lease-kpi-label">
                            {stats.monthsDue > 0 ? `${stats.paidOnTime} of ${stats.monthsDue} months due` : 'Nothing due yet'}
                        </span>
                    </div>
                </div>
                <div className="ns-lease-kpi">
                    <span className={`ns-lease-kpi-big ${stats.avgDaysLate > 3 ? 'is-bad' : ''}`}>
                        {stats.monthsDue > 0 ? stats.avgDaysLate.toFixed(1) : '—'}
                    </span>
                    <div>
                        <span className="ns-lease-kpi-value">Avg. days late</span>
                        <span className="ns-lease-kpi-label">per month due</span>
                    </div>
                </div>
                <div className="ns-lease-kpi">
                    <span className={`ns-lease-kpi-big ${stats.lateMonths > 0 ? 'is-bad' : ''}`}>{money(stats.owedNow)}</span>
                    <div>
                        <span className="ns-lease-kpi-value">Owed now</span>
                        <span className="ns-lease-kpi-label">
                            {money(stats.remainingTotal)} left on the lease ({stats.remainingMonths} months)
                        </span>
                    </div>
                </div>
            </div>

            <section className="ns-panel">
                <div className="ns-panel-head">
                    <h3>Rent timeline</h3>
                    <span>Tap a month for details</span>
                </div>
                <LeaseTimeline installments={installments} today={today} onSelect={(p) => setDetailId(p.payment_id)} />
            </section>

            <section className="ns-panel">
                <div className="ns-panel-head">
                    <h3>Activity</h3>
                    <span>Payments, reminders and offers</span>
                </div>
                {activity.length === 0 ? (
                    <p className="ns-pay-muted mb-0">No activity yet.</p>
                ) : (
                    <>
                        <ol className="ns-activity">
                            {activity.slice(0, shown).map((item, i) => (
                                <li key={i} className={`tone-${item.tone}`}>
                                    <i className={`bi ${item.icon}`}></i>
                                    <div>
                                        <span className="ns-activity-text">{item.text}</span>
                                        {item.sub && <span className="ns-activity-sub">{item.sub}</span>}
                                    </div>
                                    <time>{formatWhen(item.at)}</time>
                                </li>
                            ))}
                        </ol>
                        {activity.length > shown && (
                            <button type="button" className="ns-link-btn" onClick={() => setShown((n) => n + ACTIVITY_PAGE)}>
                                Show more
                            </button>
                        )}
                    </>
                )}
            </section>

            {composer && (
                <NoticeComposerModal
                    kind={composer}
                    contract={contract}
                    stats={stats}
                    ownerFirstName={ownerFirstName}
                    onClose={() => setComposer(null)}
                    onSent={() => {
                        setSentNotice(
                            composer === 'reminder'
                                ? `Reminder sent to ${contract.users?.first_name || 'your tenant'}.`
                                : `Renewal offer sent to ${contract.users?.first_name || 'your tenant'}.`
                        )
                        setComposer(null)
                        onNoticeSent?.()
                    }}
                />
            )}

            {detailPayment && (
                <PaymentDetailModal
                    payment={detailPayment}
                    contract={contract}
                    tenant={{ first_name: contract.users?.first_name, last_name: contract.users?.last_name, dui: contract.tenant_dui }}
                    viewer="owner"
                    onClose={() => setDetailId(null)}
                />
            )}
        </>
    )
}
