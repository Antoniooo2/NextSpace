import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import {
    PAYMENTS_NOT_CONFIGURED,
    PAYMENT_STATUS_LABEL,
    PAYMENT_STATUS_TAG,
    dueCountdown,
    effectiveStatus,
    formatDueDate,
    isPayable,
    refreshPaymentStatuses,
    todayInElSalvador,
} from '../../lib/rentSchedule'
import { downloadReceiptPdf, downloadScheduleCsv } from '../../lib/paymentDocuments'
import PaymentDetailModal from './PaymentDetailModal'

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
    const contract = contracts.find((c) => c.contract_id === selectedId) || contracts[0] || null
    const payments = contract ? allPayments.filter((p) => p.contract_id === contract.contract_id) : []
    const installments = payments.map((p) => ({ ...p, status: effectiveStatus(p, today) }))
    const payable = installments.filter((p) => isPayable(p.status))
    // Always the oldest outstanding month first, so a tenant can't pay October
    // while September is still late.
    const nextToPay = payable[0] || null
    const nextScheduled = installments.find((p) => p.status === 'Scheduled') || null
    const paidTotal = installments.filter((p) => p.status === 'Paid').reduce((sum, p) => sum + Number(p.amount), 0)
    const leaseTotal = installments.reduce((sum, p) => sum + Number(p.amount), 0)
    const owedNow = payable.reduce((sum, p) => sum + Number(p.amount), 0)
    const monthsElapsed = installments.filter((p) => p.payment_date <= today).length
    const monthNumber = Math.min(Math.max(monthsElapsed, 1), installments.length)
    const progressPct = leaseTotal > 0 ? Math.round((paidTotal / leaseTotal) * 100) : 0
    const detailPayment = installments.find((p) => p.payment_id === detailPaymentId) || null
    const history = [...installments].filter((p) => p.status !== 'Scheduled').reverse()

    const meta = user.user_metadata || {}
    const tenantInfo = { first_name: meta.first_name, last_name: meta.last_name, dui: meta.dui }

    const handleQuickReceipt = async (payment) => {
        setReceiptBusyId(payment.payment_id)
        try {
            await downloadReceiptPdf({ payment, contract, tenant: tenantInfo })
        } catch (err) {
            console.error('Could not build the receipt PDF', err)
            setPayError({ text: 'Could not create the receipt. Please try again.' })
        } finally {
            setReceiptBusyId(null)
        }
    }

    const handlePayNow = async () => {
        if (!contract || !nextToPay) return

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
                body: JSON.stringify({ paymentId: nextToPay.payment_id }),
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
    const leaseTabs = contracts.map((c) => {
        const rows = allPayments
            .filter((p) => p.contract_id === c.contract_id)
            .map((p) => ({ ...p, status: effectiveStatus(p, today) }))
        const owed = rows.filter((p) => isPayable(p.status))
        const tone = owed.some((p) => p.status === 'Late') ? 'danger' : owed.length > 0 ? 'warning' : 'success'
        const label =
            tone === 'danger'
                ? `${owed.length} ${owed.length === 1 ? 'month' : 'months'} late`
                : tone === 'warning'
                  ? `${money(owed[0].amount)} due`
                  : rows.length > 0 && rows.every((p) => p.status === 'Paid')
                    ? 'Fully paid'
                    : 'Up to date'
        return { contract: c, tone, label }
    })

    const property = contract.add_business
    const owner = property?.users
    const countdown = nextToPay ? dueCountdown(nextToPay.payment_date, today) : null
    const nextCountdown = nextScheduled ? dueCountdown(nextScheduled.payment_date, today) : null

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Payments</h1>
                    <p>
                        {contracts.length > 1
                            ? `You have ${contracts.length} active leases. Pick one to see its rent schedule and pay.`
                            : `Your rent schedule and payment history for ${property?.property_name || 'your space'}.`}
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
                            <i className="bi bi-download"></i> Export report
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
                    <i className="bi bi-check-circle-fill"></i> Payment received. Thank you!
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

            <div className="ns-pay-top-grid">
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

                    {installments.length > 0 && (
                        <div className="ns-pay-progress">
                            <div className="ns-pay-progress-labels">
                                <span>
                                    Month <strong>{monthNumber}</strong> of {installments.length}
                                </span>
                                <span>
                                    <strong>{money(paidTotal)}</strong> paid of {money(leaseTotal)}
                                </span>
                            </div>
                            <div
                                className="ns-pay-progress-track"
                                role="progressbar"
                                aria-valuenow={progressPct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            >
                                <div className="ns-pay-progress-fill" style={{ width: `${progressPct}%` }} />
                            </div>
                        </div>
                    )}

                    <div className="ns-pay-lease-footer">
                        <span className="ns-pay-contract-id">Contract #{contract.contract_id}</span>
                        <button type="button" className="ns-link-btn" onClick={() => onNavigate('contracts')}>
                            View contract <i className="bi bi-box-arrow-up-right"></i>
                        </button>
                    </div>
                </div>

                <div className="ns-pay-due-card">
                    {nextToPay ? (
                        <>
                            <span className={`ns-pay-countdown tone-${countdown.tone}`}>
                                <i className={`bi ${countdown.tone === 'danger' ? 'bi-exclamation-octagon-fill' : 'bi-clock-fill'}`}></i>{' '}
                                {countdown.text}
                            </span>
                            <p className="ns-pay-due-desc">
                                Rent for {formatDueDate(nextToPay.payment_date, { month: 'long', year: 'numeric' })}, due{' '}
                                {formatDueDate(nextToPay.payment_date)}
                            </p>
                            <p className="ns-pay-due-amount">{money(nextToPay.amount)}</p>
                            {payable.length > 1 && (
                                <p className="ns-pay-due-extra">
                                    {payable.length} months outstanding · {money(owedNow)} total. They're paid oldest first.
                                </p>
                            )}
                            <button
                                type="button"
                                className="ns-filled-btn ns-pay-full-btn"
                                onClick={handlePayNow}
                                disabled={paying}
                            >
                                {paying ? 'Opening Wompi...' : `Pay ${money(nextToPay.amount)}`}
                            </button>
                            <p className="ns-pay-simulation-note">
                                <i className="bi bi-shield-lock"></i> Secure checkout powered by Wompi.
                            </p>
                        </>
                    ) : nextScheduled ? (
                        <>
                            <span className="ns-pay-countdown tone-success">
                                <i className="bi bi-check-circle-fill"></i> All caught up
                            </span>
                            <p className="ns-pay-due-desc">Your next payment</p>
                            <p className="ns-pay-due-amount">{money(nextScheduled.amount)}</p>
                            <p className="ns-pay-due-extra">
                                Due {formatDueDate(nextScheduled.payment_date)} · {nextCountdown.text.replace('Due in', 'in')}.
                                You can pay it starting a week before.
                            </p>
                        </>
                    ) : installments.length > 0 ? (
                        <>
                            <span className="ns-pay-countdown tone-success">
                                <i className="bi bi-patch-check-fill"></i> Lease fully paid
                            </span>
                            <p className="ns-pay-due-desc">Every month of this lease has been paid. Nothing else is due.</p>
                        </>
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
                        charged. Please try again later or arrange the payment with your owner.
                    </span>
                </div>
            )}
            {payError?.text && (
                <div className="alert alert-danger py-2" role="alert">
                    {payError.text}
                </div>
            )}

            <h3 className="ns-pay-section-title">Rent schedule</h3>
            {installments.length === 0 ? (
                <p className="ns-pay-muted mb-4">No rent schedule for this lease yet.</p>
            ) : (
                <div className="ns-pay-schedule-row">
                    {installments.map((payment) => (
                        <button
                            type="button"
                            key={payment.payment_id}
                            className={`ns-pay-schedule-chip status-${payment.status.toLowerCase()} ${
                                nextToPay?.payment_id === payment.payment_id ? 'is-next' : ''
                            }`}
                            onClick={() => setDetailPaymentId(payment.payment_id)}
                            aria-label={`Details for ${formatDueDate(payment.payment_date, { month: 'long', year: 'numeric' })} rent`}
                        >
                            <div className="ns-pay-schedule-date">
                                <span>{formatDueDate(payment.payment_date, { month: 'short' }).toUpperCase()}</span>
                                <strong>{formatDueDate(payment.payment_date, { day: 'numeric' })}</strong>
                            </div>
                            <span className="ns-pay-schedule-amount">{money(payment.amount)}</span>
                            <span className={`ns-pay-tag ${PAYMENT_STATUS_TAG[payment.status] || 'tag-pending'}`}>
                                {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <h3 className="ns-pay-section-title">Payment history</h3>
            {history.length === 0 ? (
                <p className="ns-pay-muted mb-4">Nothing has come due yet.</p>
            ) : (
                <div className="ns-pay-table-wrap">
                    <table className="ns-pay-table">
                        <thead>
                            <tr>
                                <th>Due date</th>
                                <th>Paid on</th>
                                <th>Amount</th>
                                <th>Method</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((row) => (
                                <tr
                                    key={row.payment_id}
                                    className="ns-pay-row-clickable"
                                    onClick={() => setDetailPaymentId(row.payment_id)}
                                >
                                    <td className="ns-pay-muted">{formatDueDate(row.payment_date)}</td>
                                    <td className="ns-pay-muted">
                                        {row.paid_at ? new Date(row.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                    </td>
                                    <td>{money(row.amount)}</td>
                                    <td className="ns-pay-muted">{row.payment_method || '—'}</td>
                                    <td>
                                        <span className={`ns-pay-tag ${PAYMENT_STATUS_TAG[row.status] || 'tag-pending'}`}>
                                            {PAYMENT_STATUS_LABEL[row.status] || row.status}
                                        </span>
                                    </td>
                                    <td>
                                        {row.status === 'Paid' && (
                                            <button
                                                type="button"
                                                className="ns-pay-icon-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleQuickReceipt(row)
                                                }}
                                                disabled={receiptBusyId === row.payment_id}
                                                title="Download receipt (PDF)"
                                                aria-label="Download receipt (PDF)"
                                            >
                                                <i className="bi bi-file-earmark-pdf"></i>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {detailPayment && (
                <PaymentDetailModal
                    payment={detailPayment}
                    contract={contract}
                    tenant={tenantInfo}
                    canPay={nextToPay?.payment_id === detailPayment.payment_id}
                    paying={paying}
                    onPay={handlePayNow}
                    onClose={() => setDetailPaymentId(null)}
                />
            )}
        </>
    )
}
