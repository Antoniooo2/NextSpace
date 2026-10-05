import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_VALUES } from '../../../lib/brand'
import { DOT, MINUS, QUOTE_CLOSE, QUOTE_OPEN } from '../../../lib/symbols'
import { formatDueDate } from '../../../lib/rentSchedule'
import { addMonths, contractActions, money, personName, recordSummary } from '../../../lib/contracts'

const LENGTHS = [3, 6, 12, 18, 24, 36]

function LengthSelect({ id, value, onChange }) {
    const { t } = useTranslation()
    return (
        <select id={id} className="form-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
            {[...new Set([...LENGTHS, Number(value)])]
                .sort((a, b) => a - b)
                .map((m) => (
                    <option key={m} value={m}>
                        {t('renewal.moreMonths', { count: m })}
                    </option>
                ))}
        </select>
    )
}

function ModalShell({ label, onClose, onSubmit, children }) {
    const { t } = useTranslation()
    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <form
                className="ns-modal ns-modal-form ns-contract-modal"
                role="dialog"
                aria-modal="true"
                aria-label={label}
                onClick={(e) => e.stopPropagation()}
                onSubmit={onSubmit}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">{children}</div>
            </form>
        </div>
    )
}

function ErrorAlert({ error }) {
    if (!error) return null
    return (
        <div className="alert alert-danger py-2" role="alert">
            {error}
        </div>
    )
}

// Tenant asks the owner to renew: how long they'd like to stay and a note.
// The owner answers with a renewal offer the tenant then signs.
export function RenewalRequestModal({ contract, stats, onClose, onSent, onAskRony }) {
    const { t } = useTranslation()
    const property = contract.add_business?.property_name || t('renewal.theSpace')
    const [months, setMonths] = useState(contract.duration_months && contract.duration_months <= 36 ? contract.duration_months : 12)
    const [note, setNote] = useState(() =>
        stats && stats.monthsDue > 0 && stats.paidOnTime === stats.monthsDue
            ? t('renewal.request.notePaid', { count: stats.monthsDue, name: property })
            : t('renewal.request.note', { name: property })
    )
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        setError('')
        try {
            await contractActions.requestRenewal({ contractId: contract.contract_id, months, note: note.trim() })
            onSent()
        } catch (err) {
            setError(err.message)
            setSaving(false)
        }
    }

    return (
        <ModalShell label={t('renewal.request.title')} onClose={onClose} onSubmit={submit}>
            <h2 className="ns-modal-form-title">{t('renewal.request.title')}</h2>
            <p className="ns-modal-form-subtitle">
                {t('renewal.request.subtitle', { name: property, date: formatDueDate(contract.end_date) })}
            </p>
            <div className="row g-3">
                <div className="col-sm-5">
                    <label className="ns-label" htmlFor="renewMonths">{t('renewal.request.stayFor')}</label>
                    <LengthSelect id="renewMonths" value={months} onChange={setMonths} />
                </div>
                <div className="col-sm-7">
                    <label className="ns-label">{t('reasonModal.newEndDate')}</label>
                    <p className="ns-renew-newend">{formatDueDate(addMonths(contract.end_date, months))}</p>
                </div>
            </div>
            <label className="ns-label mt-2" htmlFor="renewNote">
                {t('renewal.request.noteLabel')} <span className="ns-pay-muted">({t('listingForm.optional')})</span>
            </label>
            <textarea
                id="renewNote"
                className="form-control mb-2"
                rows={3}
                maxLength={1200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
            />
            {onAskRony && (
                <div className="ns-contract-rony-row">
                    <button
                        type="button"
                        className="ns-rony-write"
                        onClick={() =>
                            onAskRony({
                                text: t('renewal.request.askText', { name: property, date: formatDueDate(contract.end_date), rent: money(contract.monthly_rent) }),
                            })
                        }
                    >
                        <i className="bi bi-stars"></i> {t('renewal.request.askRony', BRAND_VALUES)}
                    </button>
                </div>
            )}
            <ErrorAlert error={error} />
            <button type="submit" className="ns-submit-btn" disabled={saving}>
                <i className="bi bi-send"></i> {saving ? t('common.sending') : t('renewal.request.send')}
            </button>
        </ModalShell>
    )
}

