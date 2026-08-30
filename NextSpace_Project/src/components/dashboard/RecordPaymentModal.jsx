import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from './NewPropertyModal'

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Credit Card', 'Debit Card', 'Mobile Payment']
export const PAYMENT_STATUSES = ['Pending', 'Paid', 'Late', 'Cancelled']

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function RecordPaymentModal({ contracts, onClose, onSaved }) {
    const [contractId, setContractId] = useState(contracts[0]?.contract_id ?? '')
    const [amount, setAmount] = useState(
        contracts[0]?.monthly_rent != null ? String(contracts[0].monthly_rent) : ''
    )
    const [method, setMethod] = useState(PAYMENT_METHODS[0])
    const [paymentDate, setPaymentDate] = useState(todayISO())
    const [status, setStatus] = useState('Paid')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const handleContractChange = (value) => {
        setContractId(value)
        const contract = contracts.find((c) => String(c.contract_id) === value)
        if (contract?.monthly_rent != null) setAmount(String(contract.monthly_rent))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')

        const errors = []
        if (!contractId) errors.push('Select a lease.')
        if (!paymentDate) errors.push('Payment date is required.')
        if (!PAYMENT_METHODS.includes(method)) errors.push('Select a valid payment method.')
        if (!PAYMENT_STATUSES.includes(status)) errors.push('Select a valid status.')

        const amountNum = Number(amount)
        if (!amount.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
            errors.push('Amount must be a positive number.')
        }

        if (errors.length > 0) {
            setErrorMsg(errors.join(' '))
            return
        }

        setSaving(true)

        const { data, error } = await supabase
            .from('payment')
            .insert({
                contract_id: Number(contractId),
                payment_date: paymentDate,
                amount: amountNum,
                payment_method: method,
                status,
            })
            .select()

        setSaving(false)

        if (error) {
            setErrorMsg(describeSupabaseError(error))
            return
        }
        if (!data || data.length === 0) {
            setErrorMsg(
                "The payment could not be recorded. This is usually caused by a permissions (row-level security) rule blocking the insert."
            )
            return
        }

        onSaved(data[0])
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-modal-form" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">Record a payment</h2>
                    <p className="ns-modal-form-subtitle">
                        Log a rent payment for one of your active leases.
                    </p>

                    {errorMsg && (
                        <div className="alert alert-danger py-2" role="alert">
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="payContract">Lease</label>
                            <select
                                id="payContract" className="form-select"
                                value={contractId} onChange={(e) => handleContractChange(e.target.value)}
                            >
                                {contracts.map((contract) => (
                                    <option key={contract.contract_id} value={contract.contract_id}>
                                        {contract.add_business?.property_name || 'Property'} —{' '}
                                        {contract.users
                                            ? `${contract.users.first_name} ${contract.users.last_name}`
                                            : 'Tenant'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="row g-2">
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="payAmount">Amount (USD)</label>
                                    <div className="ns-input-group input-group">
                                        <span className="input-group-text"><i className="bi bi-currency-dollar"></i></span>
                                        <input
                                            id="payAmount" type="number" min="0" step="0.01" className="form-control"
                                            value={amount} onChange={(e) => setAmount(e.target.value)} required
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="payDate">Payment date</label>
                                    <input
                                        id="payDate" type="date" className="form-control"
                                        value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="row g-2">
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="payMethod">Payment method</label>
                                    <select
                                        id="payMethod" className="form-select"
                                        value={method} onChange={(e) => setMethod(e.target.value)}
                                    >
                                        {PAYMENT_METHODS.map((m) => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="payStatus">Status</label>
                                    <select
                                        id="payStatus" className="form-select"
                                        value={status} onChange={(e) => setStatus(e.target.value)}
                                    >
                                        {PAYMENT_STATUSES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="ns-submit-btn" disabled={saving}>
                            {saving ? 'Saving...' : 'Record payment'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
