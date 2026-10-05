import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { money } from '../../lib/money'
import { propertyTypeLabel, serviceLabel } from '../../lib/displayValues'
import { DASH, SQ_M } from '../../lib/symbols'
import { areaOf, locationOf, typeColors, typeIcon } from '../../lib/listings'
import { formatPpm, pricePerM2 } from '../../lib/market'

// Up to 3 spaces side by side: price, size, price per m², where, amenities.
// The best value in each numeric row is marked.
export default function CompareModal({ properties, services, onClose, onOpen, onRemove }) {
    const { t } = useTranslation()
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose()
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    const best = (values, pick) => {
        const valid = values.filter((v) => v != null)
        if (valid.length < 2) return null
        return pick(...valid)
    }
    const rents = properties.map((p) => (p.monthly_rent == null ? null : Number(p.monthly_rent)))
    const areas = properties.map(areaOf)
    const ppms = properties.map(pricePerM2)
    const amenityCounts = properties.map((p) => (p.service_ids || []).length)
    const cheapest = best(rents, Math.min)
    const largest = best(areas, Math.max)
    const bestPpm = best(ppms, Math.min)
    const mostAmenities = best(amenityCounts, Math.max)

    const cell = (key, isBest, text) => (
        <td key={key} className={isBest ? 'is-best' : ''}>
            {text ?? DASH}
            {isBest && <span className="ns-cmp-best">{t('compare.best')}</span>}
        </td>
    )

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-cmp-modal" role="dialog" aria-modal="true" aria-label={t('compare.title')} onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{t('compare.title')}</h2>
                    <div className="ns-cmp-scroll">
                        <table className="ns-cmp-table">
                            <thead>
                                <tr>
                                    <th />
                                    {properties.map((p) => {
                                        const [bg, fg] = typeColors(p.property_type)
                                        return (
                                            <th key={p.property_id}>
                                                <div className="ns-cmp-head">
                                                    {p.photo_url ? (
                                                        <img src={p.photo_url} alt="" />
                                                    ) : (
                                                        <span style={{ background: bg, color: fg }}>
                                                            <i className={`bi ${typeIcon(p.property_type)}`}></i>
                                                        </span>
                                                    )}
                                                    <strong>{p.property_name}</strong>
                                                    <div className="ns-cmp-head-actions">
                                                        <button type="button" className="ns-link-btn" onClick={() => onOpen(p)}>
                                                            {t('compare.view')}
                                                        </button>
                                                        <button type="button" className="ns-link-btn is-muted" onClick={() => onRemove(p)}>
                                                            {t('common.remove')}
                                                        </button>
                                                    </div>
                                                </div>
                                            </th>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <th>{t('compare.monthlyRent')}</th>
                                    {properties.map((p, i) =>
                                        cell(p.property_id, cheapest != null && rents[i] === cheapest, rents[i] == null ? t('compare.onRequest') : money(rents[i]))
                                    )}
                                </tr>
                                <tr>
                                    <th>{t('compare.size')}</th>
                                    {properties.map((p, i) => cell(p.property_id, largest != null && areas[i] === largest, areas[i] ? `${areas[i]} ${SQ_M}` : DASH))}
                                </tr>
                                <tr>
                                    <th>{t('compare.pricePerM2', { unit: SQ_M })}</th>
                                    {properties.map((p, i) => cell(p.property_id, bestPpm != null && ppms[i] === bestPpm, ppms[i] ? formatPpm(ppms[i]) : DASH))}
                                </tr>
                                <tr>
                                    <th>{t('compare.type')}</th>
                                    {properties.map((p) => (
                                        <td key={p.property_id}>{propertyTypeLabel(p.property_type)}</td>
                                    ))}
                                </tr>
                                <tr>
                                    <th>{t('compare.location')}</th>
                                    {properties.map((p) => (
                                        <td key={p.property_id}>{locationOf(p) || DASH}</td>
                                    ))}
                                </tr>
                                <tr>
                                    <th>{t('compare.amenities')}</th>
                                    {properties.map((p, i) =>
                                        cell(p.property_id, mostAmenities != null && mostAmenities > 0 && amenityCounts[i] === mostAmenities, t('compare.amenityCount', { count: amenityCounts[i], total: services.length }))
                                    )}
                                </tr>
                                {services.map((s) => (
                                    <tr key={s.service_id} className="ns-cmp-amenity">
                                        <th>{serviceLabel(s.service_name)}</th>
                                        {properties.map((p) => (
                                            <td key={p.property_id}>
                                                {(p.service_ids || []).includes(s.service_id) ? (
                                                    <i className="bi bi-check-circle-fill is-yes" aria-label={t('common.yes')}></i>
                                                ) : (
                                                    <i className="bi bi-dash is-no" aria-label={t('common.no')}></i>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
