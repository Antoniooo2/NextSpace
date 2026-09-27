import { useEffect, useState } from 'react'
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

const CONTRACT_EMBED =
    '*, add_business!contract_property_id_fkey(property_name, monthly_rent), users!contract_tenant_dui_fkey(first_name,last_name)'

const PAYMENT_EMBED =
    '*, contract(contract_id, add_business!contract_property_id_fkey(property_name), users!contract_tenant_dui_fkey(first_name,last_name))'

function money(value) {
    return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export default function OwnerPayments({ user }) {
    const [contracts, setContracts] = useState([])
    const [ownerDui, setOwnerDui] = useState(null)
    // contract_id -> 'sending' | 'sent' | 'error', for this visit to the page
    const [reminderStatus, setReminderStatus] = useState({})
    const [payments, setPayments] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')

    const loadData = async () => {
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
    }

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
            if (!cancelled) setOwnerDui(userRow?.dui || null)
            if (!cancelled) setLoading(false)
        }

        init()

        return () => {
            cancelled = true
        }
    }, [user.id])

    const activeLeases = contracts.filter((c) => c.status === 'Active')

    const today = todayInElSalvador()
    const currentMonthKey = today.slice(0, 7)
    // Collected = money actually received this month (by paid date), not
    // installments that happen to be due this month.
    const collectedThisMonth = payments
        .filter((p) => p.status === 'Paid' && (p.paid_at ? p.paid_at.slice(0, 7) : p.payment_date.slice(0, 7)) === currentMonthKey)
        .reduce((sum, p) => sum + Number(p.amount), 0)
    const pendingCount = payments.filter((p) => p.status === 'Pending').length
    const lateCount = payments.filter((p) => p.status === 'Late').length
    const history = payments.filter((p) => p.status !== 'Scheduled')

    // What matters for each lease right now: the oldest unpaid month that's
    // due (or late); otherwise the next upcoming one; otherwise the last paid.
    // Sends the tenant an in-app notification about the oldest month they owe.
    // It lands in their Notifications and opens their Payments screen on that
    // lease, where they can pay it.
    const sendReminder = async (lease, focus, dueCount) => {
        if (!ownerDui || !lease.tenant_dui || reminderStatus[lease.contract_id] === 'sending') return

        setReminderStatus((prev) => ({ ...prev, [lease.contract_id]: 'sending' }))

        const propertyName = lease.add_business?.property_name || 'your space'
        const countdown = dueCountdown(focus.payment_date, today)
        const when =
            focus.status === 'Late'
                ? `was due ${formatDueDate(focus.payment_date)} and is ${countdown.text}`
                : `is due ${formatDueDate(focus.payment_date)} (${countdown.text.toLowerCase()})`
        const extra = dueCount > 1 ? ` You have ${dueCount} months outstanding.` : ''

        const { error } = await createNotification({
            recipientDui: lease.tenant_dui,
            senderDui: ownerDui,
            process: 'Payments',
            title: focus.status === 'Late' ? `Rent overdue: ${propertyName}` : `Rent reminder: ${propertyName}`,
            description: `Your rent of ${money(focus.amount)} for ${propertyName} ${when}.${extra} You can pay it from Payments.`,
            contractId: lease.contract_id,
        })

        setReminderStatus((prev) => ({ ...prev, [lease.contract_id]: error ? 'error' : 'sent' }))
    }

    const leaseSummary = (contractId) => {
        const rows = payments
            .filter((p) => p.contract?.contract_id === contractId)
            .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
        const due = rows.filter((p) => isPayable(p.status))
        const focus = due[0] || rows.find((p) => p.status === 'Scheduled') || rows.filter((p) => p.status === 'Paid').pop() || null
        return { focus, dueCount: due.length }
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
                    <p>Track rent collected from your tenants across all your properties.</p>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            <div className="ns-stats-row">
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">${collectedThisMonth.toLocaleString()}</span>
                    <span className="ns-stat-card-label">Collected this month</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{pendingCount}</span>
                    <span className="ns-stat-card-label">Due this week</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{lateCount}</span>
                    <span className="ns-stat-card-label">Late payments</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{activeLeases.length}</span>
                    <span className="ns-stat-card-label">Active leases</span>
                </div>
            </div>

            <h3 className="ns-pay-section-title">Active leases</h3>
            {activeLeases.length === 0 ? (
                <p className="ns-pay-muted mb-4">
                    You don't have any active leases yet. Create a contract first from the Contracts section.
                </p>
            ) : (
                <div className="ns-pay-lease-list">
                    {activeLeases.map((lease) => {
                        const property = lease.add_business
                        const tenant = lease.users
                        const { focus, dueCount } = leaseSummary(lease.contract_id)
                        const focusCountdown = focus && focus.status !== 'Paid' ? dueCountdown(focus.payment_date, today) : null
                        return (
                            <div className="ns-pay-lease-row" key={lease.contract_id}>
                                <div className="ns-pay-lease-row-img">
                                    <i className="bi bi-file-earmark-text"></i>
                                </div>
                                <div className="ns-pay-lease-row-info">
                                    <span className="ns-pay-lease-row-title">{property?.property_name || 'Property'}</span>
                                    <span className="ns-pay-lease-row-tenant">
                                        Tenant: {tenant ? `${tenant.first_name} ${tenant.last_name}` : 'Not assigned'}
                                    </span>
                                </div>
                                <span className="ns-pay-lease-row-rent">
                                    ${Number(lease.monthly_rent).toLocaleString()}<small>/mo</small>
                                </span>
                                <span className="ns-pay-lease-row-due">
                                    {!focus
                                        ? 'No schedule yet'
                                        : focus.status === 'Paid'
                                          ? 'Fully paid'
                                          : `${focusCountdown.text} · ${formatDueDate(focus.payment_date, { month: 'short', day: 'numeric' })}${dueCount > 1 ? ` · ${dueCount} months owed` : ''}`}
                                </span>
                                <span className={`ns-pay-tag ${focus ? PAYMENT_STATUS_TAG[focus.status] || 'tag-pending' : 'tag-scheduled'}`}>
                                    {focus ? PAYMENT_STATUS_LABEL[focus.status] || focus.status : 'No schedule'}
                                </span>
                                {focus && isPayable(focus.status) && (
                                    <button
                                        type="button"
                                        className="ns-outline-btn ns-pay-reminder-btn"
                                        disabled={
                                            !ownerDui ||
                                            reminderStatus[lease.contract_id] === 'sending' ||
                                            reminderStatus[lease.contract_id] === 'sent'
                                        }
                                        title={`Notify ${tenant ? tenant.first_name : 'the tenant'} that ${money(focus.amount)} is ${focus.status === 'Late' ? 'overdue' : 'due'}`}
                                        onClick={() => sendReminder(lease, focus, dueCount)}
                                    >
                                        {reminderStatus[lease.contract_id] === 'sending' ? (
                                            'Sending...'
                                        ) : reminderStatus[lease.contract_id] === 'sent' ? (
                                            <>
                                                <i className="bi bi-check2"></i> Reminder sent
                                            </>
                                        ) : reminderStatus[lease.contract_id] === 'error' ? (
                                            'Retry reminder'
                                        ) : (
                                            'Send reminder'
                                        )}
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            <h3 className="ns-pay-section-title">Payment history</h3>
            <div className="ns-pay-table-wrap">
                <table className="ns-pay-table">
                    <thead>
                        <tr>
                            <th>Property</th>
                            <th>Tenant</th>
                            <th>Due date</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((row) => (
                            <tr key={row.payment_id}>
                                <td>{row.contract?.add_business?.property_name || '—'}</td>
                                <td className="ns-pay-muted">
                                    {row.contract?.users
                                        ? `${row.contract.users.first_name} ${row.contract.users.last_name}`
                                        : '—'}
                                </td>
                                <td className="ns-pay-muted">{formatDueDate(row.payment_date)}</td>
                                <td>${Number(row.amount).toLocaleString()}</td>
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
        </>
    )
}
