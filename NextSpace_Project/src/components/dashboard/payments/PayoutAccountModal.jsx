import { useState } from 'react'
import { ACCOUNT_TYPES, SV_BANKS, savePayoutAccount, validatePayoutAccount } from '../../../lib/payouts'

// Where NextSpace sends an owner's rent (minus the NextSpace fee). Only the
// owner and NextSpace staff can read it.
export default function PayoutAccountModal({ ownerDui, account, defaultHolder = '', onSaved, onClose }) {
    const [holderName, setHolderName] = useState(account?.holder_name || defaultHolder)
    const [bankName, setBankName] = useState(account?.bank_name || '')
    const [accountType, setAccountType] = useState(account?.account_type || 'Savings')
    const [accountNumber, setAccountNumber] = useState(account?.account_number || '')
    const [errors, setErrors] = useState({})
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        const found = validatePayoutAccount({ holderName, bankName, accountNumber })
        setErrors(found)
        if (Object.keys(found).length > 0) return

        setSaving(true)
        setSaveError('')
        try {
            const saved = await savePayoutAccount({ ownerDui, holderName, bankName, accountType, accountNumber })
            onSaved?.(saved)
        } catch (err) {
            setSaveError(err.message)
            setSaving(false)
        }
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div
                className="ns-modal ns-modal-form"
                role="dialog"
                aria-modal="true"
                aria-label="Bank account for transfers"
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{account ? 'Change bank account' : 'Add your bank account'}</h2>
                    <p className="ns-modal-form-subtitle">
                        NextSpace transfers the rent your tenants pay, minus the NextSpace fee, to this account. Only you
                        and the NextSpace team can see it.
                    </p>

                    <form onSubmit={handleSubmit} noValidate>
                        {saveError && (
                            <div className="alert alert-danger py-2" role="alert">
                                {saveError}
                            </div>
                        )}

                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="payoutHolder">Account holder</label>
                            <input
                                id="payoutHolder"
                                className={`form-control ${errors.holderName ? 'is-invalid' : ''}`}
                                value={holderName}
                                onChange={(e) => setHolderName(e.target.value)}
                                autoComplete="name"
                                maxLength={120}
                            />
                            {errors.holderName && <div className="invalid-feedback">{errors.holderName}</div>}
                        </div>

                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="payoutBank">Bank</label>
                            <input
                                id="payoutBank"
                                className={`form-control ${errors.bankName ? 'is-invalid' : ''}`}
                                value={bankName}
                                onChange={(e) => setBankName(e.target.value)}
                                list="payoutBankList"
                                placeholder="Choose or type your bank"
                                maxLength={80}
                            />
                            <datalist id="payoutBankList">
                                {SV_BANKS.map((b) => (
                                    <option key={b} value={b} />
                                ))}
                            </datalist>
                            {errors.bankName && <div className="invalid-feedback">{errors.bankName}</div>}
                        </div>

                        <div className="ns-mb-field">
                            <span className="ns-label">Account type</span>
                            <div className="ns-segmented" role="radiogroup" aria-label="Account type">
                                {ACCOUNT_TYPES.map((t) => (
                                    <button
                                        type="button"
                                        key={t.id}
                                        role="radio"
                                        aria-checked={accountType === t.id}
                                        className={accountType === t.id ? 'active' : ''}
                                        onClick={() => setAccountType(t.id)}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="payoutNumber">Account number</label>
                            <input
                                id="payoutNumber"
                                className={`form-control ${errors.accountNumber ? 'is-invalid' : ''}`}
                                value={accountNumber}
                                onChange={(e) => setAccountNumber(e.target.value)}
                                inputMode="numeric"
                                autoComplete="off"
                                maxLength={30}
                            />
                            {errors.accountNumber && <div className="invalid-feedback">{errors.accountNumber}</div>}
                        </div>

                        <button type="submit" className="ns-submit-btn" disabled={saving}>
                            {saving ? 'Saving...' : 'Save bank account'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
