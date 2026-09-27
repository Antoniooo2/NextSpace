import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import { createNotification } from '../../lib/notifications'
import {
    PAYMENT_STATUS_LABEL,
    PAYMENT_STATUS_TAG,
    dueCountdown,
    effectiveStatus,
    formatDueDate,
    isPayable,
    refreshPaymentStatuses,
    todayInElSalvador,
} from '../../lib/rentSchedule'
import { downloadOwnerPaymentsCsv } from '../../lib/paymentDocuments'
import CollectionsChart from './CollectionsChart'
import RecordPaymentModal from './RecordPaymentModal'

const CONTRACT_EMBED =
    '*, add_business!contract_property_id_fkey(property_name, monthly_rent), users!contract_tenant_dui_fkey(first_name,last_name)'

const PAYMENT_EMBED =
    '*, contract(contract_id, add_business!contract_property_id_fkey(property_name), users!contract_tenant_dui_fkey(first_name,last_name))'

const HISTORY_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'Late', label: 'Late' },
    { id: 'Pending', label: 'Due' },
    { id: 'Paid', label: 'Paid' },
]

function money(value) {
    return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function monthKeyOffset(monthKey, offset) {
    const [y, m] = monthKey.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + offset, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthKey, month = 'short') {
    const [y, m] = monthKey.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month, year: month === 'long' ? 'numeric' : undefined, timeZone: 'UTC' })
}

function paidMonthKey(p) {
    return (p.paid_at || p.payment_date).slice(0, 7)
}

function tenantName(users) {
    return users ? `${users.first_name} ${users.last_name}` : '—'
}

