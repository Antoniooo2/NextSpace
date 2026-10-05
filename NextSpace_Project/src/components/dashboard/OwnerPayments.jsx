import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { BRAND_VALUES } from '../../lib/brand'
import { DASH, DOT } from '../../lib/symbols'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import {
    daysUntil,
    dueCountdown,
    formatDueDate,
    refreshPaymentStatuses,
    todayInElSalvador,
} from '../../lib/rentSchedule'
import {
    incomeProjection,
    leaseInstallments,
    leaseStats,
    monthKeyShift,
    monthLabel,
    money,
    ownerInsights,
    riskLevel,
    svDateOf,
    tenantName,
} from '../../lib/leaseInsights'
import { downloadReceiptPdf } from '../../lib/paymentDocuments'
import { contractRate, formatRate, paymentSplit } from '../../lib/platformFee'
import { loadPayoutAccount, loadPayouts } from '../../lib/payouts'
import usePlatformFee from '../../hooks/usePlatformFee'
import { downloadOwnerWorkbook } from '../../lib/paymentReports'
import ExportMenu from './payments/ExportMenu'
import MonthlyReportModal from './payments/MonthlyReportModal'
import PaymentDetailModal from './PaymentDetailModal'
import PaymentHistory from './payments/PaymentHistory'
import CollectionsChart from './CollectionsChart'
import IncomeProjectionChart from './payments/IncomeProjectionChart'
import OwnerLeaseDetail from './payments/OwnerLeaseDetail'
import OwnerTransfers from './payments/OwnerTransfers'
import PayoutAccountModal from './payments/PayoutAccountModal'
import ProgressRing from './payments/ProgressRing'
import RiskBadge from './payments/RiskBadge'
import RonyInsightCard from './payments/RonyInsightCard'
import { PageGroup, SectionNav } from './common/PageSections'
import './payments/payments.css'

const CONTRACT_EMBED = `*, add_business!contract_property_id_fkey(property_name, monthly_rent, ${PROPERTY_PHOTO_EMBED}), users!contract_tenant_dui_fkey(first_name,last_name)`

function paidMonthKey(p) {
    return p.paid_at ? svDateOf(p.paid_at).slice(0, 7) : p.payment_date.slice(0, 7)
}

function sumAmount(rows) {
    return rows.reduce((total, p) => total + Number(p.amount || 0), 0)
}

// What the owner keeps from these rows after the NextSpace fee.
function sumNet(rows, rate) {
    return rows.reduce((total, p) => total + paymentSplit(p, contractRate(p.contract, rate)).net, 0)
}

// "▲ 12% vs Aug" style change between two values.
function Trend({ current, previous, points = false, invert = false }) {
    const { t } = useTranslation()
    if (previous == null || (previous === 0 && current === 0)) return <span className="ns-trend">{t('ownerPayments.trend.noData')}</span>
    const diff = points ? current - previous : previous === 0 ? 100 : ((current - previous) / previous) * 100
    const rounded = Math.round(diff)
    if (rounded === 0) return <span className="ns-trend">{t('ownerPayments.trend.same')}</span>
    const good = invert ? rounded < 0 : rounded > 0
    return (
        <span className={`ns-trend ${good ? 'is-good' : 'is-bad'}`}>
            <i className={`bi ${rounded > 0 ? 'bi-caret-up-fill' : 'bi-caret-down-fill'}`}></i> {Math.abs(rounded)}
            {points ? ` ${t('ownerPayments.trend.pts')}` : '%'} {t('ownerPayments.trend.vsLastMonth')}
        </span>
    )
}

