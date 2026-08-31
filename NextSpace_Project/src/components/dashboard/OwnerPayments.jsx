import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from './NewPropertyModal'
import RecordPaymentModal from './RecordPaymentModal'
import NoticeModal from './NoticeModal'

const STATUS_TAG = { Pending: 'tag-pending', Paid: 'tag-paid', Late: 'tag-late', Cancelled: 'tag-cancelled' }

const CONTRACT_EMBED =
    '*, add_business!contract_property_id_fkey(property_name, monthly_rent), users!contract_tenant_dui_fkey(first_name,last_name)'

const PAYMENT_EMBED =
    '*, contract(contract_id, add_business!contract_property_id_fkey(property_name), users!contract_tenant_dui_fkey(first_name,last_name))'

export default function OwnerPayments() {
    const [contracts, setContracts] = useState([])
    const [payments, setPayments] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [actionError, setActionError] = useState('')
    const [showRecordModal, setShowRecordModal] = useState(false)
    const [notice, setNotice] = useState(false)

    const loadData = async () => {
        const [{ data: contractRows, error: contractError }, { data: paymentRows, error: paymentError }] =
            await Promise.all([
                supabase.from('contract').select(CONTRACT_EMBED).order('start_date', { ascending: false }),
                supabase.from('payment').select(PAYMENT_EMBED).order('payment_date', { ascending: false }),
            ])

        const firstError = contractError || paymentError
        if (firstError) {
            setLoadError(describeSupabaseError(firstError))
            return
        }

        setContracts(contractRows || [])
        setPayments(paymentRows || [])
    }

    useEffect(() => {
        let cancelled = false

        const init = async () => {
            setLoading(true)
            setLoadError('')
            await loadData()
            if (!cancelled) setLoading(false)
        }

        init()

        return () => {
            cancelled = true
        }
    }, [])

    const activeLeases = contracts.filter((c) => c.status === 'Active')

    const currentMonthKey = new Date().toISOString().slice(0, 7)
    const collectedThisMonth = payments
        .filter((p) => p.status === 'Paid' && p.payment_date?.slice(0, 7) === currentMonthKey)
        .reduce((sum, p) => sum + Number(p.amount), 0)
    const pendingCount = payments.filter((p) => p.status === 'Pending').length
    const lateCount = payments.filter((p) => p.status === 'Late').length

    const latestPaymentFor = (contractId) => payments.find((p) => p.contract?.contract_id === contractId)

    const handleRecordPayment = async () => {
        setShowRecordModal(false)
        setActionError('')
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
                    <p>Track rent collected from your tenants across all your properties.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button
                        type="button" className="ns-filled-btn"
                        onClick={() => setShowRecordModal(true)}
                        disabled={activeLeases.length === 0}
                    >
                        <i className="bi bi-plus-lg"></i> Record payment
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}
            {activeLeases.length === 0 && (
                <p className="ns-pay-muted mb-3">
                    You don't have any active leases yet, so there's nothing to record a payment against. Activate a
                    contract first from the Contracts section.
                </p>
            )}
            {actionError && (
                <div className="alert alert-danger py-2" role="alert">
                    {actionError}
                </div>
            )}

            <div className="ns-stats-row">
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">${collectedThisMonth.toLocaleString()}</span>
                    <span className="ns-stat-card-label">Collected this month</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{pendingCount}</span>
                    <span className="ns-stat-card-label">Pending payments</span>
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
                        const latest = latestPaymentFor(lease.contract_id)
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
                                <span className={`ns-pay-tag ${latest ? STATUS_TAG[latest.status] || 'tag-pending' : 'tag-pending'}`}>
                                    {latest ? latest.status : 'No payments yet'}
                                </span>
                                {(!latest || latest.status === 'Pending' || latest.status === 'Late') && (
                                    <button
                                        type="button"
                                        className="ns-outline-btn ns-pay-reminder-btn"
                                        onClick={() => setNotice(true)}
                                    >
                                        Send reminder
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
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {payments.map((row) => (
                            <tr key={row.payment_id}>
                                <td>{row.contract?.add_business?.property_name || '—'}</td>
                                <td className="ns-pay-muted">
                                    {row.contract?.users
                                        ? `${row.contract.users.first_name} ${row.contract.users.last_name}`
                                        : '—'}
                                </td>
                                <td className="ns-pay-muted">{row.payment_date}</td>
                                <td>${Number(row.amount).toLocaleString()}</td>
                                <td className="ns-pay-muted">{row.payment_method}</td>
                                <td>
                                    <span className={`ns-pay-tag ${STATUS_TAG[row.status] || 'tag-pending'}`}>{row.status}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showRecordModal && (
                <RecordPaymentModal
                    contracts={activeLeases}
                    onClose={() => setShowRecordModal(false)}
                    onSaved={handleRecordPayment}
                />
            )}

            {notice && (
                <NoticeModal
                    icon="bi-bell"
                    title="Reminders are coming soon"
                    description="Automatic payment reminders to tenants aren't connected yet — this is a preview of how it'll work."
                    onClose={() => setNotice(false)}
                />
            )}
        </>
    )
}
