import { useState } from 'react'
import { PROPERTIES } from '../../data/properties'
import { OWNER_LEASES, OWNER_PAYMENT_HISTORY } from '../../data/payments'
import RecordPaymentModal from './RecordPaymentModal'
import NoticeModal from './NoticeModal'

const STATUS_LABEL = { paid: 'Paid', pending: 'Pending', overdue: 'Overdue' }

export default function OwnerPayments() {
    const [leases, setLeases] = useState(OWNER_LEASES)
    const [history, setHistory] = useState(OWNER_PAYMENT_HISTORY)
    const [showRecordModal, setShowRecordModal] = useState(false)
    const [notice, setNotice] = useState(false)

    const propertyById = (id) => PROPERTIES.find((p) => p.id === id)

    const collectedThisMonth = leases
        .filter((l) => l.status === 'paid')
        .reduce((sum, l) => sum + l.rent, 0)
    const pendingCount = leases.filter((l) => l.status === 'pending').length
    const overdueCount = leases.filter((l) => l.status === 'overdue').length

    const handleRecordPayment = (entry) => {
        const tenantName = leases.find((l) => l.propertyId === entry.propertyId)?.tenantName || '—'

        setLeases((prev) =>
            prev.map((l) => (l.propertyId === entry.propertyId ? { ...l, status: 'paid' } : l))
        )
        setHistory((prev) => [
            {
                propertyTitle: propertyById(entry.propertyId)?.title || 'Property',
                tenantName,
                date: new Date().toLocaleDateString('en-GB'),
                amount: entry.amount,
                method: entry.method,
                status: 'Paid',
            },
            ...prev,
        ])
        setShowRecordModal(false)
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Payments</h1>
                    <p>Track rent collected from your tenants across all your properties.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button type="button" className="ns-filled-btn" onClick={() => setShowRecordModal(true)}>
                        <i className="bi bi-plus-lg"></i> Record payment
                    </button>
                </div>
            </div>

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
                    <span className="ns-stat-card-value">{overdueCount}</span>
                    <span className="ns-stat-card-label">Overdue payments</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{leases.length}</span>
                    <span className="ns-stat-card-label">Active leases</span>
                </div>
            </div>

            <h3 className="ns-pay-section-title">Active leases</h3>
            <div className="ns-pay-lease-list">
                {leases.map((lease) => {
                    const property = propertyById(lease.propertyId)
                    if (!property) return null
                    return (
                        <div className="ns-pay-lease-row" key={lease.propertyId}>
                            <div className="ns-pay-lease-row-img">
                                {property.image ? (
                                    <img src={property.image} alt={property.title} />
                                ) : (
                                    <i className="bi bi-image"></i>
                                )}
                            </div>
                            <div className="ns-pay-lease-row-info">
                                <span className="ns-pay-lease-row-title">{property.title}</span>
                                <span className="ns-pay-lease-row-tenant">Tenant: {lease.tenantName}</span>
                            </div>
                            <span className="ns-pay-lease-row-rent">
                                ${lease.rent.toLocaleString()}<small>/mo</small>
                            </span>
                            <span className={`ns-pay-tag tag-${lease.status}`}>{STATUS_LABEL[lease.status]}</span>
                            <span className="ns-pay-lease-row-due">Due {lease.dueDate}</span>
                            {lease.status !== 'paid' && (
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
                        {history.map((row, i) => (
                            <tr key={i}>
                                <td>{row.propertyTitle}</td>
                                <td className="ns-pay-muted">{row.tenantName}</td>
                                <td className="ns-pay-muted">{row.date}</td>
                                <td>${row.amount.toLocaleString()}</td>
                                <td className="ns-pay-muted">{row.method}</td>
                                <td>
                                    <span className="ns-pay-tag tag-paid">{row.status}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showRecordModal && (
                <RecordPaymentModal
                    leases={leases}
                    properties={PROPERTIES}
                    onClose={() => setShowRecordModal(false)}
                    onSubmit={handleRecordPayment}
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