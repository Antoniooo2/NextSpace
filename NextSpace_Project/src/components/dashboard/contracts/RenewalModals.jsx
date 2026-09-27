import { useState } from 'react'
import { formatDueDate } from '../../../lib/rentSchedule'
import { addMonths, contractActions, money, personName, recordSummary } from '../../../lib/contracts'

const LENGTHS = [3, 6, 12, 18, 24, 36]

function LengthSelect({ id, value, onChange }) {
    return (
        <select id={id} className="form-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
            {[...new Set([...LENGTHS, Number(value)])]
                .sort((a, b) => a - b)
                .map((m) => (
                    <option key={m} value={m}>
                        {m} more months
                    </option>
                ))}
        </select>
    )
}

function ModalShell({ label, onClose, onSubmit, children }) {
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
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
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
    const property = contract.add_business?.property_name || 'the space'
    const [months, setMonths] = useState(contract.duration_months && contract.duration_months <= 36 ? contract.duration_months : 12)
    const [note, setNote] = useState(() =>
        stats && stats.monthsDue > 0 && stats.paidOnTime === stats.monthsDue
            ? `I've paid all ${stats.monthsDue} months on time and I'd like to keep leasing ${property}.`
            : `I'd like to keep leasing ${property}.`
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
        <ModalShell label="Ask to renew your lease" onClose={onClose} onSubmit={submit}>
            <h2 className="ns-modal-form-title">Ask to renew your lease</h2>
            <p className="ns-modal-form-subtitle">
                {property} ends on {formatDueDate(contract.end_date)}. The owner answers with a renewal offer for you to sign.
            </p>
            <div className="row g-3">
                <div className="col-sm-5">
                    <label className="ns-label" htmlFor="renewMonths">Stay for</label>
                    <LengthSelect id="renewMonths" value={months} onChange={setMonths} />
                </div>
                <div className="col-sm-7">
                    <label className="ns-label">New end date</label>
                    <p className="ns-renew-newend">{formatDueDate(addMonths(contract.end_date, months))}</p>
                </div>
            </div>
            <label className="ns-label mt-2" htmlFor="renewNote">
                Note to the owner <span className="ns-pay-muted">(optional)</span>
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
                                text: `My lease for "${property}" ends on ${contract.end_date} at ${money(contract.monthly_rent)}/month. Should I renew, for how long, and what should I ask the owner?`,
                            })
                        }
                    >
                        <i className="bi bi-stars"></i> Ask Rony for advice first
                    </button>
                </div>
            )}
            <ErrorAlert error={error} />
            <button type="submit" className="ns-submit-btn" disabled={saving}>
                <i className="bi bi-send"></i> {saving ? 'Sending...' : 'Send renewal request'}
            </button>
        </ModalShell>
    )
}

