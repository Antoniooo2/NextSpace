import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { PAYMENT_STATUS_LABEL, formatDueDate, todayInElSalvador } from '../../lib/rentSchedule'

const METHODS = ['Cash', 'Bank Transfer', 'Mobile Payment', 'Debit Card', 'Credit Card']

function money(value) {
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Owner records rent received outside Wompi. unpaid: this lease's unpaid
// installments, oldest first; the oldest is preselected.
export default function RecordPaymentModal({ lease, unpaid, onClose, onRecorded }) {
    const today = todayInElSalvador()
    const [paymentId, setPaymentId] = useState(unpaid[0]?.payment_id ?? '')
    const [method, setMethod] = useState('Cash')
    const [paidOn, setPaidOn] = useState(today)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const selected = unpaid.find((p) => p.payment_id === Number(paymentId))
    const tenant = lease.users ? `${lease.users.first_name} ${lease.users.last_name}` : 'the tenant'

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!selected) return
        if (paidOn > today) {
            setError('The payment date cannot be in the future.')
            return
        }

        setSaving(true)
        setError('')

        const { error: rpcError } = await supabase.rpc('record_manual_payment', {
            p_payment_id: selected.payment_id,
            p_method: method,
            p_paid_on: paidOn,
        })

        setSaving(false)

        if (rpcError) {
            setError(rpcError.message || 'Could not record the payment.')
            return
        }

        onRecorded()
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div
                className="ns-modal ns-modal-form"
                role="dialog"
                aria-modal="true"
                aria-label="Record a payment"
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">Record a payment</h2>
                    <p className="ns-modal-form-subtitle">
                        For rent {tenant} paid you outside NextSpace (cash, transfer...) for{' '}
                        {lease.add_business?.property_name || 'this property'}. They'll be notified and get a receipt.
                    </p>

                    {unpaid.length === 0 ? (
                        <p className="ns-pay-muted">Every month of this lease is already paid.</p>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <label className="ns-label" htmlFor="recordMonth">
                                Month
                            </label>
                            <select
                                id="recordMonth"
                                className="form-select mb-3"
                                value={paymentId}
                                onChange={(e) => setPaymentId(e.target.value)}
                            >
                                {unpaid.map((p) => (
                                    <option key={p.payment_id} value={p.payment_id}>
                                        {formatDueDate(p.payment_date, { month: 'long', year: 'numeric' })} — {money(p.amount)} (
                                        {PAYMENT_STATUS_LABEL[p.status] || p.status}, due {formatDueDate(p.payment_date)})
                                    </option>
                                ))}
                            </select>

                            <div className="row g-3 mb-3">
                                <div className="col-sm-6">
                                    <label className="ns-label" htmlFor="recordMethod">
                                        Method
                                    </label>
                                    <select
                                        id="recordMethod"
                                        className="form-select"
                                        value={method}
                                        onChange={(e) => setMethod(e.target.value)}
                                    >
                                        {METHODS.map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-sm-6">
                                    <label className="ns-label" htmlFor="recordDate">
                                        Received on
                                    </label>
                                    <input
                                        id="recordDate"
                                        type="date"
                                        className="form-control"
                                        value={paidOn}
                                        max={today}
                                        onChange={(e) => setPaidOn(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="alert alert-danger py-2" role="alert">
                                    {error}
                                </div>
                            )}

                            <button type="submit" className="ns-submit-btn" disabled={saving || !selected}>
                                {saving ? 'Recording...' : `Record ${selected ? money(selected.amount) : ''} as paid`}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
