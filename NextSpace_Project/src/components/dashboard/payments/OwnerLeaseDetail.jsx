import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { currentLocale } from '../../../i18n'
import { BRAND_VALUES } from '../../../lib/brand'
import { paymentMethodLabel } from '../../../lib/displayValues'
import { ARROW_RIGHT, DASH, DOT } from '../../../lib/symbols'
import { daysUntil, formatDueDate, todayInElSalvador } from '../../../lib/rentSchedule'
import { daysLate, leaseTimeProgress, money, tenantName } from '../../../lib/leaseInsights'
import PaymentDetailModal from '../PaymentDetailModal'
import LeaseTimeline from './LeaseTimeline'
import NoticeComposerModal from './NoticeComposerModal'
import ProgressRing from './ProgressRing'
import RiskBadge from './RiskBadge'
import ExportMenu from './ExportMenu'
import { downloadLeaseStatementPdf, downloadLeaseWorkbook } from '../../../lib/paymentReports'
import { EVENT_META, renewalOpen, renewalState } from '../../../lib/contracts'
import { contractRate, feeSplit, formatRate, sumSplit } from '../../../lib/platformFee'

const ACTIVITY_PAGE = 8

function activityFor(lease, events, today) {
    const { contract, installments } = lease
    const t = (key, values) => i18n.t(`leaseDetail.activity.${key}`, values)
    const items = []

    for (const p of installments) {
        const month = formatDueDate(p.payment_date, { month: 'long', year: 'numeric' })
        if (p.status === 'Paid') {
            const late = daysLate(p, today)
            items.push({
                at: p.paid_at || p.payment_date,
                icon: 'bi-check-circle-fill',
                tone: 'success',
                text: t('paid', { amount: money(p.amount), month }),
                sub: `${paymentMethodLabel(p.payment_method || 'Wompi')} ${DOT} ${late > 0 ? i18n.t('rent.daysLate', { count: late }) : t('onTime')}${
                    p.wompi_transaction_id ? ` ${DOT} ${t('tx', { id: p.wompi_transaction_id.slice(0, 8) })}` : ''
                }`,
            })
        } else if (p.status === 'Late') {
            items.push({
                at: p.payment_date,
                icon: 'bi-exclamation-octagon-fill',
                tone: 'danger',
                text: t('becameLate', { month, amount: money(p.amount) }),
                sub: t('overdue', { count: daysLate(p, today) }),
            })
        }
    }

    for (const e of events) {
        const meta = EVENT_META[e.kind] || { icon: 'bi-bell-fill', label: e.kind }
        items.push({
            at: e.created_at,
            icon: meta.icon,
            tone: e.kind === 'renewal_request' || e.kind === 'signed' ? 'success' : e.kind === 'renewal_offer' ? 'info' : 'neutral',
            text:
                e.kind === 'renewal_request'
                    ? t('askedRenew', { name: contract.users?.first_name || t('yourTenant') })
                    : e.kind === 'renewal_offer'
                      ? t('youOffered')
                      : e.kind === 'reminder'
                        ? e.tone === 'friendly' || e.tone === 'firm'
                            ? t(`reminder_${e.tone}`)
                            : t('reminder')
                        : meta.label,
            sub: e.message,
        })
    }

    if (contract.start_date) {
        items.push({ at: contract.start_date, icon: 'bi-flag-fill', tone: 'neutral', text: t('started') })
    }

    return items.sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

function formatWhen(at) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return formatDueDate(at)
    return new Date(at).toLocaleDateString(currentLocale(), {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/El_Salvador',
    })
}

