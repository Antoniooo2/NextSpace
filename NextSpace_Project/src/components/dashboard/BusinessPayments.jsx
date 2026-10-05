import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_VALUES } from '../../lib/brand'
import { contractStatusLabel } from '../../lib/displayValues'
import { ARROW_RIGHT, DASH, DOT } from '../../lib/symbols'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import {
    PAYMENTS_NOT_CONFIGURED,
    daysUntil,
    dueCountdown,
    effectiveStatus,
    formatDueDate,
    isPayable,
    refreshPaymentStatuses,
    todayInElSalvador,
} from '../../lib/rentSchedule'
import {
    incomeProjection,
    leaseInstallments,
    leaseStats,
    leaseTimeProgress,
    tenantInsights,
} from '../../lib/leaseInsights'
import { downloadReceiptPdf } from '../../lib/paymentDocuments'
import { downloadLeaseStatementPdf, downloadLeaseWorkbook } from '../../lib/paymentReports'
import ExportMenu from './payments/ExportMenu'
import PaymentDetailModal from './PaymentDetailModal'
import IncomeProjectionChart from './payments/IncomeProjectionChart'
import LeaseTimeline from './payments/LeaseTimeline'
import PaymentHistory from './payments/PaymentHistory'
import ProgressRing from './payments/ProgressRing'
import { RenewalRequestModal } from './contracts/RenewalModals'
import { renewalOpen, renewalState } from '../../lib/contracts'
import RonyInsightCard from './payments/RonyInsightCard'
import { PageGroup, SectionNav } from './common/PageSections'
import './payments/payments.css'
import { money } from '../../lib/money'

const CONTRACT_EMBED = `*, add_business!contract_property_id_fkey(property_name, owner_id, ${PROPERTY_PHOTO_EMBED}, users!add_business_owner_id_fkey(first_name,last_name))`

// Which lease to open first when there are several: the one that owes the
// oldest late month, then the one with the soonest due month, then the first.
function mostUrgentContractId(contracts, payments, today) {
    const open = payments
        .map((p) => ({ ...p, status: effectiveStatus(p, today) }))
        .filter((p) => isPayable(p.status))
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    return open[0]?.contract_id ?? contracts[0]?.contract_id ?? null
}

