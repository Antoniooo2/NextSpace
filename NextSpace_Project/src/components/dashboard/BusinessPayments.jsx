import { useCallback, useEffect, useRef, useState } from 'react'
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
import { downloadReceiptPdf, downloadScheduleCsv } from '../../lib/paymentDocuments'
import PaymentDetailModal from './PaymentDetailModal'
import IncomeProjectionChart from './payments/IncomeProjectionChart'
import LeaseTimeline from './payments/LeaseTimeline'
import PaymentHistory from './payments/PaymentHistory'
import ProgressRing from './payments/ProgressRing'
import RenewalRequestModal from './payments/RenewalRequestModal'
import RonyInsightCard from './payments/RonyInsightCard'
import './payments/payments.css'

const CONTRACT_EMBED = `*, add_business!contract_property_id_fkey(property_name, owner_id, ${PROPERTY_PHOTO_EMBED}, users!add_business_owner_id_fkey(first_name,last_name))`

function money(value) {
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

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
            setHasPendingRequest((contractRows || []).some((c) => c.status === 'Pending'))

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
            setPayError({ text: 'Could not create the receipt. Please try again.' })
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
            setPayError({ text: 'Your session expired. Please sign in again.' })
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
                throw new Error(result.error || 'Could not start the Wompi payment.')
            }
        } catch (err) {
            setPaying(false)
            setPayError({ text: err.message || 'Could not start the Wompi payment. Please try again.' })
            return
        }

        window.location.href = result.url
    }

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading payments...</p>
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
                <h3>{hasPendingRequest ? 'Waiting on the owner' : 'No active lease'}</h3>
                <p>
                    {hasPendingRequest
                        ? "Your contract request hasn't been accepted yet. Once the owner accepts it, your rent schedule will show up here."
                        : 'Find a space, request its contract, and once the owner accepts it your rent schedule will show up here.'}
                </p>
                {onNavigate && (
                    <button
                        type="button"
                        className="ns-outline-btn"
                        onClick={() => onNavigate(hasPendingRequest ? 'contracts' : 'home')}
                    >
                        {hasPendingRequest ? 'View my contracts' : 'Browse spaces'}
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
                ? `${st.lateMonths} ${st.lateMonths === 1 ? 'month' : 'months'} late`
                : tone === 'warning'
                  ? `${money(st.owedNow)} due`
                  : rows.length > 0 && rows.every((p) => p.status === 'Paid')
                    ? 'Fully paid'
                    : 'Up to date'
        return { contract: c, tone, label }
    })

    const insights = tenantInsights({ leases, today })
    const projection = incomeProjection(leases, today, 6)
    const property = contract.add_business
    const owner = property?.users
    const countdown = nextToPay ? dueCountdown(nextToPay.payment_date, today) : null
    const nextCountdown = nextScheduled ? dueCountdown(nextScheduled.payment_date, today) : null
    const daysToDue = nextToPay ? daysUntil(nextToPay.payment_date, today) : null
    const daysToEnd = contract.end_date ? daysUntil(contract.end_date, today) : null
    const canAskRenewal = daysToEnd != null && daysToEnd >= 0 && daysToEnd <= 60
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
    }

    const renewalLease = leases.find((l) => l.contract.contract_id === renewalFor) || null

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Payments</h1>
                    <p>
                        {leases.length > 1
                            ? `You have ${leases.length} active leases. Rent is paid online with Wompi, oldest month first.`
                            : `Your rent for ${property?.property_name || 'your space'}, paid online with Wompi.`}
                    </p>
                </div>
                <div className="ns-dash-header-actions">
                    {onAskRony && (
                        <button
                            type="button"
                            className="ns-outline-btn"
                            onClick={() =>
                                onAskRony({
                                    text: `Explain my payment situation for "${property?.property_name || 'my lease'}" — am I up to date, and what's coming up?`,
                                })
                            }
                        >
                            <i className="bi bi-stars"></i> Ask Rony
                        </button>
                    )}
                    {installments.length > 0 && (
                        <button
                            type="button"
                            className="ns-outline-btn"
                            onClick={() => downloadScheduleCsv({ contract, installments })}
                            title="Download this lease's rent schedule and payments as a spreadsheet (CSV)"
                        >
                            <i className="bi bi-download"></i> Export
                        </button>
                    )}
                </div>
            </div>

            {returnState === 'checking' && (
                <div className="alert alert-info d-flex align-items-center gap-2 py-2" role="status">
                    <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
                    Confirming your payment with Wompi...
                </div>
            )}
            {returnState === 'paid' && (
                <div className="alert alert-success d-flex align-items-center gap-2 py-2" role="status">
                    <i className="bi bi-check-circle-fill"></i> Payment received. Thank you! Your receipt is in the history below.
                </div>
            )}
            {returnState === 'pending' && (
                <div className="alert alert-warning d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>
                        <i className="bi bi-hourglass-split"></i> We haven't confirmed this payment yet. It can take a
                        minute for Wompi to notify us — check again in a moment.
                    </span>
                    <button type="button" className="ns-outline-btn" onClick={checkPaymentAgain}>
                        Check again
                    </button>
                </div>
            )}
            {notice && (
                <div className="alert alert-success d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>
                        <i className="bi bi-check-circle-fill"></i> {notice}
                    </span>
                    <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setNotice('')} />
                </div>
            )}

            <RonyInsightCard
                insights={insights}
                onAction={handleInsightAction}
                onAskRony={
                    onAskRony
                        ? () => onAskRony({ text: 'How much do I still owe this year, and when is my next payment due?' })
                        : undefined
                }
            />

            {leaseTabs.length > 1 && (
                <div className="ns-pay-lease-tabs" role="tablist" aria-label="Your leases">
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
                                <span className="ns-pay-lease-tab-name">{c.add_business?.property_name || 'Property'}</span>
                                <span className={`ns-pay-lease-tab-status tone-${tone}`}>
                                    <span className="ns-pay-lease-tab-dot" /> {label}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <div className="ns-pay-top-grid ns-pay-top-grid-v2">
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
                                <h2>{property?.property_name || 'Property'}</h2>
                                <span className="ns-pay-tag tag-active">{contract.status}</span>
                            </div>
                            <p className="ns-pay-lease-meta">
                                Owner: <strong>{owner ? `${owner.first_name} ${owner.last_name}` : '—'}</strong>
                                <span className="ns-pay-dot">•</span>
                                {formatDueDate(contract.start_date)} → {formatDueDate(contract.end_date)}
                            </p>
                        </div>
                        <div className="ns-pay-rent">
                            {money(contract.monthly_rent)}
                            <small>/mo</small>
                        </div>
                    </div>

                    <div className="ns-pay-progress">
                        <div className="ns-pay-progress-labels">
                            <span>
                                <strong>{stats.monthsPaid}</strong> of {stats.monthsTotal} months paid
                            </span>
                            <span>
                                {daysToEnd == null ? '' : daysToEnd >= 0 ? `${daysToEnd} days left on the lease` : 'Lease ended'}
                            </span>
                        </div>
                        <div className="ns-pay-progress-track" role="progressbar" aria-valuenow={Math.round(timeProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
                            <div className="ns-pay-progress-fill ns-fill-navy" style={{ width: `${Math.round(timeProgress * 100)}%` }} />
                        </div>
                    </div>

                    <div className="ns-pay-lease-footer">
                        <span className="ns-pay-contract-id">Contract #{contract.contract_id}</span>
                        {canAskRenewal ? (
                            <button type="button" className="ns-link-btn" onClick={() => setRenewalFor(contract.contract_id)}>
                                <i className="bi bi-arrow-repeat"></i> Ask to renew
                            </button>
                        ) : (
                            <button type="button" className="ns-link-btn" onClick={() => onNavigate('contracts')}>
                                View contract <i className="bi bi-box-arrow-up-right"></i>
                            </button>
                        )}
                    </div>
                </div>

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
                                            <small>days late</small>
                                        </span>
                                    ) : daysToDue === 0 ? (
                                        <span className="ns-due-ring-text">
                                            <strong>Today</strong>
                                        </span>
                                    ) : (
                                        <span className="ns-due-ring-text">
                                            <strong>{daysToDue}</strong>
                                            <small>{daysToDue === 1 ? 'day left' : 'days left'}</small>
                                        </span>
                                    )}
                                </ProgressRing>
                                <div>
                                    <span className={`ns-pay-countdown tone-${countdown.tone}`}>{countdown.text}</span>
                                    <p className="ns-pay-due-amount">{money(nextToPay.amount)}</p>
                                    <p className="ns-pay-due-desc">
                                        {formatDueDate(nextToPay.payment_date, { month: 'long', year: 'numeric' })} rent · due{' '}
                                        {formatDueDate(nextToPay.payment_date, { month: 'short', day: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                            {payable.length > 1 && (
                                <p className="ns-pay-due-extra">
                                    {payable.length} months outstanding · {money(stats.owedNow)} total. They're paid oldest first.
                                </p>
                            )}
                            <button
                                type="button"
                                className="ns-filled-btn ns-pay-full-btn"
                                onClick={() => payInstallment(nextToPay)}
                                disabled={paying}
                            >
                                {paying ? 'Opening Wompi...' : `Pay ${money(nextToPay.amount)} with Wompi`}
                            </button>
                            <p className="ns-pay-simulation-note">
                                <i className="bi bi-shield-lock"></i> Secure checkout powered by Wompi.
                            </p>
                        </>
                    ) : nextScheduled ? (
                        <div className="ns-due-hero">
                            <ProgressRing size={92} stroke={8} value={1} tone="success" label="All caught up">
                                <span className="ns-due-ring-text">
                                    <i className="bi bi-check-lg ns-due-check"></i>
                                </span>
                            </ProgressRing>
                            <div>
                                <span className="ns-pay-countdown tone-success">All caught up</span>
                                <p className="ns-pay-due-amount">{money(nextScheduled.amount)}</p>
                                <p className="ns-pay-due-desc">
                                    Next payment {formatDueDate(nextScheduled.payment_date, { month: 'short', day: 'numeric' })} ·{' '}
                                    {nextCountdown.text.replace('Due in', 'in')}. Payable a week before.
                                </p>
                            </div>
                        </div>
                    ) : installments.length > 0 ? (
                        <div className="ns-due-hero">
                            <ProgressRing size={92} stroke={8} value={1} tone="success" label="Lease fully paid">
                                <span className="ns-due-ring-text">
                                    <i className="bi bi-patch-check-fill ns-due-check"></i>
                                </span>
                            </ProgressRing>
                            <div>
                                <span className="ns-pay-countdown tone-success">Lease fully paid</span>
                                <p className="ns-pay-due-desc">Every month of this lease has been paid. Nothing else is due.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <span className="ns-pay-countdown tone-neutral">
                                <i className="bi bi-calendar2-x"></i> No schedule yet
                            </span>
                            <p className="ns-pay-due-desc">
                                This lease doesn't have start and end dates yet, so there's no rent schedule. Ask the owner
                                to set the lease dates.
                            </p>
                        </>
                    )}
                </div>
            </div>

            {payError?.notConfigured && (
                <div className="alert alert-warning d-flex align-items-start gap-2 py-2" role="alert">
                    <i className="bi bi-plug"></i>
                    <span>
                        Online payments aren't set up on this site yet, so the payment wasn't started and nothing was
                        charged. Please try again later.
                    </span>
                </div>
            )}
            {payError?.text && (
                <div className="alert alert-danger py-2" role="alert">
                    {payError.text}
                </div>
            )}

            <div className="ns-lease-kpis">
                <div className="ns-lease-kpi">
                    <ProgressRing
                        value={stats.monthsDue > 0 ? stats.paidOnTime / stats.monthsDue : 0}
                        tone={onTimePct == null || onTimePct >= 85 ? 'success' : 'warning'}
                        label={`${stats.paidOnTime} of ${stats.monthsDue} months on time`}
                    >
                        <strong>{stats.paidOnTime}</strong>
                        <small>/{stats.monthsDue}</small>
                    </ProgressRing>
                    <div>
                        <span className="ns-lease-kpi-value">On-time record</span>
                        <span className="ns-lease-kpi-label">
                            {stats.monthsDue === 0
                                ? 'Nothing due yet'
                                : onTimePct === 100
                                  ? 'Every month on time'
                                  : `${onTimePct}% of months on time`}
                        </span>
                    </div>
                </div>
                <div className="ns-lease-kpi">
                    <span className="ns-lease-kpi-big">{money(stats.collectedTotal)}</span>
                    <div>
                        <span className="ns-lease-kpi-value">Paid so far</span>
                        <span className="ns-lease-kpi-label">of {money(stats.leaseTotal)} on this lease</span>
                    </div>
                </div>
                <div className="ns-lease-kpi">
                    <span className="ns-lease-kpi-big">{money(leftThisYear)}</span>
                    <div>
                        <span className="ns-lease-kpi-value">Left this year</span>
                        <span className="ns-lease-kpi-label">through Dec 31, this lease</span>
                    </div>
                </div>
                <div className="ns-lease-kpi">
                    <span className={`ns-lease-kpi-big ${stats.lateMonths > 0 ? 'is-bad' : ''}`}>{money(stats.owedNow)}</span>
                    <div>
                        <span className="ns-lease-kpi-value">Owed now</span>
                        <span className="ns-lease-kpi-label">
                            {stats.lateMonths > 0
                                ? `${stats.lateMonths} ${stats.lateMonths === 1 ? 'month' : 'months'} late`
                                : stats.owedNow > 0
                                  ? 'Due this week'
                                  : 'Nothing due right now'}
                        </span>
                    </div>
                </div>
            </div>

            <section className="ns-panel">
                <div className="ns-panel-head">
                    <h3>Rent timeline</h3>
                    <span>Tap a month for details and receipts</span>
                </div>
                <LeaseTimeline installments={installments} today={today} onSelect={(p) => setDetailPaymentId(p.payment_id)} />
            </section>

            <section className="ns-panel">
                <div className="ns-panel-head">
                    <h3>Your rent, next 6 months</h3>
                    <span>{leases.length > 1 ? 'All your leases together' : 'From your rent schedule'}</span>
                </div>
                <IncomeProjectionChart
                    projection={projection}
                    label="Rent you'll pay over the next six months"
                    endingNote={(e) => `you stop paying ${money(e.monthlyRent)}/month after that unless you renew.`}
                />
            </section>

            <section className="ns-panel">
                <div className="ns-panel-head">
                    <h3>Payment history</h3>
                    <span>{leases.length > 1 ? 'All your leases' : 'Every month that has come due'}</span>
                </div>
                <PaymentHistory
                    rows={allRows}
                    viewer="tenant"
                    onOpen={(p) => setDetailPaymentId(p.payment_id)}
                    onReceipt={handleReceipt}
                    receiptBusyId={receiptBusyId}
                />
            </section>

            {detailPayment && (
                <PaymentDetailModal
                    payment={detailPayment}
                    contract={detailPayment.contract}
                    tenant={tenantInfo}
                    canPay={oldestPayableOf(detailPayment.contract.contract_id)?.payment_id === detailPayment.payment_id}
                    paying={paying}
                    onPay={() => payInstallment(detailPayment)}
                    onAskRony={onAskRony}
                    onClose={() => setDetailPaymentId(null)}
                />
            )}

            {renewalLease && (
                <RenewalRequestModal
                    contract={renewalLease.contract}
                    stats={renewalLease.stats}
                    tenantFirstName={meta.first_name}
                    onAskRony={onAskRony}
                    onClose={() => setRenewalFor(null)}
                    onSent={() => {
                        setRenewalFor(null)
                        setNotice(
                            `Renewal request sent to ${renewalLease.contract.add_business?.users?.first_name || 'your owner'}. You'll see their answer in Notifications.`
                        )
                    }}
                />
            )}
        </>
    )
}