export default function OwnerLeaseDetail({
    lease,
    events,
    ownerFirstName,
    ownerName,
    feeRate,
    payouts = [],
    onBack,
    onAskRony,
    onNoticeSent,
    onOpenContract,
}) {
    const { t } = useTranslation()
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
    const canOfferRenewal = renewalOpen(contract, today) && Boolean(onOpenContract)
    const renewal = renewalState(contract)
    const activity = activityFor(lease, events, today)
    const detailPayment = installments.find((p) => p.payment_id === detailId) || null
    const timeProgress = leaseTimeProgress(contract, today)
    const onTimePct = stats.onTimeRate == null ? null : Math.round(stats.onTimeRate * 100)
    const tenant = tenantName(contract.users)
    const tenantInfo = { first_name: contract.users?.first_name, last_name: contract.users?.last_name, dui: contract.tenant_dui }
    const rate = contractRate(contract, feeRate)
    const monthlyNet = feeSplit(contract.monthly_rent, rate).net
    const collected = sumSplit(
        installments.filter((p) => p.status === 'Paid'),
        rate
    )

    const askRony = () =>
        onAskRony?.({
            text: t('ownerPayments.askTenant', { tenant, name: property.property_name || t('leaseDetail.thisProperty') }),
        })

    return (
        <>
            <nav className="ns-breadcrumb" aria-label={t('contractDetail.breadcrumb')}>
                <button type="button" onClick={onBack} ref={topRef}>
                    <i className="bi bi-arrow-left"></i> {t('dashboard.nav.payments')}
                </button>
                <i className="bi bi-chevron-right"></i>
                <strong>{property.property_name || t('common.property')}</strong>
            </nav>

            <section className="ns-lease-hero">
                <div className="ns-lease-hero-photo">
                    {property.photo_url ? <img src={property.photo_url} alt={property.property_name} /> : <i className="bi bi-shop"></i>}
                </div>
                <div className="ns-lease-hero-info">
                    <div className="ns-lease-hero-title">
                        <h1>{property.property_name || t('common.property')}</h1>
                        <RiskBadge risk={risk} onAskRony={onAskRony ? askRony : undefined} />
                    </div>
                    <p>
                        <i className="bi bi-person"></i> {tenant}
                        <span className="ns-pay-dot">{DOT}</span>
                        {t('leaseDetail.rentLine', { rent: money(contract.monthly_rent), net: money(monthlyNet), rate: formatRate(rate) })}
                        <span className="ns-pay-dot">{DOT}</span>
                        {formatDueDate(contract.start_date)} {ARROW_RIGHT} {formatDueDate(contract.end_date)}
                    </p>
                    <div className="ns-lease-time">
                        <div className="ns-pay-progress-track">
                            <div className="ns-pay-progress-fill ns-fill-navy" style={{ width: `${Math.round(timeProgress * 100)}%` }} />
                        </div>
                        <span>
                            {daysToEnd == null
                                ? t('leaseDetail.noEndDate')
                                : daysToEnd >= 0
                                  ? t('payments.daysLeftLease', { count: daysToEnd })
                                  : t('contracts.events.expired')}
                        </span>
                    </div>
                </div>
                <div className="ns-lease-hero-actions">
                    {stats.lateMonths > 0 && (
                        <button type="button" className="ns-filled-btn" onClick={() => setComposer('reminder')}>
                            <i className="bi bi-bell"></i> {t('leaseDetail.sendReminder')}
                        </button>
                    )}
                    {canOfferRenewal && renewal === 'requested' && (
                        <button type="button" className="ns-filled-btn" onClick={() => onOpenContract(contract.contract_id)}>
                            <i className="bi bi-arrow-repeat"></i> {t('insights.owner.answerRenewal')}
                        </button>
                    )}
                    <ExportMenu
                        options={[
                            {
                                id: 'statement',
                                icon: 'bi-file-earmark-pdf',
                                label: t('payments.export.statement'),
                                description: t('payments.export.statementDesc', { name: t('payments.export.thisLease') }),
                                onSelect: () =>
                                    downloadLeaseStatementPdf({ contract, installments, tenant: tenantInfo, ownerName }),
                            },
                            {
                                id: 'xlsx',
                                icon: 'bi-file-earmark-spreadsheet',
                                label: t('payments.export.excel'),
                                description: t('payments.export.excelDesc'),
                                onSelect: () => downloadLeaseWorkbook({ contract, installments, tenant: tenantInfo, ownerName }),
                            },
                        ]}
                    />
                    <div className="ns-quiet-actions">
                        {canOfferRenewal && renewal !== 'requested' && (
                            <button type="button" onClick={() => onOpenContract(contract.contract_id)}>
                                <i className="bi bi-arrow-repeat"></i> {renewal === 'offered' ? t('ownerHome.flags.renewalOffered') : t('insights.owner.offerRenewal')}
                            </button>
                        )}
                        {onOpenContract && (
                            <button type="button" onClick={() => onOpenContract(contract.contract_id)}>
                                <i className="bi bi-file-earmark-text"></i> {t('payments.viewContract')}
                            </button>
                        )}
                        {onAskRony && (
                            <button type="button" onClick={askRony}>
                                <i className="bi bi-stars"></i> {t('insights.owner.askRony', BRAND_VALUES)}
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {sentNotice && (
                <div className="alert alert-success d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>
                        <i className="bi bi-check-circle-fill"></i> {sentNotice}
                    </span>
                    <button type="button" className="btn-close" aria-label={t('common.dismiss')} onClick={() => setSentNotice('')} />
                </div>
            )}

            <div className="ns-lease-kpis">
                <div className="ns-lease-kpi">
                    <ProgressRing
                        value={stats.monthsTotal > 0 ? stats.monthsPaid / stats.monthsTotal : 0}
                        label={t('ownerPayments.card.monthsPaid', { paid: stats.monthsPaid, count: stats.monthsTotal })}
                    >
                        <strong>{stats.monthsPaid}</strong>
                        <small>/{stats.monthsTotal}</small>
                    </ProgressRing>
                    <div>
                        <span className="ns-lease-kpi-value">{t('docs.reports.monthsPaid')}</span>
                        <span className="ns-lease-kpi-label">
                            {t('leaseDetail.collectedOf', { collected: money(stats.collectedTotal), total: money(stats.leaseTotal) })}
                            {collected.gross > 0 ? ` ${DOT} ${t('ownerPayments.next30.toYou', { amount: money(collected.net) })}` : ''}
                        </span>
                    </div>
                </div>
                <div className="ns-lease-kpi">
                    <span className={`ns-lease-kpi-big ${onTimePct != null && onTimePct < 85 ? 'is-bad' : ''}`}>
                        {onTimePct == null ? DASH : `${onTimePct}%`}
                    </span>
                    <div>
                        <span className="ns-lease-kpi-value">{t('docs.reports.onTime')}</span>
                        <span className="ns-lease-kpi-label">
                            {stats.monthsDue > 0 ? t('leaseDetail.ofMonthsDue', { paid: stats.paidOnTime, count: stats.monthsDue }) : t('payments.kpi.nothingDue')}
                        </span>
                    </div>
                </div>
                <div className="ns-lease-kpi">
                    <span className={`ns-lease-kpi-big ${stats.lateMonths > 0 ? 'is-bad' : ''}`}>{money(stats.owedNow)}</span>
                    <div>
                        <span className="ns-lease-kpi-value">{t('docs.reports.owedNow')}</span>
                        <span className="ns-lease-kpi-label">
                            {t('leaseDetail.leftOnLease', { amount: money(stats.remainingTotal), count: stats.remainingMonths })}
                        </span>
                    </div>
                </div>
            </div>

            <section className="ns-panel">
                <div className="ns-panel-head">
                    <h3>{t('payments.timeline.title')}</h3>
                    <span>{t('leaseDetail.tapMonth')}</span>
                </div>
                <LeaseTimeline installments={installments} today={today} onSelect={(p) => setDetailId(p.payment_id)} />
            </section>

            <section className="ns-panel">
                <div className="ns-panel-head">
                    <h3>{t('leaseDetail.activityTitle')}</h3>
                    <span>{t('leaseDetail.activityHint')}</span>
                </div>
                {activity.length === 0 ? (
                    <p className="ns-pay-muted mb-0">{t('leaseDetail.noActivity')}</p>
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
                                {t('leaseDetail.showMore')}
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
                                ? t('leaseDetail.reminderSent', { name: contract.users?.first_name || t('leaseDetail.yourTenant') })
                                : t('leaseDetail.renewalSent', { name: contract.users?.first_name || t('leaseDetail.yourTenant') })
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
                    tenant={tenantInfo}
                    viewer="owner"
                    feeRate={feeRate}
                    payout={payouts.find((t) => t.payout_id === detailPayment.payout_id)}
                    onClose={() => setDetailId(null)}
                />
            )}
        </>
    )
}
