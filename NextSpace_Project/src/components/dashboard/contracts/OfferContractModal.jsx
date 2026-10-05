import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_VALUES } from '../../../lib/brand'
import { propertyTypeLabel } from '../../../lib/displayValues'
import { ARROW_RIGHT, DASH } from '../../../lib/symbols'
import { formatDueDate, todayInElSalvador } from '../../../lib/rentSchedule'
import { addDays, addMonths, contractActions, dueDayLabel, money, personName } from '../../../lib/contracts'
import { contractRate, feeSplit, formatRate } from '../../../lib/platformFee'
import usePlatformFee from '../../../hooks/usePlatformFee'
import FeeBreakdown from '../payments/FeeBreakdown'

const DURATIONS = [3, 6, 12, 18, 24, 36]

// Owner answers a request with terms (or updates an open offer), or invites
// a business directly by email/DUI. Sending it is the owner's signature.
export default function OfferContractModal({ mode = 'offer', contract, properties = [], ownerName, onClose, onDone, onAskRony }) {
    const { t } = useTranslation()
    const today = todayInElSalvador()
    const isInvite = mode === 'invite'
    const [propertyId, setPropertyId] = useState(() => (isInvite ? properties[0]?.property_id ?? '' : contract.property_id))
    const property = isInvite
        ? properties.find((p) => p.property_id === Number(propertyId))
        : contract.add_business
    const [identifier, setIdentifier] = useState('')
    const [start, setStart] = useState(() =>
        contract?.status === 'Offered' && contract.start_date >= today ? contract.start_date : addDays(today, 7)
    )
    const [months, setMonths] = useState(() => contract?.duration_months || 12)
    const [rent, setRent] = useState(() => String(contract?.monthly_rent ?? property?.monthly_rent ?? ''))
    const [deposit, setDeposit] = useState(() => String(contract?.deposit ?? contract?.monthly_rent ?? property?.monthly_rent ?? '0'))
    const [clauses, setClauses] = useState(contract?.special_clauses || '')
    const [signature, setSignature] = useState(ownerName || '')
    const [agree, setAgree] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const end = start && months ? addMonths(start, Number(months)) : null
    const total = Number(rent || 0) * Number(months || 0)
    // An offer already sent keeps the rate it was sent with.
    const currentRate = usePlatformFee()
    const feeRate = contractRate(contract, currentRate)
    const monthlySplit = feeSplit(rent, feeRate)
    const tenant = contract ? personName(contract.users) : null

    const submit = async (e) => {
        e.preventDefault()
        setError('')
        if (isInvite && !identifier.trim()) {
            setError(t('offerModal.identifierRequired'))
            return
        }
        if (!agree) {
            setError(t('offerModal.agreeRequired'))
            return
        }
        setSaving(true)
        try {
            const payload = { start, months, rent, deposit, clauses, ownerName: signature }
            if (isInvite) {
                await contractActions.invite({ ...payload, propertyId: Number(propertyId), identifier: identifier.trim() })
            } else {
                await contractActions.offer({ ...payload, contractId: contract.contract_id })
            }
            onDone()
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
                aria-label={isInvite ? t('contractsBoard.invite') : t('contractDetail.actions.makeOffer')}
                onClick={(e) => e.stopPropagation()}
                onSubmit={submit}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">
                        {isInvite ? t('offerModal.titleInvite') : contract.status === 'Offered' ? t('offerModal.titleUpdate') : t('contractDetail.actions.makeOffer')}
                    </h2>
                    <p className="ns-modal-form-subtitle">
                        {isInvite
                            ? t('offerModal.subtitleInvite')
                            : t('offerModal.subtitleOffer', { person: tenant, name: property?.property_name || t('offerModal.yourSpace') })}
                    </p>

                    {isInvite && (
                        <div className="row g-3 mb-1">
                            <div className="col-sm-6">
                                <label className="ns-label" htmlFor="offerProperty">{t('docs.lease.space')}</label>
                                <select
                                    id="offerProperty"
                                    className="form-select"
                                    value={propertyId}
                                    onChange={(e) => {
                                        setPropertyId(e.target.value)
                                        const p = properties.find((x) => x.property_id === Number(e.target.value))
                                        if (p?.monthly_rent) {
                                            setRent(String(p.monthly_rent))
                                            setDeposit(String(p.monthly_rent))
                                        }
                                    }}
                                >
                                    {properties.map((p) => (
                                        <option key={p.property_id} value={p.property_id}>
                                            {p.property_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-sm-6">
                                <label className="ns-label" htmlFor="offerIdentifier">{t('offerModal.identifier')}</label>
                                <input
                                    id="offerIdentifier"
                                    className="form-control"
                                    placeholder={t('offerModal.identifierPlaceholder')}
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    )}

                    <div className="row g-3">
                        <div className="col-sm-4">
                            <label className="ns-label" htmlFor="offerStart">{t('offerModal.startDate')}</label>
                            <input
                                id="offerStart"
                                type="date"
                                className="form-control"
                                min={today}
                                value={start}
                                onChange={(e) => setStart(e.target.value)}
                                required
                            />
                        </div>
                        <div className="col-sm-4">
                            <label className="ns-label" htmlFor="offerMonths">{t('docs.lease.length')}</label>
                            <select id="offerMonths" className="form-select" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                                {[...new Set([...DURATIONS, Number(months)])].sort((a, b) => a - b).map((m) => (
                                    <option key={m} value={m}>
                                        {t('common.month', { count: m })}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-sm-4">
                            <label className="ns-label" htmlFor="offerRent">{t('marketplace.monthlyRentUsd')}</label>
                            <input
                                id="offerRent"
                                type="number"
                                min="1"
                                step="0.01"
                                className="form-control"
                                value={rent}
                                onChange={(e) => setRent(e.target.value)}
                                required
                            />
                        </div>
                        <div className="col-sm-4">
                            <label className="ns-label" htmlFor="offerDeposit">{t('offerModal.depositUsd')}</label>
                            <input
                                id="offerDeposit"
                                type="number"
                                min="0"
                                step="0.01"
                                className="form-control"
                                value={deposit}
                                onChange={(e) => setDeposit(e.target.value)}
                            />
                        </div>
                        <div className="col-sm-8">
                            <label className="ns-label" htmlFor="offerClauses">
                                {t('docs.lease.specialClauses')} <span className="ns-pay-muted">({t('listingForm.optional')})</span>
                            </label>
                            <textarea
                                id="offerClauses"
                                className="form-control"
                                rows={2}
                                maxLength={3000}
                                placeholder={t('offerModal.clausesPlaceholder')}
                                value={clauses}
                                onChange={(e) => setClauses(e.target.value)}
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
                                        text: t('offerModal.askRonyText', {
                                            ...BRAND_VALUES,
                                            type: property?.property_type ? propertyTypeLabel(property.property_type) : t('offerModal.commercialSpace'),
                                            name: property?.property_name || '',
                                            rent: money(rent),
                                        }),
                                    })
                                }
                            >
                                <i className="bi bi-stars"></i> {t('offerModal.askRony', BRAND_VALUES)}
                            </button>
                        </div>
                    )}

                    <div className="ns-offer-summary ns-offer-summary-4">
                        <div>
                            <small>{t('docs.reports.lease')}</small>
                            <strong>
                                {start ? formatDueDate(start) : DASH} {ARROW_RIGHT} {end ? formatDueDate(end) : DASH}
                            </strong>
                        </div>
                        <div>
                            <small>{t('docs.lease.rentDue')}</small>
                            <strong>{t('docs.lease.rentDueValue', { day: dueDayLabel(start) })}</strong>
                        </div>
                        <div>
                            <small>{t('offerModal.total')}</small>
                            <strong>{money(total)}</strong>
                        </div>
                        <div>
                            <small>{t('offerModal.youReceiveTotal')}</small>
                            <strong>{money(monthlySplit.net * Number(months || 0))}</strong>
                        </div>
                    </div>

                    {Number(rent) > 0 && (
                        <FeeBreakdown
                            amount={Number(rent)}
                            rate={feeRate}
                            grossLabel={t('offerModal.tenantPays')}
                            netLabel={t('offerModal.youReceive')}
                            note={t('offerModal.depositNoFee', { amount: Number(deposit) > 0 ? ` (${money(deposit)})` : '' })}
                        />
                    )}

                    <div className="ns-signature-box">
                        <label className="ns-label" htmlFor="offerSignature">{t('signModal.signWithName')}</label>
                        <input
                            id="offerSignature"
                            className="form-control ns-signature-input"
                            value={signature}
                            onChange={(e) => setSignature(e.target.value)}
                            required
                            minLength={3}
                        />
                        <label className="ns-agree">
                            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                            <span>
                                {t('offerModal.agree', { ...BRAND_VALUES, rate: formatRate(feeRate) })}
                            </span>
                        </label>
                    </div>

                    {error && (
                        <div className="alert alert-danger py-2" role="alert">
                            {error}
                        </div>
                    )}

                    <button type="submit" className="ns-submit-btn" disabled={saving}>
                        <i className="bi bi-pen"></i> {saving ? t('common.sending') : isInvite ? t('offerModal.sendInvite') : t('offerModal.sendOffer')}
                    </button>
                </div>
            </form>
        </div>
    )
}
