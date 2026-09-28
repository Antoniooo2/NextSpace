import { useState } from 'react'
import { formatDueDate } from '../../../lib/rentSchedule'
import { contractActions, dueDayLabel, money, personName } from '../../../lib/contracts'

// Tenant signs the owner's offer: a last look at the key terms, their typed
// name and an explicit agreement. Signing makes the lease Active.
export default function SignContractModal({ contract, tenantName, onClose, onSigned }) {
    const [name, setName] = useState(tenantName || '')
    const [agree, setAgree] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const property = contract.add_business || {}

    const submit = async (e) => {
        e.preventDefault()
        if (!agree) {
            setError('Confirm that you have read and agree to the lease.')
            return
        }
        setSaving(true)
        setError('')
        try {
            const code = await contractActions.sign({ contractId: contract.contract_id, name })
            onSigned(code)
        } catch (err) {
            setError(err.message)
            setSaving(false)
        }
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <form
                className="ns-modal ns-modal-form ns-contract-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Sign the lease"
                onClick={(e) => e.stopPropagation()}
                onSubmit={submit}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">Sign the lease</h2>
                    <p className="ns-modal-form-subtitle">
                        {property.property_name} · offered and signed by {contract.owner_signed_name || personName(property.users)}
                    </p>

                    <div className="ns-offer-summary ns-offer-summary-4">
                        <div>
                            <small>Monthly rent</small>
                            <strong>{money(contract.monthly_rent)}</strong>
                        </div>
                        <div>
                            <small>Lease</small>
                            <strong>
                                {formatDueDate(contract.start_date)} → {formatDueDate(contract.end_date)}
                            </strong>
                        </div>
                        <div>
                            <small>Rent due</small>
                            <strong>the {dueDayLabel(contract.start_date)}</strong>
                        </div>
                        <div>
                            <small>Deposit</small>
                            <strong>{Number(contract.deposit || 0) > 0 ? money(contract.deposit) : 'None'}</strong>
                        </div>
                    </div>
                    {contract.special_clauses && (
                        <p className="ns-notice-note" style={{ whiteSpace: 'pre-wrap' }}>
                            <strong>Special clauses:</strong> {contract.special_clauses}
                        </p>
                    )}

                    <div className="ns-signature-box">
                        <label className="ns-label" htmlFor="signName">Sign with your full name</label>
                        <input
                            id="signName"
                            className="form-control ns-signature-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            minLength={3}
                            required
                        />
                        <label className="ns-agree">
                            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                            <span>
                                I have read the lease, including the standard and special clauses, and I agree to it. I understand
                                the first rent is due on {formatDueDate(contract.start_date)} and is paid in NextSpace.
                            </span>
                        </label>
                    </div>

                    {error && (
                        <div className="alert alert-danger py-2" role="alert">
                            {error}
                        </div>
                    )}

                    <button type="submit" className="ns-submit-btn" disabled={saving}>
                        <i className="bi bi-pen"></i> {saving ? 'Signing...' : 'Sign lease'}
                    </button>
                </div>
            </form>
        </div>
    )
}