// Owner proposes the extension: extra months and the rent for them, signed
// with their typed name. Months already scheduled keep their current rent.
export function RenewalOfferModal({ contract, ownerName, record, onClose, onDone, onAskRony }) {
    const { t } = useTranslation()
    const property = contract.add_business?.property_name || t('offerModal.yourSpace')
    const tenant = personName(contract.users)
    const [months, setMonths] = useState(contract.renewal_request_months || contract.renewal_months || 12)
    const [rent, setRent] = useState(String(contract.renewal_rent ?? contract.monthly_rent ?? ''))
    const [note, setNote] = useState(contract.renewal_note || '')
    const [signature, setSignature] = useState(ownerName || '')
    const [agree, setAgree] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const newEnd = addMonths(contract.end_date, Number(months))
    const change = Number(rent || 0) - Number(contract.monthly_rent || 0)
    const summary = recordSummary(record)

    const submit = async (e) => {
        e.preventDefault()
        if (!agree) {
            setError(t('renewal.offer.agreeRequired'))
            return
        }
        setSaving(true)
        setError('')
        try {
            await contractActions.offerRenewal({ contractId: contract.contract_id, months, rent, note: note.trim(), ownerName: signature })
            onDone()
        } catch (err) {
            setError(err.message)
            setSaving(false)
        }
    }

    return (
        <ModalShell label={t('renewal.offer.title')} onClose={onClose} onSubmit={submit}>
            <h2 className="ns-modal-form-title">{contract.renewal_offered_at ? t('contractDetail.actions.updateRenewal') : t('renewal.offer.title')}</h2>
            <p className="ns-modal-form-subtitle">
                {tenant} {DOT} {property} {DOT} {t('renewal.offer.ends', { date: formatDueDate(contract.end_date) })}
                {contract.renewal_request_months ? ` ${DOT} ${t('renewal.offer.askedFor', { count: contract.renewal_request_months })}` : ''}
            </p>
            {contract.renewal_request_note && (
                <p className="ns-notice-note">
                    {QUOTE_OPEN}
                    {contract.renewal_request_note}
                    {QUOTE_CLOSE}
                </p>
            )}

            <div className="row g-3">
                <div className="col-sm-6">
                    <label className="ns-label" htmlFor="renewOfferMonths">{t('renewal.offer.extendBy')}</label>
                    <LengthSelect id="renewOfferMonths" value={months} onChange={setMonths} />
                </div>
                <div className="col-sm-6">
                    <label className="ns-label" htmlFor="renewOfferRent">{t('renewal.offer.rentLabel')}</label>
                    <input
                        id="renewOfferRent"
                        type="number"
                        min="1"
                        step="0.01"
                        className="form-control"
                        value={rent}
                        onChange={(e) => setRent(e.target.value)}
                        required
                    />
                </div>
                <div className="col-12">
                    <label className="ns-label" htmlFor="renewOfferNote">
                        {t('renewal.offer.note')} <span className="ns-pay-muted">({t('listingForm.optional')})</span>
                    </label>
                    <textarea
                        id="renewOfferNote"
                        className="form-control"
                        rows={2}
                        maxLength={1200}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                </div>
            </div>

            {onAskRony && (
                <div className="ns-contract-rony-row">
                    <button
                        type="button"
                        className="ns-rony-write"
                        onClick={() =>
                            onAskRony({
                                text: t('renewal.offer.askText', {
                                    ...BRAND_VALUES,
                                    person: tenant,
                                    name: property,
                                    rent: money(contract.monthly_rent),
                                    date: formatDueDate(contract.end_date),
                                    record: summary.short,
                                    detail: record
                                        ? t('renewal.offer.askDetail', { onTime: record.months_on_time, due: record.months_due, late: record.months_late_now })
                                        : '',
                                }),
                            })
                        }
                    >
                        <i className="bi bi-stars"></i> {t('renewal.offer.askRony', BRAND_VALUES)}
                    </button>
                </div>
            )}

            <div className="ns-offer-summary">
                <div>
                    <small>{t('reasonModal.newEndDate')}</small>
                    <strong>{formatDueDate(newEnd)}</strong>
                </div>
                <div>
                    <small>{t('renewal.offer.rentChange')}</small>
                    <strong>
                        {change === 0 ? t('renewal.sameRent') : `${change > 0 ? '+' : MINUS}${money(Math.abs(change))}${t('common.perMonth')}`}
                    </strong>
                </div>
                <div>
                    <small>{t('renewal.offer.added')}</small>
                    <strong>{money(Number(rent || 0) * Number(months || 0))}</strong>
                </div>
            </div>

            <div className="ns-signature-box">
                <label className="ns-label" htmlFor="renewOfferSign">{t('signModal.signWithName')}</label>
                <input
                    id="renewOfferSign"
                    className="form-control ns-signature-input"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    minLength={3}
                    required
                />
                <label className="ns-agree">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                    <span>
                        {t('renewal.offer.agree')}
                    </span>
                </label>
            </div>
            <ErrorAlert error={error} />
            <button type="submit" className="ns-submit-btn" disabled={saving}>
                <i className="bi bi-pen"></i> {saving ? t('common.sending') : t('renewal.offer.send')}
            </button>
        </ModalShell>
    )
}