// Owner proposes the extension: extra months and the rent for them, signed
// with their typed name. Months already scheduled keep their current rent.
export function RenewalOfferModal({ contract, ownerName, record, onClose, onDone, onAskRony }) {
    const property = contract.add_business?.property_name || 'your space'
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
            setError('Confirm that you agree to the renewal terms to sign the offer.')
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
        <ModalShell label="Offer a renewal" onClose={onClose} onSubmit={submit}>
            <h2 className="ns-modal-form-title">{contract.renewal_offered_at ? 'Update renewal offer' : 'Offer a renewal'}</h2>
            <p className="ns-modal-form-subtitle">
                {tenant} · {property} · ends {formatDueDate(contract.end_date)}
                {contract.renewal_request_months ? ` · asked for ${contract.renewal_request_months} more months` : ''}
            </p>
            {contract.renewal_request_note && <p className="ns-notice-note">“{contract.renewal_request_note}”</p>}

            <div className="row g-3">
                <div className="col-sm-6">
                    <label className="ns-label" htmlFor="renewOfferMonths">Extend by</label>
                    <LengthSelect id="renewOfferMonths" value={months} onChange={setMonths} />
                </div>
                <div className="col-sm-6">
                    <label className="ns-label" htmlFor="renewOfferRent">Monthly rent for the new period (USD)</label>
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
                        Note <span className="ns-pay-muted">(optional)</span>
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
                                text: `Should I renew ${tenant}'s lease of "${property}" (now ${money(contract.monthly_rent)}/month, ending ${contract.end_date})? Their record on NextSpace: ${summary.short}${record ? `, ${record.months_on_time}/${record.months_due} months on time, ${record.months_late_now} late now` : ''}. What rent and length would you suggest?`,
                            })
                        }
                    >
                        <i className="bi bi-stars"></i> Ask Rony: renew, and at what rent?
                    </button>
                </div>
            )}

            <div className="ns-offer-summary">
                <div>
                    <small>New end date</small>
                    <strong>{formatDueDate(newEnd)}</strong>
                </div>
                <div>
                    <small>Rent change</small>
                    <strong>
                        {change === 0 ? 'Same rent' : `${change > 0 ? '+' : '−'}${money(Math.abs(change))}/month`}
                    </strong>
                </div>
                <div>
                    <small>Added to the lease</small>
                    <strong>{money(Number(rent || 0) * Number(months || 0))}</strong>
                </div>
            </div>

            <div className="ns-signature-box">
                <label className="ns-label" htmlFor="renewOfferSign">Sign with your full name</label>
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
                        I agree to extend this lease on these terms; every other clause stays the same. The offer is valid for 7 days.
                    </span>
                </label>
            </div>
            <ErrorAlert error={error} />
            <button type="submit" className="ns-submit-btn" disabled={saving}>
                <i className="bi bi-pen"></i> {saving ? 'Sending...' : 'Sign and send renewal'}
            </button>
        </ModalShell>
    )
}

// Tenant signs the owner's renewal offer: the lease is extended right away.
export function RenewalSignModal({ contract, tenantName, onClose, onSigned }) {
    const [name, setName] = useState(tenantName || '')
    const [agree, setAgree] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const newEnd = addMonths(contract.end_date, Number(contract.renewal_months || 0))
    const change = Number(contract.renewal_rent || 0) - Number(contract.monthly_rent || 0)

    const submit = async (e) => {
        e.preventDefault()
        if (!agree) {
            setError('Confirm that you agree to the renewal.')
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
        <ModalShell label="Sign the renewal" onClose={onClose} onSubmit={submit}>
            <h2 className="ns-modal-form-title">Sign the renewal</h2>
            <p className="ns-modal-form-subtitle">
                {contract.add_business?.property_name} · offered and signed by {contract.renewal_owner_signed_name}
            </p>
            <div className="ns-offer-summary ns-offer-summary-4">
                <div>
                    <small>Extended by</small>
                    <strong>{contract.renewal_months} months</strong>
                </div>
                <div>
                    <small>New end date</small>
                    <strong>{formatDueDate(newEnd)}</strong>
                </div>
                <div>
                    <small>Rent from {formatDueDate(contract.end_date)}</small>
                    <strong>{money(contract.renewal_rent)}/month</strong>
                </div>
                <div>
                    <small>Change</small>
                    <strong>{change === 0 ? 'Same rent' : `${change > 0 ? '+' : '−'}${money(Math.abs(change))}/month`}</strong>
                </div>
            </div>
            {contract.renewal_note && (
                <p className="ns-notice-note" style={{ whiteSpace: 'pre-wrap' }}>
                    <strong>Owner’s note:</strong> {contract.renewal_note}
                </p>
            )}
            <div className="ns-signature-box">
                <label className="ns-label" htmlFor="renewSignName">Sign with your full name</label>
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
                        I agree to extend the lease to {formatDueDate(newEnd)} at {money(contract.renewal_rent)}/month. All other
                        clauses stay the same.
                    </span>
                </label>
            </div>
            <ErrorAlert error={error} />
            <button type="submit" className="ns-submit-btn" disabled={saving}>
                <i className="bi bi-pen"></i> {saving ? 'Signing...' : 'Sign renewal'}
            </button>
        </ModalShell>
    )
}
