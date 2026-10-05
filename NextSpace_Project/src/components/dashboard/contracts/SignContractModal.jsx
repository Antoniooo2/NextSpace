import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_VALUES } from '../../../lib/brand'
import { ARROW_RIGHT, DOT } from '../../../lib/symbols'
import { formatDueDate } from '../../../lib/rentSchedule'
import { contractActions, dueDayLabel, money, personName } from '../../../lib/contracts'

// Tenant signs the owner's offer: a last look at the key terms, their typed
// name and an explicit agreement. Signing makes the lease Active.
export default function SignContractModal({ contract, tenantName, onClose, onSigned }) {
    const { t } = useTranslation()
    const [name, setName] = useState(tenantName || '')
    const [agree, setAgree] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const property = contract.add_business || {}

    const submit = async (e) => {
        e.preventDefault()
        if (!agree) {
            setError(t('signModal.confirmError'))
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
                aria-label={t('signModal.title')}
                onClick={(e) => e.stopPropagation()}
                onSubmit={submit}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{t('signModal.title')}</h2>
                    <p className="ns-modal-form-subtitle">
                        {property.property_name} {DOT} {t('signModal.offeredBy', { name: contract.owner_signed_name || personName(property.users) })}
                    </p>

                    <div className="ns-offer-summary ns-offer-summary-4">
                        <div>
                            <small>{t('docs.lease.monthlyRent')}</small>
                            <strong>{money(contract.monthly_rent)}</strong>
                        </div>
                        <div>
                            <small>{t('docs.reports.lease')}</small>
                            <strong>
                                {formatDueDate(contract.start_date)} {ARROW_RIGHT} {formatDueDate(contract.end_date)}
                            </strong>
                        </div>
                        <div>
                            <small>{t('docs.lease.rentDue')}</small>
                            <strong>{t('signModal.dueDay', { day: dueDayLabel(contract.start_date) })}</strong>
                        </div>
                        <div>
                            <small>{t('docs.lease.deposit')}</small>
                            <strong>{Number(contract.deposit || 0) > 0 ? money(contract.deposit) : t('common.none')}</strong>
                        </div>
                    </div>
                    {contract.special_clauses && (
                        <p className="ns-notice-note" style={{ whiteSpace: 'pre-wrap' }}>
                            <strong>{t('docs.lease.specialClauses')}:</strong> {contract.special_clauses}
                        </p>
                    )}

                    <div className="ns-signature-box">
                        <label className="ns-label" htmlFor="signName">{t('signModal.signWithName')}</label>
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
                                {t('signModal.agree', { ...BRAND_VALUES, date: formatDueDate(contract.start_date) })}
                            </span>
                        </label>
                    </div>

                    {error && (
                        <div className="alert alert-danger py-2" role="alert">
                            {error}
                        </div>
                    )}

                    <button type="submit" className="ns-submit-btn" disabled={saving}>
                        <i className="bi bi-pen"></i> {saving ? t('signModal.signing') : t('signModal.sign')}
                    </button>
                </div>
            </form>
        </div>
    )
}