export default function OwnerPayments({ user, onAskRony, onOpenContract, initialContractId }) {
    const { t } = useTranslation()
    const [contracts, setContracts] = useState([])
    const [payments, setPayments] = useState([])
    const [events, setEvents] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [selectedId, setSelectedId] = useState(initialContractId ? Number(initialContractId) : null)
    const [chartRange, setChartRange] = useState(6)
    const [historyDetailId, setHistoryDetailId] = useState(null)
    const [receiptBusyId, setReceiptBusyId] = useState(null)
    const [reportOpen, setReportOpen] = useState(false)
    const [payouts, setPayouts] = useState([])
    const [payoutAccount, setPayoutAccount] = useState(null)
    const [payoutError, setPayoutError] = useState('')
    const [accountOpen, setAccountOpen] = useState(false)
    const feeRate = usePlatformFee()

    const ownerFirstName = user.user_metadata?.first_name || ''

    const loadData = useCallback(async () => {
        const [{ data: contractRows, error: contractError }, { data: paymentRows, error: paymentError }] =
            await Promise.all([
                supabase.from('contract').select(CONTRACT_EMBED).order('start_date', { ascending: false }),
                supabase.from('payment').select('*').neq('status', 'Cancelled').order('payment_date', { ascending: true }),
            ])

        const firstError = contractError || paymentError
        if (firstError) {
            setLoadError(describeSupabaseError(firstError))
            return
        }

        const withPhotos = (contractRows || []).map((c) => ({
            ...c,
            add_business: c.add_business ? withCoverPhoto(c.add_business) : null,
        }))
        setContracts(withPhotos)
        setPayments(paymentRows || [])

        try {
            const [payoutRows, account] = await Promise.all([loadPayouts(), loadPayoutAccount()])
            setPayouts(payoutRows)
            setPayoutAccount(account)
            setPayoutError('')
        } catch (err) {
            setPayoutError(i18n.t('ownerPayments.transfersError', { message: err.message }))
        }

        const ids = withPhotos.map((c) => c.contract_id)
        if (ids.length > 0) {
            const { data: eventRows } = await supabase
                .from('lease_events')
                .select('*')
                .in('contract_id', ids)
                .order('created_at', { ascending: false })
            setEvents(eventRows || [])
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        const init = async () => {
            setLoading(true)
            setLoadError('')
            await refreshPaymentStatuses()
            await loadData()
            if (!cancelled) setLoading(false)
        }

        init()

        return () => {
            cancelled = true
        }
    }, [user.id, loadData])

    useEffect(() => {
        if (initialContractId) setSelectedId(Number(initialContractId))
    }, [initialContractId])

    const today = todayInElSalvador()

    const baseLeases = useMemo(
        () =>
            contracts
                .filter((c) => c.status === 'Active')
                .map((contract) => {
                    const installments = leaseInstallments(
                        payments.filter((p) => p.contract_id === contract.contract_id),
                        today
                    )
                    const stats = leaseStats(installments, today)
                    return { contract, installments, stats }
                })
                .sort(
                    (a, b) =>
                        b.stats.oldestLateDays - a.stats.oldestLateDays ||
                        b.stats.owedNow - a.stats.owedNow ||
                        (a.contract.add_business?.property_name || '').localeCompare(b.contract.add_business?.property_name || '')
                ),
        [contracts, payments, today]
    )
    const leases = baseLeases.map((lease) => ({ ...lease, risk: riskLevel(lease.stats) }))

    // Every installment with today's status and its lease attached (for the
    // CSV and month totals, which also include ended leases).
    const allRows = useMemo(() => {
        const byId = Object.fromEntries(contracts.map((c) => [c.contract_id, c]))
        return leaseInstallments(payments, today).map((p) => ({ ...p, contract: byId[p.contract_id] || null }))
    }, [contracts, payments, today])

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>{t('payments.loading')}</p>
            </div>
        )
    }

    const selectedLease = leases.find((l) => l.contract.contract_id === selectedId)
    if (selectedLease) {
        return (
            <OwnerLeaseDetail
                lease={selectedLease}
                events={events.filter((e) => e.contract_id === selectedLease.contract.contract_id)}
                ownerFirstName={ownerFirstName}
                ownerName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ')}
                feeRate={feeRate}
                payouts={payouts}
                onBack={() => setSelectedId(null)}
                onAskRony={onAskRony}
                onNoticeSent={loadData}
                onOpenContract={onOpenContract}
            />
        )
    }

    const monthKey = today.slice(0, 7)
    const lastMonthKey = monthKeyShift(monthKey, -1)
    const expectedIn = (key) => sumAmount(allRows.filter((p) => p.payment_date.slice(0, 7) === key))
    const collectedIn = (key) => sumAmount(allRows.filter((p) => p.status === 'Paid' && paidMonthKey(p) === key))
    const thisMonth = { expected: expectedIn(monthKey), collected: collectedIn(monthKey) }
    const lastMonth = { expected: expectedIn(lastMonthKey), collected: collectedIn(lastMonthKey) }
    const rate = (m) => (m.expected > 0 ? Math.round((m.collected / m.expected) * 100) : null)
    const late = allRows.filter((p) => p.status === 'Late')
    const lateTenants = new Set(late.map((p) => p.contract_id)).size

    const chartMonths = Array.from({ length: chartRange }, (_, i) => monthKeyShift(monthKey, i - (chartRange - 1))).map(
        (key) => ({
            key,
            label: monthLabel(key),
            fullLabel: monthLabel(key, 'long'),
            expected: expectedIn(key),
            collected: collectedIn(key),
        })
    )
    const hasChartData = chartMonths.some((m) => m.expected > 0 || m.collected > 0)
    const projection = incomeProjection(leases, today, 6)
    const insights = ownerInsights({ leases, thisMonth, projection, today })
    const projectionKeys = new Set(projection.months.map((m) => m.key))
    const projectedNet = sumNet(
        leases.flatMap(({ contract, installments }) =>
            installments.filter((p) => projectionKeys.has(p.payment_date.slice(0, 7))).map((p) => ({ ...p, contract }))
        ),
        feeRate
    )

    const upcoming = leases
        .flatMap(({ contract, installments }) =>
            installments
                .filter((p) => p.status === 'Pending' || p.status === 'Scheduled')
                .filter((p) => {
                    const d = daysUntil(p.payment_date, today)
                    return d >= 0 && d <= 30
                })
                .map((p) => ({ contract, p }))
        )
        .sort((a, b) => a.p.payment_date.localeCompare(b.p.payment_date))
    const upcomingTotal = sumAmount(upcoming.map((u) => u.p))
    const upcomingNet = sumNet(upcoming.map((u) => ({ ...u.p, contract: u.contract })), feeRate)
    const collectedNet = sumNet(allRows.filter((p) => p.status === 'Paid' && paidMonthKey(p) === monthKey), feeRate)
    const exampleRent = leases[0]?.contract.monthly_rent || allRows.find((p) => p.status === 'Paid')?.amount || 1000

    const historyDetail = allRows.find((p) => p.payment_id === historyDetailId) || null
    const tenantOf = (contract) => ({
        first_name: contract.users?.first_name,
        last_name: contract.users?.last_name,
        dui: contract.tenant_dui,
    })

    const handleReceipt = async (p) => {
        if (!p.contract) return
        setReceiptBusyId(p.payment_id)
        try {
            await downloadReceiptPdf({ payment: p, contract: p.contract, tenant: tenantOf(p.contract) })
        } catch (err) {
            console.error('Could not build the receipt PDF', err)
        } finally {
            setReceiptBusyId(null)
        }
    }

    const handleInsightAction = (action) => {
        if (action.type === 'open-lease') setSelectedId(action.contractId)
        if (action.type === 'open-contract') onOpenContract?.(action.contractId)
        if (action.type === 'ask-rony') onAskRony?.({ text: action.text })
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>{t('dashboard.nav.payments')}</h1>
                    <p>
                        {t('ownerPayments.subtitle', { ...BRAND_VALUES, rate: formatRate(feeRate) })}
                    </p>
                </div>
                {allRows.length > 0 && (
                    <div className="ns-dash-header-actions">
                        <ExportMenu
                            options={[
                                {
                                    id: 'report',
                                    icon: 'bi-file-earmark-pdf',
                                    label: t('ownerPayments.export.report'),
                                    description: t('ownerPayments.export.reportDesc', BRAND_VALUES),
                                    onSelect: async () => setReportOpen(true),
                                },
                                {
                                    id: 'xlsx',
                                    icon: 'bi-file-earmark-spreadsheet',
                                    label: t('ownerPayments.export.excel'),
                                    description: t('ownerPayments.export.excelDesc'),
                                    onSelect: () => downloadOwnerWorkbook({ leases, allRows, projection, feeRate }),
                                },
                            ]}
                        />
                    </div>
                )}
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            <SectionNav
                label={t('payments.sectionsLabel')}
                sections={[
                    { id: 'pay-today', label: t('notifications.groups.today'), icon: 'bi-sun' },
                    { id: 'pay-properties', label: t('ownerPayments.yourProperties'), icon: 'bi-shop', count: leases.length },
                    { id: 'pay-transfers', label: t('ownerPayments.transfers'), icon: 'bi-bank' },
                    { id: 'pay-analysis', label: t('ownerPayments.analysis'), icon: 'bi-graph-up' },
                    { id: 'pay-history', label: t('contractDetail.history'), icon: 'bi-clock-history' },
                ]}
            />

            <PageGroup id="pay-today" title={t('notifications.groups.today')} hint={t('ownerPayments.todayHint')}>
                <RonyInsightCard
                    insights={insights}
                    onAction={handleInsightAction}
                    onAskRony={
                        onAskRony
                            ? () => onAskRony({ text: t('ownerPayments.askSummary') })
                            : undefined
                    }
                />

                <div className="ns-kpi-row">
                    <div className="ns-kpi">
                        <span className="ns-kpi-label">{t('ownerPayments.kpi.collectedIn', { month: monthLabel(monthKey, 'long') })}</span>
                        <span className="ns-kpi-value">{money(thisMonth.collected)}</span>
                        {thisMonth.collected > 0 && (
                            <span className="ns-kpi-sub">{t('ownerPayments.kpi.toYouAfterFee', { ...BRAND_VALUES, amount: money(collectedNet) })}</span>
                        )}
                        <Trend current={thisMonth.collected} previous={lastMonth.collected} />
                    </div>
                    <div className="ns-kpi">
                        <span className="ns-kpi-label">{t('ownerPayments.kpi.expected')}</span>
                        <span className="ns-kpi-value">{money(thisMonth.expected)}</span>
                        <Trend current={thisMonth.expected} previous={lastMonth.expected} />
                    </div>
                    <div className="ns-kpi">
                        <span className="ns-kpi-label">{t('docs.reports.collectionRate')}</span>
                        <span className="ns-kpi-value">{rate(thisMonth) == null ? DASH : `${rate(thisMonth)}%`}</span>
                        {rate(thisMonth) != null && rate(lastMonth) != null ? (
                            <Trend current={rate(thisMonth)} previous={rate(lastMonth)} points />
                        ) : (
                            <span className="ns-trend">{t('ownerPayments.kpi.ofRentDue')}</span>
                        )}
                    </div>
                    <div className={`ns-kpi ${late.length > 0 ? 'is-alert' : ''}`}>
                        <span className="ns-kpi-label">{t('ownerPayments.kpi.overdue')}</span>
                        <span className="ns-kpi-value">{money(sumAmount(late))}</span>
                        <span className="ns-trend">
                            {lateTenants === 0 ? t('ownerPayments.kpi.nobodyLate') : t('ownerPayments.kpi.tenantsLate', { count: lateTenants })}
                        </span>
                    </div>
                </div>

                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>{t('ownerPayments.next30.title')}</h3>
                        <span>
                            {t('ownerPayments.next30.coming', { amount: money(upcomingTotal) })}
                            {upcomingTotal > 0 ? ` ${DOT} ${t('ownerPayments.next30.toYou', { amount: money(upcomingNet) })}` : ''}
                        </span>
                    </div>
                    {upcoming.length === 0 ? (
                        <p className="ns-pay-muted mb-0">{t('ownerPayments.next30.none')}</p>
                    ) : (
                        <ul className="ns-upcoming ns-upcoming-wide">
                            {upcoming.slice(0, 8).map(({ contract, p }) => {
                                const cd = dueCountdown(p.payment_date, today)
                                return (
                                    <li key={p.payment_id}>
                                        <button type="button" onClick={() => setSelectedId(contract.contract_id)}>
                                            <span className="ns-upcoming-date">
                                                <small>{formatDueDate(p.payment_date, { month: 'short' }).toUpperCase()}</small>
                                                <strong>{formatDueDate(p.payment_date, { day: 'numeric' })}</strong>
                                            </span>
                                            <span className="ns-upcoming-info">
                                                <strong>{tenantName(contract.users)}</strong>
                                                <small>
                                                    {contract.add_business?.property_name} {DOT} {cd.text}
                                                </small>
                                            </span>
                                            <span className="ns-upcoming-amount">{money(p.amount)}</span>
                                        </button>
                                    </li>
                                )
                            })}
                            {upcoming.length > 8 && <li className="ns-pay-muted">{t('ownerPayments.more', { count: upcoming.length - 8 })}</li>}
                        </ul>
                    )}
                </section>
            </PageGroup>

            <PageGroup
                id="pay-properties"
                title={t('ownerPayments.yourProperties')}
                hint={t('ownerPayments.propertiesHint', { count: leases.length, dot: DOT })}
            >
                {leases.length === 0 ? (
                    <p className="ns-pay-muted mb-4">
                        {t('ownerPayments.noLeases')}
                    </p>
                ) : (
                    <div className="ns-lease-grid">
                        {leases.map(({ contract, stats, risk }) => {
                            const next = stats.nextUnpaid
                            const status =
                                stats.lateMonths > 0 ? 'late' : stats.owedNow > 0 ? 'due' : next ? 'ok' : 'done'
                            return (
                                <article
                                    key={contract.contract_id}
                                    className={`ns-lease-card status-${status}`}
                                    onClick={() => setSelectedId(contract.contract_id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') setSelectedId(contract.contract_id)
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={t('propertyCard.open', { name: contract.add_business?.property_name || t('docs.reports.lease') })}
                                >
                                    <div className="ns-lease-card-photo">
                                        {contract.add_business?.photo_url ? (
                                            <img src={contract.add_business.photo_url} alt="" />
                                        ) : (
                                            <i className="bi bi-shop"></i>
                                        )}
                                        <span className={`ns-lease-card-status status-${status}`}>
                                            {status === 'late'
                                                ? t('rent.daysLate', { count: stats.oldestLateDays })
                                                : status === 'due'
                                                  ? t('ownerPayments.card.dueNow')
                                                  : status === 'done'
                                                    ? t('payments.tabs.fullyPaid')
                                                    : t('payments.tabs.upToDate')}
                                        </span>
                                    </div>
                                    <div className="ns-lease-card-body">
                                        <div className="ns-lease-card-top">
                                            <div>
                                                <h4>{contract.add_business?.property_name || t('common.property')}</h4>
                                                <span>{tenantName(contract.users)}</span>
                                            </div>
                                            <ProgressRing
                                                size={48}
                                                stroke={5}
                                                value={stats.monthsTotal > 0 ? stats.monthsPaid / stats.monthsTotal : 0}
                                                label={t('ownerPayments.card.monthsPaid', { paid: stats.monthsPaid, count: stats.monthsTotal })}
                                            >
                                                <small>
                                                    {stats.monthsPaid}/{stats.monthsTotal}
                                                </small>
                                            </ProgressRing>
                                        </div>
                                        <div className="ns-lease-card-facts">
                                            <div>
                                                <small>{t('docs.reports.owedNow')}</small>
                                                <strong className={stats.lateMonths > 0 ? 'is-bad' : ''}>{money(stats.owedNow)}</strong>
                                            </div>
                                            <div>
                                                <small>{stats.lateMonths > 0 ? t('ownerPayments.card.lateSince') : t('ownerPayments.card.nextDue')}</small>
                                                <strong>{next ? formatDueDate(next.payment_date, { month: 'short', day: 'numeric' }) : DASH}</strong>
                                            </div>
                                            <div>
                                                <small>{t('propertyDetail.rent')}</small>
                                                <strong>{money(contract.monthly_rent)}</strong>
                                            </div>
                                        </div>
                                        <div className="ns-lease-card-foot">
                                            <RiskBadge
                                                risk={risk}
                                                onAskRony={
                                                    onAskRony
                                                        ? () =>
                                                              onAskRony({
                                                                  text: t('ownerPayments.askTenant', { tenant: tenantName(contract.users), name: contract.add_business?.property_name }),
                                                              })
                                                        : undefined
                                                }
                                            />
                                            <span className="ns-link-btn">
                                                {t('ownerPayments.card.details')} <i className="bi bi-arrow-right"></i>
                                            </span>
                                        </div>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                )}
            </PageGroup>

 
            <PageGroup
                id="pay-transfers"
                title={t('ownerPayments.transfers')}
                hint={t('ownerPayments.transfersHint', { ...BRAND_VALUES, rate: formatRate(feeRate) })}
            >
                <OwnerTransfers
                    rows={allRows}
                    payouts={payouts}
                    account={payoutAccount}
                    rate={feeRate}
                    exampleRent={exampleRent}
                    loadError={payoutError}
                    onEditAccount={() => setAccountOpen(true)}
                />
            </PageGroup>

            <PageGroup id="pay-analysis" title={t('ownerPayments.analysis')} hint={t('ownerPayments.analysisHint')}>
                <div className="ns-pay-grid-2 ns-pay-grid-even">
                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>{t('ownerPayments.chart.title')}</h3>
                        <div className="ns-segmented" role="radiogroup" aria-label={t('ownerPayments.chart.range')}>
                            {[6, 12].map((n) => (
                                <button
                                    type="button"
                                    key={n}
                                    role="radio"
                                    aria-checked={chartRange === n}
                                    className={chartRange === n ? 'active' : ''}
                                    onClick={() => setChartRange(n)}
                                >
                                    {t('common.month', { count: n })}
                                </button>
                            ))}
                        </div>
                    </div>
                    {hasChartData ? (
                        <CollectionsChart months={chartMonths} />
                    ) : (
                        <p className="ns-pay-muted mb-0">{t('ownerPayments.chart.empty')}</p>
                    )}
                </section>

                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>{t('ownerPayments.projection.title')}</h3>
                        <span>{t('ownerPayments.projection.hint')}</span>
                    </div>
                    {leases.length === 0 ? (
                        <p className="ns-pay-muted mb-0">{t('contractsBoard.sections.activeEmpty')}</p>
                    ) : (
                        <>
                            <IncomeProjectionChart projection={projection} />
                            <p className="ns-pay-muted mt-2 mb-0">
                                {t('ownerPayments.projection.note', { ...BRAND_VALUES, rate: formatRate(feeRate), amount: money(projectedNet) })}
                            </p>
                        </>
                    )}
                </section>
                </div>
            </PageGroup>

            <PageGroup id="pay-history" title={t('contractDetail.history')}>
                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>{t('payments.historyTitle')}</h3>
                        <span>{t('ownerPayments.historyHint')}</span>
                    </div>
                    <PaymentHistory
                        rows={allRows}
                        viewer="owner"
                        onOpen={(p) => setHistoryDetailId(p.payment_id)}
                        onReceipt={handleReceipt}
                        receiptBusyId={receiptBusyId}
                        feeRate={feeRate}
                    />
                </section>
            </PageGroup>

            {reportOpen && (
                <MonthlyReportModal
                    leases={leases}
                    allRows={allRows}
                    ownerName={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ')}
                    feeRate={feeRate}
                    onClose={() => setReportOpen(false)}
                />
            )}

            {accountOpen && (
                <PayoutAccountModal
                    ownerDui={user.user_metadata?.dui}
                    account={payoutAccount}
                    defaultHolder={[user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ')}
                    onSaved={(saved) => {
                        setPayoutAccount(saved)
                        setAccountOpen(false)
                    }}
                    onClose={() => setAccountOpen(false)}
                />
            )}

            {historyDetail && historyDetail.contract && (
                <PaymentDetailModal
                    payment={historyDetail}
                    contract={historyDetail.contract}
                    tenant={tenantOf(historyDetail.contract)}
                    viewer="owner"
                    feeRate={feeRate}
                    payout={payouts.find((t) => t.payout_id === historyDetail.payout_id)}
                    onClose={() => setHistoryDetailId(null)}
                />
            )}
        </>
    )
}
