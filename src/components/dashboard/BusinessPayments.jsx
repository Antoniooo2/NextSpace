import { useState } from 'react'
import {
    BUSINESS_LEASE,
    BUSINESS_UPCOMING_PAYMENT,
    BUSINESS_SCHEDULE,
    BUSINESS_PAYMENT_HISTORY,
} from '../../data/payments'
import NoticeModal from './NoticeModal'

export default function BusinessPayments({ onNavigate }) {
    const [notice, setNotice] = useState(false)

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Payments</h1>
                    <p>Track your rent and payment history for {BUSINESS_LEASE.property.title}.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button type="button" className="ns-outline-btn" onClick={() => setNotice(true)}>
                        <i className="bi bi-download"></i> Export report
                    </button>
                </div>
            </div>

            <div className="ns-pay-top-grid">
                <div className="ns-pay-lease-card">
                    <div className="ns-pay-lease-media">
                        <img src={BUSINESS_LEASE.property.image} alt={BUSINESS_LEASE.property.title} />
                        <span className="ns-pay-status-badge">{BUSINESS_LEASE.status}</span>
                    </div>
                    <div className="ns-pay-lease-body">
                        <div className="ns-pay-lease-top">
                            <div>
                                <h2>{BUSINESS_LEASE.property.title}</h2>
                                <p className="ns-pay-lease-address">{BUSINESS_LEASE.property.city}</p>
                                <p className="ns-pay-lease-meta">
                                    Owner: <strong>{BUSINESS_LEASE.ownerName}</strong>
                                    <span className="ns-pay-dot">•</span>
                                    Start date: {BUSINESS_LEASE.startDate}
                                </p>
                            </div>
                            <div className="ns-pay-rent">
                                ${BUSINESS_LEASE.rent}<small>/mo</small>
                            </div>
                        </div>
                        <div className="ns-pay-lease-footer">
                            <span className="ns-pay-contract-id">Contract #{BUSINESS_LEASE.contractId}</span>
                            <button type="button" className="ns-link-btn" onClick={() => onNavigate('contracts')}>
                                View contract <i className="bi bi-box-arrow-up-right"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="ns-pay-due-card">
                    <p className="ns-pay-due-warning">
                        <i className="bi bi-exclamation-triangle-fill"></i> Upcoming due date
                    </p>
                    <p className="ns-pay-due-desc">
                        Your {BUSINESS_UPCOMING_PAYMENT.month} payment is due in {BUSINESS_UPCOMING_PAYMENT.dueInDays} days
                    </p>
                    <p className="ns-pay-due-amount">${BUSINESS_UPCOMING_PAYMENT.amount.toFixed(2)}</p>
                    <button type="button" className="ns-filled-btn ns-pay-full-btn" onClick={() => setNotice(true)}>
                        Pay now
                    </button>
                    <button type="button" className="ns-outline-btn ns-pay-full-btn" onClick={() => setNotice(true)}>
                        <i className="bi bi-download"></i> Download receipt
                    </button>
                </div>
            </div>

            <h3 className="ns-pay-section-title">Payment schedule</h3>
            <div className="ns-pay-schedule-row">
                {BUSINESS_SCHEDULE.map((item, i) => (
                    <div key={i} className={`ns-pay-schedule-chip status-${item.status}`}>
                        <div className="ns-pay-schedule-date">
                            <span>{item.label}</span>
                            <strong>{item.day}</strong>
                        </div>
                        {item.status === 'paid' && (
                            <>
                                <span className="ns-pay-tag tag-paid">Paid</span>
                                <span className="ns-pay-schedule-ref">Ref #{item.ref}</span>
                            </>
                        )}
                        {item.status === 'pending' && (
                            <>
                                <span className="ns-pay-tag tag-pending">Pending</span>
                                <span className="ns-pay-schedule-ref">Due in {item.dueInDays} days</span>
                            </>
                        )}
                        {item.status === 'upcoming' && <span className="ns-pay-schedule-ref">Upcoming</span>}
                    </div>
                ))}
            </div>

            <h3 className="ns-pay-section-title">Payment history</h3>
            <div className="ns-pay-table-wrap">
                <table className="ns-pay-table">
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {BUSINESS_PAYMENT_HISTORY.map((row, i) => (
                            <tr key={i}>
                                <td>{row.label}</td>
                                <td className="ns-pay-muted">{row.date}</td>
                                <td>${row.amount.toFixed(2)}</td>
                                <td className="ns-pay-muted">{row.method}</td>
                                <td>
                                    <span className="ns-pay-tag tag-paid">{row.status}</span>
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className="ns-pay-icon-btn"
                                        onClick={() => setNotice(true)}
                                        title="Download receipt"
                                    >
                                        <i className="bi bi-download"></i>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {notice && (
                <NoticeModal
                    icon="bi-credit-card"
                    title="Payments are coming soon"
                    description="Online rent payment and downloadable receipts aren't connected yet — this is a preview of how it'll work."
                    onClose={() => setNotice(false)}
                />
            )}
        </>
    )
}