// Tenant signs the owner's renewal offer: the lease is extended right away.
export function RenewalSignModal({ contract, tenantName, onClose, onSigned }) {
    const { t } = useTranslation()
    const [name, setName] = useState(tenantName || '')
    const [agree, setAgree] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const newEnd = addMonths(contract.end_date, Number(contract.renewal_months || 0))
    const change = Number(contract.renewal_rent || 0) - Number(contract.monthly_rent || 0)

    const submit = async (e) => {
        e.preventDefault()
        if (!agree) {
            setError(t('renewal.sign.agreeRequired'))
            return
        }
        setSaving(true)
        setError('')
        try {
            const code = await contractActions.signRenewal({ contractId: contract.contract_id, name })
            onSigned(code)
        } catch (err) {
            setError(err.message)
            setSaving(false)
        }
    }

    return (
        <ModalShell label={t('renewal.sign.title')} onClose={onClose} onSubmit={submit}>
            <h2 className="ns-modal-form-title">{t('renewal.sign.title')}</h2>
            <p className="ns-modal-form-subtitle">
                {contract.add_business?.property_name} {DOT} {t('signModal.offeredBy', { name: contract.renewal_owner_signed_name })}
            </p>
            <div className="ns-offer-summary ns-offer-summary-4">
                <div>
                    <small>{t('renewal.sign.extendedBy')}</small>
                    <strong>{t('common.month', { count: contract.renewal_months })}</strong>
                </div>
                <div>
                    <small>{t('reasonModal.newEndDate')}</small>
                    <strong>{formatDueDate(newEnd)}</strong>
                </div>
                <div>
                    <small>{t('renewal.sign.rentFrom', { date: formatDueDate(contract.end_date) })}</small>
                    <strong>
                        {money(contract.renewal_rent)}
                        {t('common.perMonth')}
                    </strong>
                </div>
                <div>
                    <small>{t('renewal.sign.change')}</small>
                    <strong>{change === 0 ? t('renewal.sameRent') : `${change > 0 ? '+' : MINUS}${money(Math.abs(change))}${t('common.perMonth')}`}</strong>
                </div>
            </div>
            {contract.renewal_note && (
                <p className="ns-notice-note" style={{ whiteSpace: 'pre-wrap' }}>
                    <strong>{t('renewal.sign.ownerNote')}</strong> {contract.renewal_note}
                </p>
            )}
            <div className="ns-signature-box">
                <label className="ns-label" htmlFor="renewSignName">{t('signModal.signWithName')}</label>
                <input
                    id="renewSignName"
                    className="form-control ns-signature-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    minLength={3}
                    required
                />
                <label className="ns-agree">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                    <span>
                        {t('renewal.sign.agree', { date: formatDueDate(newEnd), rent: money(contract.renewal_rent) })}
                    </span>
                </label>
            </div>
            <ErrorAlert error={error} />
            <button type="submit" className="ns-submit-btn" disabled={saving}>
                <i className="bi bi-pen"></i> {saving ? t('signModal.signing') : t('renewal.sign.sign')}
            </button>
        </ModalShell>
    )
}
