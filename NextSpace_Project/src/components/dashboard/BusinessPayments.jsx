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
    const [payError, setPayError] = useState('')
    const [paying, setPaying] = useState(false)
    const [notice, setNotice] = useState(false)

    const loadPayments = async (contractId) => {
        const { data: paymentRows, error: paymentError } = await supabase
            .from('payment')
            .select('*')
            .eq('contract_id', contractId)
            .order('payment_date', { ascending: false })

        if (paymentError) {
            setLoadError(describeSupabaseError(paymentError))
            return
        }

        setPayments(paymentRows || [])
    }

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

            await loadPayments(activeContract.contract_id)
            if (!cancelled) setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [user.id])

    const handlePayNow = async () => {
        if (!contract) return

        setPaying(true)
        setPayError('')

        const { data, error } = await supabase
            .from('payment')
            .insert({
                contract_id: contract.contract_id,
                payment_date: new Date().toISOString().slice(0, 10),
                amount: contract.monthly_rent,
                payment_method: 'Credit Card',
                status: 'Paid',
            })
            .select()

        setPaying(false)

        if (error) {
            setPayError(describeSupabaseError(error))
            return
        }
        if (!data || data.length === 0) {
            setPayError(
                "The payment could not be recorded. This is usually caused by a permissions (row-level security) rule blocking it."
            )
            return
        }

        await loadPayments(contract.contract_id)
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
                    <button
                        type="button" className="ns-filled-btn ns-pay-full-btn"
                        onClick={handlePayNow} disabled={paying}
                    >
                        {paying ? 'Processing...' : 'Pay now'}
                    </button>
                    <button type="button" className="ns-outline-btn ns-pay-full-btn" onClick={() => setNotice(true)}>
                        <i className="bi bi-download"></i> Download receipt
                    </button>
                    <p className="ns-pay-simulation-note">
                        <i className="bi bi-info-circle"></i> Simulated in-platform payment — no real bank charge occurs yet.
                    </p>
                </div>
            </div>

            {payError && (
                <div className="alert alert-danger py-2" role="alert">
                    {payError}
                </div>
            )}

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
