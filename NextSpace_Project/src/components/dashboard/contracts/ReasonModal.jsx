import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { todayInElSalvador } from '../../../lib/rentSchedule'

// One small form for the "say why" steps: declining a request, withdrawing
// or turning down an offer, and asking to end a lease early (with a date).
export default function ReasonModal({
    title,
    subtitle,
    reasonLabel,
    reasonRequired = false,
    placeholder,
    withDate = false,
    minDate,
    maxDate,
    confirmLabel,
    danger = false,
    onClose,
    onConfirm,
}) {
    const { t } = useTranslation()
    const [reason, setReason] = useState('')
    const [date, setDate] = useState(minDate || todayInElSalvador())
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        setError('')
        try {
            await onConfirm({ reason: reason.trim(), date })
        } catch (err) {
            setError(err.message)
            setSaving(false)
        }
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <form
                className="ns-modal ns-modal-form ns-notice-modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                onSubmit={submit}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{title}</h2>
                    {subtitle && <p className="ns-modal-form-subtitle">{subtitle}</p>}

                    {withDate && (
                        <>
                            <label className="ns-label" htmlFor="reasonDate">{t('reasonModal.newEndDate')}</label>
                            <input
                                id="reasonDate"
                                type="date"
                                className="form-control mb-3"
                                min={minDate}
                                max={maxDate}
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                required
                            />
                        </>
                    )}

                    <label className="ns-label" htmlFor="reasonText">
                        {reasonLabel || t('reasonModal.reason')} {!reasonRequired && <span className="ns-pay-muted">({t('listingForm.optional')})</span>}
                    </label>
                    <textarea
                        id="reasonText"
                        className="form-control mb-3"
                        rows={3}
                        maxLength={500}
                        placeholder={placeholder}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required={reasonRequired}
                        minLength={reasonRequired ? 5 : undefined}
                    />

                    {error && (
                        <div className="alert alert-danger py-2" role="alert">
                            {error}
                        </div>
                    )}

                    <button type="submit" className={`ns-submit-btn ${danger ? 'ns-submit-danger' : ''}`} disabled={saving}>
                        {saving ? t('common.saving') : confirmLabel}
                    </button>
                </div>
            </form>
        </div>
    )
}
