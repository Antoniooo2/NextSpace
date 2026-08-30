import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from './NewPropertyModal'
import NoticeModal from './NoticeModal'

const STATUS_TAG = { Pending: 'tag-pending', Paid: 'tag-paid', Late: 'tag-late', Cancelled: 'tag-cancelled' }

const CONTRACT_EMBED =
    '*, add_business!contract_property_id_fkey(property_name, monthly_rent, users!add_business_owner_id_fkey(first_name,last_name))'

export default function BusinessPayments({ user, onNavigate }) {
    const [contract, setContract] = useState(null)
    const [payments, setPayments] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [notice, setNotice] = useState(false)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            setLoadError('')

            const { data: contracts, error: contractError } = await supabase
                .from('contract')
                .select(CONTRACT_EMBED)
                .order('start_date', { ascending: false })

            if (cancelled) return

            if (contractError) {
                setLoadError(describeSupabaseError(contractError))
                setLoading(false)
                return
            }

            const activeContract =
                (contracts || []).find((c) => c.status === 'Active') || (contracts || [])[0] || null
            setContract(activeContract)

            if (!activeContract) {
                setPayments([])
                setLoading(false)
                return
            }

            const { data: paymentRows, error: paymentError } = await supabase
                .from('payment')
                .select('*')
                .eq('contract_id', activeContract.contract_id)
                .order('payment_date', { ascending: false })

            if (cancelled) return

            if (paymentError) {
                setLoadError(describeSupabaseError(paymentError))
                setLoading(false)
                return
            }

            setPayments(paymentRows || [])
            setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [user.id])

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
                <h3>No lease yet</h3>
                <p>Once a property owner sets up a lease for you, your rent and payment history will show up here.</p>
            </div>
        )
    }

    const property = contract.add_business
    const owner = property?.users
    const nextDue = [...payments]
        .filter((p) => p.status === 'Pending' || p.status === 'Late')
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date))[0]

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Payments</h1>
                    <p>Track your rent and payment history for {property?.property_name || 'your space'}.</p>
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
                        <div className="ns-prop-media-placeholder">
                            <i className="bi bi-shop"></i>
                        </div>
                        <span className="ns-pay-status-badge">{contract.status}</span>
                    </div>
                    <div className="ns-pay-lease-body">
                        <div className="ns-pay-lease-top">
                            <div>
                                <h2>{property?.property_name || 'Property'}</h2>
                                <p className="ns-pay-lease-meta">
                                    Owner: <strong>{owner ? `${owner.first_name} ${owner.last_name}` : '—'}</strong>
                                    <span className="ns-pay-dot">•</span>
                                    Start date: {contract.start_date}
                                </p>
                            </div>
                            <div className="ns-pay-rent">
                                ${Number(contract.monthly_rent).toLocaleString()}<small>/mo</small>
                            </div>
                        </div>
                        <div className="ns-pay-lease-footer">
                            <span className="ns-pay-contract-id">Contract #{contract.contract_id}</span>
                            <button type="button" className="ns-link-btn" onClick={() => onNavigate('contracts')}>
                                View contract <i className="bi bi-box-arrow-up-right"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="ns-pay-due-card">
                    {nextDue ? (
                        <>
                            <p className="ns-pay-due-warning">
                                <i className="bi bi-exclamation-triangle-fill"></i> Upcoming due date
                            </p>
                            <p className="ns-pay-due-desc">
                                Your payment from {nextDue.payment_date} is {nextDue.status.toLowerCase()}
                            </p>
                            <p className="ns-pay-due-amount">${Number(nextDue.amount).toFixed(2)}</p>
                        </>
                    ) : (
                        <>
                            <p className="ns-pay-due-warning">
                                <i className="bi bi-check-circle-fill"></i> All caught up
                            </p>
                            <p className="ns-pay-due-desc">You have no pending or late payments.</p>
                        </>
                    )}
                    <button type="button" className="ns-filled-btn ns-pay-full-btn" onClick={() => setNotice(true)}>
                        Pay now
                    </button>
                    <button type="button" className="ns-outline-btn ns-pay-full-btn" onClick={() => setNotice(true)}>
                        <i className="bi bi-download"></i> Download receipt
                    </button>
                </div>
            </div>

            <h3 className="ns-pay-section-title">Payment schedule</h3>
            {payments.length === 0 ? (
                <p className="ns-pay-muted mb-4">No payments have been recorded for this lease yet.</p>
            ) : (
                <div className="ns-pay-schedule-row">
                    {payments.slice(0, 6).map((payment) => (
                        <div
                            key={payment.payment_id}
                            className={`ns-pay-schedule-chip status-${payment.status.toLowerCase()}`}
                        >
                            <div className="ns-pay-schedule-date">
                                <span>
                                    {new Date(payment.payment_date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                                </span>
                                <strong>{new Date(payment.payment_date).getDate()}</strong>
                            </div>
                            <span className={`ns-pay-tag ${STATUS_TAG[payment.status] || 'tag-pending'}`}>
                                {payment.status}
                            </span>
                            <span className="ns-pay-schedule-ref">Ref #{payment.payment_id}</span>
                        </div>
                    ))}
                </div>
            )}

            <h3 className="ns-pay-section-title">Payment history</h3>
            <div className="ns-pay-table-wrap">
                <table className="ns-pay-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {payments.map((row) => (
                            <tr key={row.payment_id}>
                                <td className="ns-pay-muted">{row.payment_date}</td>
                                <td>${Number(row.amount).toFixed(2)}</td>
                                <td className="ns-pay-muted">{row.payment_method}</td>
                                <td>
                                    <span className={`ns-pay-tag ${STATUS_TAG[row.status] || 'tag-pending'}`}>{row.status}</span>
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
