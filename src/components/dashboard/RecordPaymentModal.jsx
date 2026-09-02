import { useState } from 'react'

export default function RecordPaymentModal({ leases, properties, onClose, onSubmit }) {
    const [propertyId, setPropertyId] = useState(leases[0]?.propertyId ?? '')
    const [amount, setAmount] = useState(leases[0]?.rent ?? '')
    const [method, setMethod] = useState('Bank Transfer')

    const handlePropertyChange = (value) => {
        setPropertyId(value)
        const lease = leases.find((l) => l.propertyId === Number(value))
        if (lease) setAmount(lease.rent)
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!propertyId || !amount) return
        onSubmit({ propertyId: Number(propertyId), amount: Number(amount), method })
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
                        Log a rent payment you received manually (cash, bank transfer, etc). This is added to
                        this session's preview only, not saved permanently yet.
                    </p>

                    <form onSubmit={handleSubmit}>
                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="payProperty">Property</label>
                            <select
                                id="payProperty"
                                className="form-select"
                                value={propertyId}
                                onChange={(e) => handlePropertyChange(e.target.value)}
                            >
                                {leases.map((lease) => {
                                    const property = properties.find((p) => p.id === lease.propertyId)
                                    return (
                                        <option key={lease.propertyId} value={lease.propertyId}>
                                            {property?.title} — {lease.tenantName}
                                        </option>
                                    )
                                })}
                            </select>
                        </div>

                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="payAmount">Amount (USD)</label>
                            <div className="ns-input-group input-group">
                                <span className="input-group-text"><i className="bi bi-currency-dollar"></i></span>
                                <input
                                    id="payAmount" type="number" min="0" className="form-control"
                                    value={amount} onChange={(e) => setAmount(e.target.value)} required
                                />
                            </div>
                        </div>

                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="payMethod">Payment method</label>
                            <div className="ns-input-group input-group">
                                <span className="input-group-text"><i className="bi bi-credit-card"></i></span>
                                <input
                                    id="payMethod" type="text" className="form-control"
                                    value={method} onChange={(e) => setMethod(e.target.value)}
                                />
                            </div>
                        </div>

                        <button type="submit" className="ns-submit-btn">Record payment</button>
                    </form>
                </div>
            </div>
        </div>
    )
}