export default function OwnerPayments({ user }) {
    const [contracts, setContracts] = useState([])
    const [payments, setPayments] = useState([])
    const [ownerDui, setOwnerDui] = useState(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    // contract_id -> 'sending' | 'sent' | 'error', for this visit to the page
    const [reminderStatus, setReminderStatus] = useState({})
    const [recordFor, setRecordFor] = useState(null)
    const [recordedNotice, setRecordedNotice] = useState('')
    const [historyFilter, setHistoryFilter] = useState('all')

    const loadData = useCallback(async () => {
        const [{ data: contractRows, error: contractError }, { data: paymentRows, error: paymentError }] =
            await Promise.all([
                supabase.from('contract').select(CONTRACT_EMBED).order('start_date', { ascending: false }),
                supabase
                    .from('payment')
                    .select(PAYMENT_EMBED)
                    .neq('status', 'Cancelled')
                    .order('payment_date', { ascending: false }),
            ])

        const firstError = contractError || paymentError
        if (firstError) {
            setLoadError(describeSupabaseError(firstError))
            return
        }

        setContracts(contractRows || [])
        const today = todayInElSalvador()
        setPayments((paymentRows || []).map((p) => ({ ...p, status: effectiveStatus(p, today) })))
    }, [])

    useEffect(() => {
        let cancelled = false

        const init = async () => {
            setLoading(true)
            setLoadError('')
            await refreshPaymentStatuses()
            const [{ data: userRow }] = await Promise.all([
                supabase.from('users').select('dui').eq('id_supabase_auth', user.id).single(),
                loadData(),
            ])
            if (cancelled) return
            setOwnerDui(userRow?.dui || null)
            setLoading(false)
        }

        init()

        return () => {
            cancelled = true
        }
    }, [user.id, loadData])

    const today = todayInElSalvador()
    const currentMonthKey = today.slice(0, 7)
    const activeLeases = contracts.filter((c) => c.status === 'Active')

    // This month at a glance. Expected = rent due this month; collected =
    // money actually received this month (by paid date).
    const expectedThisMonth = payments
        .filter((p) => p.payment_date.slice(0, 7) === currentMonthKey)
        .reduce((sum, p) => sum + Number(p.amount), 0)
    const collectedThisMonth = payments
        .filter((p) => p.status === 'Paid' && paidMonthKey(p) === currentMonthKey)
        .reduce((sum, p) => sum + Number(p.amount), 0)
    const outstanding = payments.filter((p) => isPayable(p.status))
    const outstandingTotal = outstanding.reduce((sum, p) => sum + Number(p.amount), 0)
    const late = payments.filter((p) => p.status === 'Late')
    const lateTotal = late.reduce((sum, p) => sum + Number(p.amount), 0)
    const lateTenants = new Set(late.map((p) => p.contract?.contract_id)).size

    const chartMonths = Array.from({ length: 6 }, (_, i) => monthKeyOffset(currentMonthKey, i - 5)).map((key) => ({
        key,
        label: monthLabel(key),
        fullLabel: monthLabel(key, 'long'),
        expected: payments.filter((p) => p.payment_date.slice(0, 7) === key).reduce((s, p) => s + Number(p.amount), 0),
        collected: payments
            .filter((p) => p.status === 'Paid' && paidMonthKey(p) === key)
            .reduce((s, p) => s + Number(p.amount), 0),
    }))
    const hasChartData = chartMonths.some((m) => m.expected > 0 || m.collected > 0)

    const leaseSummary = (contractId) => {
        const rows = payments
            .filter((p) => p.contract?.contract_id === contractId)
            .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
        const due = rows.filter((p) => isPayable(p.status))
        const unpaid = rows.filter((p) => p.status !== 'Paid')
        const focus = due[0] || rows.find((p) => p.status === 'Scheduled') || rows.filter((p) => p.status === 'Paid').pop() || null
        return {
            focus,
            dueCount: due.length,
            owed: due.reduce((s, p) => s + Number(p.amount), 0),
            unpaid,
            hasLate: due.some((p) => p.status === 'Late'),
        }
    }

    // Late tenants first, then whoever has something due, then the rest.
    const leaseRows = activeLeases
        .map((lease) => ({ lease, ...leaseSummary(lease.contract_id) }))
        .sort((a, b) => (b.hasLate - a.hasLate) || (b.dueCount - a.dueCount))

    const history = payments
        .filter((p) => p.status !== 'Scheduled')
        .filter((p) => historyFilter === 'all' || p.status === historyFilter)

    // Sends the tenant an in-app notification about the oldest month they owe.
    // Only offered for late rent: upcoming rent already gets automatic
    // reminders 3 days before it's due.
    const sendReminder = async (lease, focus, dueCount) => {
        if (!ownerDui || !lease.tenant_dui || reminderStatus[lease.contract_id] === 'sending') return

        setReminderStatus((prev) => ({ ...prev, [lease.contract_id]: 'sending' }))

        const propertyName = lease.add_business?.property_name || 'your space'
        const countdown = dueCountdown(focus.payment_date, today)
        const extra = dueCount > 1 ? ` You have ${dueCount} months outstanding.` : ''

        const { error } = await createNotification({
            recipientDui: lease.tenant_dui,
            senderDui: ownerDui,
            process: 'Payments',
            title: `Rent overdue: ${propertyName}`,
            description: `Your rent of ${money(focus.amount)} for ${propertyName} was due ${formatDueDate(focus.payment_date)} and is ${countdown.text}.${extra} You can pay it from Payments.`,
            contractId: lease.contract_id,
        })

        setReminderStatus((prev) => ({ ...prev, [lease.contract_id]: error ? 'error' : 'sent' }))
    }

    const handleRecorded = async () => {
        const lease = recordFor
        setRecordFor(null)
        setRecordedNotice(
            `Payment recorded for ${lease?.add_business?.property_name || 'the lease'}. ${tenantName(lease?.users)} was notified.`
        )
        await loadData()
    }

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading payments...</p>
            </div>
        )
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Payments</h1>
                    <p>Rent expected and collected across all your properties.</p>
                </div>
                {payments.length > 0 && (
                    <div className="ns-dash-header-actions">
                        <button
                            type="button"
                            className="ns-outline-btn"
                            onClick={() => downloadOwnerPaymentsCsv(payments)}
                            title="Download every rent payment as a spreadsheet (CSV)"
                        >
                            <i className="bi bi-download"></i> Export CSV
                        </button>
                    </div>
                )}
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}
            {recordedNotice && (
                <div className="alert alert-success d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>
                        <i className="bi bi-check-circle-fill"></i> {recordedNotice}
                    </span>
                    <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setRecordedNotice('')} />
                </div>
            )}

            <div className="ns-stats-row">
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{money(expectedThisMonth)}</span>
                    <span className="ns-stat-card-label">Expected in {monthLabel(currentMonthKey, 'long')}</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{money(collectedThisMonth)}</span>
                    <span className="ns-stat-card-label">
                        Collected
                        {expectedThisMonth > 0 && ` · ${Math.round((collectedThisMonth / expectedThisMonth) * 100)}%`}
                    </span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{money(outstandingTotal)}</span>
                    <span className="ns-stat-card-label">
                        Outstanding · {outstanding.length} {outstanding.length === 1 ? 'month' : 'months'}
                    </span>
                </div>
                <div className={`ns-stat-card ${lateTotal > 0 ? 'ns-stat-card-alert' : ''}`}>
                    <span className="ns-stat-card-value">{money(lateTotal)}</span>
                    <span className="ns-stat-card-label">
                        Late · {lateTenants} {lateTenants === 1 ? 'tenant' : 'tenants'}
                    </span>
                </div>
            </div>

            <div className="ns-collect-card">
                <div className="ns-collect-card-head">
                    <h3>Rent expected vs collected</h3>
                    <span>Last 6 months</span>
                </div>
                {hasChartData ? (
                    <CollectionsChart months={chartMonths} />
                ) : (
                    <p className="ns-pay-muted mb-0">No rent has come due in the last six months yet.</p>
                )}
            </div>

            <h3 className="ns-pay-section-title">Tenants</h3>
            {leaseRows.length === 0 ? (
                <p className="ns-pay-muted mb-4">
                    You don't have any active leases yet. Accept a contract request from the Contracts section.
                </p>
            ) : (
                <div className="ns-pay-table-wrap mb-4">
                    <table className="ns-pay-table ns-owner-tenants">
                        <thead>
                            <tr>
                                <th>Property & tenant</th>
                                <th>Rent</th>
                                <th>Status</th>
                                <th>Owed now</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaseRows.map(({ lease, focus, dueCount, owed, unpaid, hasLate }) => {
                                const status = focus?.status
                                const countdown = focus && status !== 'Paid' ? dueCountdown(focus.payment_date, today) : null
                                const reminder = reminderStatus[lease.contract_id]
                                return (
                                    <tr key={lease.contract_id}>
                                        <td>
                                            <div className="ns-owner-tenant-cell">
                                                <strong>{lease.add_business?.property_name || 'Property'}</strong>
                                                <span>{tenantName(lease.users)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            {money(lease.monthly_rent)}
                                            <small className="ns-pay-muted">/mo</small>
                                        </td>
                                        <td>
                                            <div className="ns-owner-status-cell">
                                                <span className={`ns-pay-tag ${status ? PAYMENT_STATUS_TAG[status] || 'tag-pending' : 'tag-scheduled'}`}>
                                                    {status ? PAYMENT_STATUS_LABEL[status] || status : 'No schedule'}
                                                </span>
                                                <span className="ns-pay-muted">
                                                    {!focus
                                                        ? ''
                                                        : status === 'Paid'
                                                          ? 'Fully paid'
                                                          : `${countdown.text} · ${formatDueDate(focus.payment_date, { month: 'short', day: 'numeric' })}`}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            {owed > 0 ? (
                                                <strong className={hasLate ? 'ns-owner-owed-late' : ''}>
                                                    {money(owed)}
                                                    {dueCount > 1 && <small> · {dueCount} months</small>}
                                                </strong>
                                            ) : (
                                                <span className="ns-pay-muted">—</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="ns-owner-actions">
                                                {unpaid.length > 0 && (
                                                    <button
                                                        type="button"
                                                        className="ns-outline-btn ns-pay-reminder-btn"
                                                        onClick={() => {
                                                            setRecordedNotice('')
                                                            setRecordFor(lease)
                                                        }}
                                                        title="Record rent paid in cash or by transfer"
                                                    >
                                                        <i className="bi bi-cash-coin"></i> Record payment
                                                    </button>
                                                )}
                                                {hasLate && (
                                                    <button
                                                        type="button"
                                                        className="ns-outline-btn ns-pay-reminder-btn"
                                                        disabled={!ownerDui || reminder === 'sending' || reminder === 'sent'}
                                                        onClick={() => sendReminder(lease, focus, dueCount)}
                                                        title={`Notify ${lease.users?.first_name || 'the tenant'} that rent is overdue`}
                                                    >
                                                        {reminder === 'sending' ? (
                                                            'Sending...'
                                                        ) : reminder === 'sent' ? (
                                                            <>
                                                                <i className="bi bi-check2"></i> Reminder sent
                                                            </>
                                                        ) : reminder === 'error' ? (
                                                            'Retry reminder'
                                                        ) : (
                                                            <>
                                                                <i className="bi bi-bell"></i> Send reminder
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="ns-owner-history-head">
                <h3 className="ns-pay-section-title mb-0">Payment history</h3>
                <div className="ns-pill-row mb-0">
                    {HISTORY_FILTERS.map((f) => (
                        <button
                            type="button"
                            key={f.id}
                            className={`ns-pill ${historyFilter === f.id ? 'active' : ''}`}
                            onClick={() => setHistoryFilter(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>
            {history.length === 0 ? (
                <p className="ns-pay-muted mb-4">No payments to show.</p>
            ) : (
                <div className="ns-pay-table-wrap">
                    <table className="ns-pay-table">
                        <thead>
                            <tr>
                                <th>Property</th>
                                <th>Tenant</th>
                                <th>Due date</th>
                                <th>Paid on</th>
                                <th>Amount</th>
                                <th>Method</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((row) => (
                                <tr key={row.payment_id}>
                                    <td>{row.contract?.add_business?.property_name || '—'}</td>
                                    <td className="ns-pay-muted">{tenantName(row.contract?.users)}</td>
                                    <td className="ns-pay-muted">{formatDueDate(row.payment_date)}</td>
                                    <td className="ns-pay-muted">
                                        {row.paid_at
                                            ? new Date(row.paid_at).toLocaleDateString('en-US', {
                                                  month: 'short',
                                                  day: 'numeric',
                                                  year: 'numeric',
                                                  timeZone: 'America/El_Salvador',
                                              })
                                            : '—'}
                                    </td>
                                    <td>{money(row.amount)}</td>
                                    <td className="ns-pay-muted">{row.payment_method || '—'}</td>
                                    <td>
                                        <span className={`ns-pay-tag ${PAYMENT_STATUS_TAG[row.status] || 'tag-pending'}`}>
                                            {PAYMENT_STATUS_LABEL[row.status] || row.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {recordFor && (
                <RecordPaymentModal
                    lease={recordFor}
                    unpaid={leaseSummary(recordFor.contract_id).unpaid}
                    onClose={() => setRecordFor(null)}
                    onRecorded={handleRecorded}
                />
            )}
        </>
    )
}