export default function BusinessPayments({ user, onNavigate, onAskRony, initialContractId }) {
    const { t } = useTranslation()
    const [contracts, setContracts] = useState([])
    const [selectedId, setSelectedId] = useState(null)
    const [hasPendingRequest, setHasPendingRequest] = useState(false)
    const [allPayments, setAllPayments] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [payError, setPayError] = useState(null)
    const [paying, setPaying] = useState(false)
    const [detailPaymentId, setDetailPaymentId] = useState(null)
    const [receiptBusyId, setReceiptBusyId] = useState(null)
    const [returnState, setReturnState] = useState(null)
    const [returnPaymentId, setReturnPaymentId] = useState(null)
    const [renewalFor, setRenewalFor] = useState(null)
    const [notice, setNotice] = useState('')

    const loadPayments = useCallback(async (contractIds) => {
        if (contractIds.length === 0) {
            setAllPayments([])
            return []
        }

        const { data: paymentRows, error: paymentError } = await supabase
            .from('payment')
            .select('*')
            .in('contract_id', contractIds)
            .neq('status', 'Cancelled')
            .order('payment_date', { ascending: true })

        if (paymentError) {
            setLoadError(describeSupabaseError(paymentError))
            return []
        }

        setAllPayments(paymentRows || [])
        return paymentRows || []
    }, [])

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            setLoadError('')

            await refreshPaymentStatuses()

            const { data: contractRows, error: contractError } = await supabase
                .from('contract')
                .select(CONTRACT_EMBED)
                .order('start_date', { ascending: true })

            if (cancelled) return

            if (contractError) {
                setLoadError(describeSupabaseError(contractError))
                setLoading(false)
                return
            }

            // Only an accepted (Active) lease has rent to pay. A Pending contract
            // is still just a request the owner hasn't accepted, and Expired or
            // Cancelled ones are over, so none of those should offer "Pay now".
            const active = (contractRows || [])
                .filter((c) => c.status === 'Active')
                .map((c) => ({ ...c, add_business: c.add_business && withCoverPhoto(c.add_business) }))
            setContracts(active)
            setHasPendingRequest((contractRows || []).some((c) => c.status === 'Pending' || c.status === 'Offered'))

            const rows = await loadPayments(active.map((c) => c.contract_id))
            if (cancelled) return

            const requested = active.find((c) => c.contract_id === Number(initialContractId))
            setSelectedId(requested ? requested.contract_id : mostUrgentContractId(active, rows, todayInElSalvador()))
            setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [user.id, loadPayments, initialContractId])

    const contractIdsRef = useRef([])
    contractIdsRef.current = contracts.map((c) => c.contract_id)
    const reloadAllPayments = useCallback(() => loadPayments(contractIdsRef.current), [loadPayments])

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (params.get('wompi') !== 'return') return

        const returnedPaymentId = Number(params.get('paymentId'))

        params.delete('wompi')
        params.delete('paymentId')
        const cleanQuery = params.toString()
        window.history.replaceState({}, '', `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}`)

        if (!returnedPaymentId) return

        setReturnPaymentId(returnedPaymentId)

        let cancelled = false
        setReturnState('checking')

        const poll = async (attemptsLeft) => {
            const { data } = await supabase
                .from('payment')
                .select('status, contract_id')
                .eq('payment_id', returnedPaymentId)
                .single()

            if (cancelled) return

            if (data?.status === 'Paid') {
                setReturnState('paid')
                setSelectedId(data.contract_id)
                await reloadAllPayments()
                return
            }

            if (attemptsLeft <= 0) {
                setReturnState('pending')
                return
            }

            setTimeout(() => poll(attemptsLeft - 1), 2000)
        }

        poll(6)

        return () => {
            cancelled = true
        }
    }, [reloadAllPayments])

    const checkPaymentAgain = async () => {
        if (!returnPaymentId) return
        setReturnState('checking')

        const { data } = await supabase
            .from('payment')
            .select('status, contract_id')
            .eq('payment_id', returnPaymentId)
            .single()

        if (data?.status === 'Paid') {
            setReturnState('paid')
            setSelectedId(data.contract_id)
            await reloadAllPayments()
        } else {
            setReturnState('pending')
        }
    }

    const today = todayInElSalvador()

    // Every active lease with its months (today's status), totals and dates.
    const leases = contracts.map((c) => {
        const installments = leaseInstallments(
            allPayments.filter((p) => p.contract_id === c.contract_id),
            today
        )
        return { contract: c, installments, stats: leaseStats(installments, today) }
    })
    const current = leases.find((l) => l.contract.contract_id === selectedId) || leases[0] || null
    const contract = current?.contract || null
    const installments = current?.installments || []
    const stats = current?.stats || null
    const payable = installments.filter((p) => isPayable(p.status))
    // Always the oldest outstanding month first, so a tenant can't pay October
    // while September is still late.
    const nextToPay = payable[0] || null
    const nextScheduled = installments.find((p) => p.status === 'Scheduled') || null

    // All leases' months with their lease attached, for history and details.
    const allRows = leases.flatMap((l) => l.installments.map((p) => ({ ...p, contract: l.contract })))
    const detailPayment = allRows.find((p) => p.payment_id === detailPaymentId) || null
    const oldestPayableOf = (contractId) =>
        allRows.find((p) => p.contract.contract_id === contractId && isPayable(p.status)) || null

    const meta = user.user_metadata || {}
    const tenantInfo = { first_name: meta.first_name, last_name: meta.last_name, dui: meta.dui }

    const handleReceipt = async (payment) => {
        setReceiptBusyId(payment.payment_id)
        try {
            await downloadReceiptPdf({ payment, contract: payment.contract || contract, tenant: tenantInfo })
        } catch (err) {
            console.error('Could not build the receipt PDF', err)
            setPayError({ text: t('payments.receiptError') })
        } finally {
            setReceiptBusyId(null)
        }
    }

    const payInstallment = async (payment) => {
        if (!payment) return

        setPaying(true)
        setPayError(null)

        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData?.session?.access_token

        if (!accessToken) {
            setPaying(false)
            setPayError({ text: t('payments.sessionExpired') })
            return
        }

        let result
        try {
            const response = await fetch('/api/wompi/create-payment-link', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ paymentId: payment.payment_id }),
            })
            result = await response.json().catch(() => ({}))
            if (result.code === PAYMENTS_NOT_CONFIGURED) {
                setPaying(false)
                setPayError({ notConfigured: true })
                return
            }
            if (!response.ok || !result.url) {
                throw new Error(result.error || t('payments.startFailed', BRAND_VALUES))
            }
        } catch (err) {
            setPaying(false)
            setPayError({ text: err.message || t('payments.startFailedRetry', BRAND_VALUES) })
            return
        }

        window.location.href = result.url
    }

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>{t('payments.loading')}</p>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="alert alert-danger py-2" role="alert">
                {loadError}
            </div>
        )
    }

    if (!contract) {
        return (
            <div className="ns-empty-state">
                <i className="bi bi-credit-card"></i>
                <h3>{hasPendingRequest ? t('payments.tenant.empty.waitingTitle') : t('payments.tenant.empty.noLeaseTitle')}</h3>
                <p>
                    {hasPendingRequest
                        ? t('payments.tenant.empty.waitingText')
                        : t('payments.tenant.empty.noLeaseText')}
                </p>
                {onNavigate && (
                    <button
                        type="button"
                        className="ns-outline-btn"
                        onClick={() => onNavigate(hasPendingRequest ? 'contracts' : 'home')}
                    >
                        {hasPendingRequest ? t('payments.tenant.empty.viewContracts') : t('payments.tenant.empty.browse')}
                    </button>
                )}
            </div>
        )
    }

    // One tab per active lease, each with where it stands right now.
    const leaseTabs = leases.map(({ contract: c, installments: rows, stats: st }) => {
        const tone = st.lateMonths > 0 ? 'danger' : st.owedNow > 0 ? 'warning' : 'success'
        const label =
            tone === 'danger'
                ? t('payments.tabs.monthsLate', { count: st.lateMonths })
                : tone === 'warning'
                  ? t('payments.tabs.due', { amount: money(st.owedNow) })
                  : rows.length > 0 && rows.every((p) => p.status === 'Paid')
                    ? t('payments.tabs.fullyPaid')
                    : t('payments.tabs.upToDate')
        return { contract: c, tone, label }
    })

    const insights = tenantInsights({ leases, today })
    const projection = incomeProjection(leases, today, 6)
    const property = contract.add_business
    const owner = property?.users
    const countdown = nextToPay ? dueCountdown(nextToPay.payment_date, today) : null
    const daysToNext = nextScheduled ? daysUntil(nextScheduled.payment_date, today) : null
    const daysToDue = nextToPay ? daysUntil(nextToPay.payment_date, today) : null
    const daysToEnd = contract.end_date ? daysUntil(contract.end_date, today) : null
    const renewal = renewalState(contract)
    const canAskRenewal = renewalOpen(contract, today) && !renewal
    const yearEnd = `${today.slice(0, 4)}-12-31`
    const leftThisYear = installments
        .filter((p) => p.status !== 'Paid' && p.payment_date <= yearEnd)
        .reduce((s, p) => s + Number(p.amount), 0)
    const onTimePct = stats.onTimeRate == null ? null : Math.round(stats.onTimeRate * 100)
    const timeProgress = leaseTimeProgress(contract, today)

    // Countdown ring: fills up over the 30 days before the due date; full and
    // red once late.
    const ringValue = nextToPay ? (daysToDue < 0 ? 1 : Math.min(1, Math.max(0.05, 1 - daysToDue / 30))) : 0
    const ringTone = nextToPay ? (daysToDue < 0 ? 'danger' : 'warning') : 'success'

    const handleInsightAction = (action) => {
        if (action.type === 'select-lease') {
            setSelectedId(action.contractId)
            setPayError(null)
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
        if (action.type === 'renewal-request') setRenewalFor(action.contractId)
        if (action.type === 'open-contract') onNavigate?.('contracts', { contractId: action.contractId })
    }

    const renewalLease = leases.find((l) => l.contract.contract_id === renewalFor) || null

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>{t('dashboard.nav.payments')}</h1>
                    <p>
                        {leases.length > 1
                            ? t('payments.tenant.subtitleMany', { ...BRAND_VALUES, count: leases.length })
                            : t('payments.tenant.subtitleOne', { ...BRAND_VALUES, name: property?.property_name || t('offerModal.yourSpace') })}
                    </p>
                </div>
                <div className="ns-dash-header-actions">
                    {onAskRony && (
                        <button
                            type="button"
                            className="ns-outline-btn"
                            onClick={() =>
                                onAskRony({
                                    text: t('payments.tenant.askSituation', { name: property?.property_name || t('payments.tenant.myLease') }),
                                })
                            }
                        >
                            <i className="bi bi-stars"></i> {t('insights.owner.askRony', BRAND_VALUES)}
                        </button>
                    )}
                    {installments.length > 0 && (
                        <ExportMenu
                            options={[
                                {
                                    id: 'statement',
                                    icon: 'bi-file-earmark-pdf',
                                    label: t('payments.export.statement'),
                                    description: t('payments.export.statementDesc', { name: property?.property_name || t('payments.export.thisLease') }),
                                    onSelect: () => downloadLeaseStatementPdf({ contract, installments, tenant: tenantInfo }),
                                },
                                {
                                    id: 'statement-year',
                                    icon: 'bi-calendar3',
                                    label: t('payments.export.statementYear', { year: today.slice(0, 4) }),
                                    description: t('payments.export.statementYearDesc'),
                                    onSelect: () =>
                                        downloadLeaseStatementPdf({
                                            contract,
                                            installments,
                                            tenant: tenantInfo,
                                            period: today.slice(0, 4),
                                        }),
                                },
                                {
                                    id: 'xlsx',
                                    icon: 'bi-file-earmark-spreadsheet',
                                    label: t('payments.export.excel'),
                                    description: t('payments.export.excelDesc'),
                                    onSelect: () => downloadLeaseWorkbook({ contract, installments, tenant: tenantInfo }),
                                },
                            ]}
                        />
                    )}
                </div>
            </div>

            {returnState === 'checking' && (
                <div className="alert alert-info d-flex align-items-center gap-2 py-2" role="status">
                    <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
                    {t('payments.return.checking', BRAND_VALUES)}
                </div>
            )}
            {returnState === 'paid' && (
                <div className="alert alert-success d-flex align-items-center gap-2 py-2" role="status">
                    <i className="bi bi-check-circle-fill"></i> {t('payments.return.paid')}
                </div>
            )}
            {returnState === 'pending' && (
                <div className="alert alert-warning d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>
                        <i className="bi bi-hourglass-split"></i> {t('payments.return.pending', BRAND_VALUES)}
                    </span>
                    <button type="button" className="ns-outline-btn" onClick={checkPaymentAgain}>
                        {t('payments.return.checkAgain')}
                    </button>
                </div>
            )}
            {notice && (
                <div className="alert alert-success d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>
                        <i className="bi bi-check-circle-fill"></i> {notice}
                    </span>
                    <button type="button" className="btn-close" aria-label={t('common.dismiss')} onClick={() => setNotice('')} />
                </div>
            )}

            {leaseTabs.length > 1 && (
                <div className="ns-pay-lease-tabs" role="tablist" aria-label={t('payments.tabs.label')}>
                    {leaseTabs.map(({ contract: c, tone, label }) => (
                        <button
                            key={c.contract_id}
                            type="button"
                            role="tab"
                            aria-selected={c.contract_id === contract.contract_id}
                            className={`ns-pay-lease-tab ${c.contract_id === contract.contract_id ? 'active' : ''}`}
                            onClick={() => {
                                setSelectedId(c.contract_id)
                                setPayError(null)
                            }}
                        >
                            <span className="ns-pay-lease-tab-thumb">
                                {c.add_business?.photo_url ? (
                                    <img src={c.add_business.photo_url} alt="" />
                                ) : (
                                    <i className="bi bi-shop"></i>
                                )}
                            </span>
                            <span className="ns-pay-lease-tab-text">
                                <span className="ns-pay-lease-tab-name">{c.add_business?.property_name || t('common.property')}</span>
                                <span className={`ns-pay-lease-tab-status tone-${tone}`}>
                                    <span className="ns-pay-lease-tab-dot" /> {label}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <SectionNav
                label={t('payments.sectionsLabel')}
                sections={[
                    { id: 'pay-lease', label: leases.length > 1 ? t('payments.tenant.thisLease') : t('payments.tenant.yourLease'), icon: 'bi-shop' },
                    { id: 'pay-coming', label: t('payments.next6'), icon: 'bi-graph-up' },
                    { id: 'pay-history', label: t('contractDetail.history'), icon: 'bi-clock-history' },
                ]}
            />

            <PageGroup
                id="pay-lease"
                title={leases.length > 1 ? t('payments.tenant.thisLease') : t('payments.tenant.yourLease')}
                hint={t('payments.tenant.leaseHint', { name: property?.property_name || t('common.property'), dot: DOT })}
            >
                <div className="ns-pay-top-grid ns-pay-top-grid-v2 ns-pay-top-grid-v3">
                <div className="ns-pay-due-card ns-pay-due-card-v2">
                    {nextToPay ? (
                        <>
                            <div className="ns-due-hero">
                                <ProgressRing
                                    size={92}
                                    stroke={8}
                                    value={ringValue}
                                    tone={ringTone}
                                    label={countdown.text}
                                >
                                    {daysToDue < 0 ? (
                                        <span className="ns-due-ring-text is-late">
                                            <strong>{-daysToDue}</strong>
                                            <small>{t('payments.ring.daysLate', { count: -daysToDue })}</small>
                                        </span>
                                    ) : daysToDue === 0 ? (
                                        <span className="ns-due-ring-text">
                                            <strong>{t('notifications.groups.today')}</strong>
                                        </span>
                                    ) : (
                                        <span className="ns-due-ring-text">
                                            <strong>{daysToDue}</strong>
                                            <small>{t('payments.ring.daysLeft', { count: daysToDue })}</small>
                                        </span>
                                    )}
                                </ProgressRing>
                                <div>
                                    <span className={`ns-pay-countdown tone-${countdown.tone}`}>{countdown.text}</span>
                                    <p className="ns-pay-due-amount">{money(nextToPay.amount)}</p>
                                    <p className="ns-pay-due-desc">
                                        {t('payments.dueDesc', {
                                            month: formatDueDate(nextToPay.payment_date, { month: 'long', year: 'numeric' }),
                                            date: formatDueDate(nextToPay.payment_date, { month: 'short', day: 'numeric' }),
                                            dot: DOT,
                                        })}
                                    </p>
                                </div>
                            </div>
                            {payable.length > 1 && (
                                <p className="ns-pay-due-extra">
                                    {t('payments.tenant.outstanding', { count: payable.length, total: money(stats.owedNow), dot: DOT })}
                                </p>
                            )}
                            <button
                                type="button"
                                className="ns-filled-btn ns-pay-full-btn"
                                onClick={() => payInstallment(nextToPay)}
                                disabled={paying}
                            >
                                {paying ? t('payments.opening', BRAND_VALUES) : t('payments.payWith', { ...BRAND_VALUES, amount: money(nextToPay.amount) })}
                            </button>
                            <p className="ns-pay-simulation-note">
                                <i className="bi bi-shield-lock"></i> {t('payments.secure', BRAND_VALUES)}
                            </p>
                        </>
                    ) : nextScheduled ? (
                        <div className="ns-due-hero">
                            <ProgressRing size={92} stroke={8} value={1} tone="success" label={t('payments.caughtUp')}>
                                <span className="ns-due-ring-text">
                                    <i className="bi bi-check-lg ns-due-check"></i>
                                </span>
                            </ProgressRing>
                            <div>
                                <span className="ns-pay-countdown tone-success">{t('payments.caughtUp')}</span>
                                <p className="ns-pay-due-amount">{money(nextScheduled.amount)}</p>
                                <p className="ns-pay-due-desc">
                                    {t('payments.tenant.nextPayment', {
                                        date: formatDueDate(nextScheduled.payment_date, { month: 'short', day: 'numeric' }),
                                        when: t('insights.tenant.inDays', { count: daysToNext }),
                                        dot: DOT,
                                    })}
                                </p>
                            </div>
                        </div>
                    ) : installments.length > 0 ? (
                        <div className="ns-due-hero">
                            <ProgressRing size={92} stroke={8} value={1} tone="success" label={t('payments.fullyPaid')}>
                                <span className="ns-due-ring-text">
                                    <i className="bi bi-patch-check-fill ns-due-check"></i>
                                </span>
                            </ProgressRing>
                            <div>
                                <span className="ns-pay-countdown tone-success">{t('payments.fullyPaid')}</span>
                                <p className="ns-pay-due-desc">{t('payments.fullyPaidText')}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <span className="ns-pay-countdown tone-neutral">
                                <i className="bi bi-calendar2-x"></i> {t('payments.noSchedule')}
                            </span>
                            <p className="ns-pay-due-desc">
                                {t('payments.tenant.noScheduleText')}
                            </p>
                        </>
                    )}
                </div>

                <div className="ns-pay-lease-card ns-pay-lease-card-compact">
                    <div className="ns-pay-lease-head">
                        <div className="ns-pay-lease-thumb">
                            {property?.photo_url ? (
                                <img src={property.photo_url} alt={property.property_name} />
                            ) : (
                                <i className="bi bi-shop"></i>
                            )}
                        </div>
                        <div className="ns-pay-lease-head-info">
                            <div className="ns-pay-lease-head-title">
                                <h2>{property?.property_name || t('common.property')}</h2>
                                <span className="ns-pay-tag tag-active">{contractStatusLabel(contract.status)}</span>
                            </div>
                            <p className="ns-pay-lease-meta">
                                {t('common.owner')}: <strong>{owner ? `${owner.first_name} ${owner.last_name}` : DASH}</strong>
                                <span className="ns-pay-dot">{DOT}</span>
                                {formatDueDate(contract.start_date)} {ARROW_RIGHT} {formatDueDate(contract.end_date)}
                            </p>
                        </div>
                        <div className="ns-pay-rent">
                            {money(contract.monthly_rent)}
                            <small>{t('payments.perMo')}</small>
                        </div>
                    </div>

                    <div className="ns-pay-progress">
                        <div className="ns-pay-progress-labels">
                            <span>
                                <strong>{stats.monthsPaid}</strong> {t('payments.monthsPaidOf', { count: stats.monthsTotal })}
                            </span>
                            <span>
                                {daysToEnd == null ? '' : daysToEnd >= 0 ? t('payments.daysLeftLease', { count: daysToEnd }) : t('contracts.events.expired')}
                            </span>
                        </div>
                        <div className="ns-pay-progress-track" role="progressbar" aria-valuenow={Math.round(timeProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
                            <div className="ns-pay-progress-fill ns-fill-navy" style={{ width: `${Math.round(timeProgress * 100)}%` }} />
                        </div>
                    </div>

                    <div className="ns-pay-lease-footer">
                        <span className="ns-pay-contract-id">{t('contractDetail.contractNumber', { id: contract.contract_id })}</span>
                        {canAskRenewal ? (
                            <button type="button" className="ns-link-btn" onClick={() => setRenewalFor(contract.contract_id)}>
                                <i className="bi bi-arrow-repeat"></i> {t('notifications.actions.askToRenew')}
                            </button>
                        ) : renewal === 'offered' ? (
                            <button
                                type="button"
                                className="ns-link-btn"
                                onClick={() => onNavigate('contracts', { contractId: contract.contract_id })}
                            >
                                <i className="bi bi-pen"></i> {t('payments.tenant.reviewRenewalOffer')}
                            </button>
                        ) : (
                            <button type="button" className="ns-link-btn" onClick={() => onNavigate('contracts')}>
                                {t('payments.viewContract')} <i className="bi bi-box-arrow-up-right"></i>
                            </button>
                        )}
                    </div>
                </div>
                </div>

                {payError?.notConfigured && (
                    <div className="alert alert-warning d-flex align-items-start gap-2 py-2" role="alert">
                        <i className="bi bi-plug"></i>
                        <span>
                            {t('payments.notConfigured')}
                        </span>
                    </div>
                )}
                {payError?.text && (
                    <div className="alert alert-danger py-2" role="alert">
                        {payError.text}
                    </div>
                )}

                <RonyInsightCard
                    insights={insights}
                    onAction={handleInsightAction}
                    onAskRony={
                        onAskRony
                            ? () => onAskRony({ text: t('payments.tenant.askOwe') })
                            : undefined
                    }
                />

                <div className="ns-lease-kpis">
                    <div className="ns-lease-kpi">
                        <ProgressRing
                            value={stats.monthsDue > 0 ? stats.paidOnTime / stats.monthsDue : 0}
                            tone={onTimePct == null || onTimePct >= 85 ? 'success' : 'warning'}
                            label={t('payments.kpi.onTimeLabel', { count: stats.monthsDue, paid: stats.paidOnTime })}
                        >
                            <strong>{stats.paidOnTime}</strong>
                            <small>/{stats.monthsDue}</small>
                        </ProgressRing>
                        <div>
                            <span className="ns-lease-kpi-value">{t('payments.kpi.onTimeRecord')}</span>
                            <span className="ns-lease-kpi-label">
                                {stats.monthsDue === 0
                                    ? t('payments.kpi.nothingDue')
                                    : onTimePct === 100
                                      ? t('payments.kpi.everyMonth')
                                      : t('payments.kpi.pctOnTime', { pct: onTimePct })}
                            </span>
                        </div>
                    </div>
                    <div className="ns-lease-kpi">
                        <span className="ns-lease-kpi-big">{money(stats.collectedTotal)}</span>
                        <div>
                            <span className="ns-lease-kpi-value">{t('docs.reports.paidSoFar')}</span>
                            <span className="ns-lease-kpi-label">{t('payments.kpi.ofLease', { total: money(stats.leaseTotal) })}</span>
                        </div>
                    </div>
                    <div className="ns-lease-kpi">
                        <span className="ns-lease-kpi-big">{money(leftThisYear)}</span>
                        <div>
                            <span className="ns-lease-kpi-value">{t('payments.kpi.leftThisYear')}</span>
                            <span className="ns-lease-kpi-label">{t('payments.kpi.throughDec31')}</span>
                        </div>
                    </div>
                </div>

                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>{t('payments.timeline.title')}</h3>
                        <span>{t('payments.timeline.hint')}</span>
                    </div>
                    <LeaseTimeline installments={installments} today={today} onSelect={(p) => setDetailPaymentId(p.payment_id)} />
                </section>
            </PageGroup>

            <PageGroup
                id="pay-coming"
                title={t('payments.next6')}
                hint={leases.length > 1 ? t('payments.tenant.allLeasesTogether') : t('payments.tenant.fromSchedule')}
            >
                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>{t('payments.rentByMonth')}</h3>
                    </div>
                    <IncomeProjectionChart
                        projection={projection}
                        label={t('payments.tenant.chartLabel')}
                        endingNote={(e) => t('payments.tenant.endingNote', { rent: money(e.monthlyRent) })}
                    />
                </section>
            </PageGroup>

            <PageGroup id="pay-history" title={t('contractDetail.history')}>
                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>{t('payments.historyTitle')}</h3>
                        <span>{leases.length > 1 ? t('payments.tenant.allLeases') : t('payments.tenant.everyDueMonth')}</span>
                    </div>
                    <PaymentHistory
                        rows={allRows}
                        viewer="tenant"
                        onOpen={(p) => setDetailPaymentId(p.payment_id)}
                        onReceipt={handleReceipt}
                        receiptBusyId={receiptBusyId}
                    />
                </section>
            </PageGroup>

            {detailPayment && (
                <PaymentDetailModal
                    payment={detailPayment}
                    contract={detailPayment.contract}
                    tenant={tenantInfo}
                    canPay={oldestPayableOf(detailPayment.contract.contract_id)?.payment_id === detailPayment.payment_id}
                    paying={paying}
                    onPay={() => payInstallment(detailPayment)}
                    onAskRony={
                        onAskRony
                            ? (seed) => {
                                  setDetailPaymentId(null)
                                  onAskRony(seed)
                              }
                            : undefined
                    }
                    onClose={() => setDetailPaymentId(null)}
                />
            )}

            {renewalLease && (
                <RenewalRequestModal
                    contract={renewalLease.contract}
                    stats={renewalLease.stats}
                    onAskRony={
                        onAskRony
                            ? (seed) => {
                                  setRenewalFor(null)
                                  onAskRony(seed)
                              }
                            : undefined
                    }
                    onClose={() => setRenewalFor(null)}
                    onSent={() => {
                        setRenewalFor(null)
                        setNotice(
                            t('payments.tenant.renewalSent', { name: renewalLease.contract.add_business?.users?.first_name || t('payments.tenant.yourOwner') })
                        )
                    }}
                />
            )}
        </>
    )
}
