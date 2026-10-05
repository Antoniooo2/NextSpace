import { useTranslation } from 'react-i18next'
import { SERVICE_ICON, areaOf, isNewListing, locationOf, typeColors, typeIcon } from '../../lib/listings'
import { formatPpm } from '../../lib/market'
import { money } from '../../lib/money'
import { propertyTypeLabel, serviceLabel } from '../../lib/displayValues'
import { DOT, SQ_M } from '../../lib/symbols'

const REQUEST_BADGE = {
    Pending: { label: 'propertyCard.badge.requested', icon: 'bi-inbox', tone: 'info' },
    Offered: { label: 'propertyCard.badge.offerWaiting', icon: 'bi-pen', tone: 'warning' },
    Active: { label: 'propertyCard.badge.yourLease', icon: 'bi-key', tone: 'success' },
}

// A space in the Marketplace: photo, price (and how it compares), where it is,
// how big, and the amenities at a glance. The heart saves it (same list as
// Profile › Saved); "Compare" adds it to the side-by-side view.
export default function PropertyCard({
    property,
    onOpen,
    saved = false,
    onToggleSave,
    insight,
    requestStatus,
    onOpenRequest,
    comparing = false,
    onToggleCompare,
    compareFull = false,
}) {
    const { t } = useTranslation()
    const icon = typeIcon(property.property_type)
    const [bg, fg] = typeColors(property.property_type)
    const rent = property.monthly_rent
    const area = areaOf(property)
    const location = locationOf(property)
    const services = property.service_names || []
    const badge = requestStatus ? REQUEST_BADGE[requestStatus] : null

    return (
        <article className={`ns-mk-card ${comparing ? 'is-comparing' : ''}`}>
            <button type="button" className="ns-mk-card-media" onClick={() => onOpen?.(property)} aria-label={t('propertyCard.open', { name: property.property_name })}>
                {property.photo_url ? (
                    <img src={property.photo_url} alt="" loading="lazy" />
                ) : (
                    <span className="ns-mk-card-placeholder" style={{ background: bg, color: fg }}>
                        <i className={`bi ${icon}`}></i>
                        <small>{propertyTypeLabel(property.property_type)}</small>
                    </span>
                )}
                {isNewListing(property) && <span className="ns-mk-badge-new">{t('propertyCard.new')}</span>}
                {property.photos?.length > 1 && (
                    <span className="ns-mk-photo-count">
                        <i className="bi bi-images"></i> {property.photos.length}
                    </span>
                )}
            </button>

            {onToggleSave && (
                <button
                    type="button"
                    className={`ns-mk-save ${saved ? 'is-saved' : ''}`}
                    onClick={() => onToggleSave(property)}
                    aria-pressed={saved}
                    aria-label={saved ? t('propertyCard.unsave') : t('propertyCard.saveThis')}
                    title={saved ? t('propertyCard.saved') : t('propertyCard.save')}
                >
                    <i className={`bi ${saved ? 'bi-heart-fill' : 'bi-heart'}`}></i>
                </button>
            )}

            {badge && (
                <button type="button" className={`ns-mk-mine tone-${badge.tone}`} onClick={() => onOpenRequest?.(property)}>
                    <i className={`bi ${badge.icon}`}></i> {t(badge.label)}
                </button>
            )}

            <button type="button" className="ns-mk-card-body" onClick={() => onOpen?.(property)}>
                <div className="ns-mk-card-price">
                    {rent != null ? (
                        <>
                            {money(rent)}
                            <small>{t('common.perMonth')}</small>
                        </>
                    ) : (
                        <span className="ns-mk-card-noprice">{t('propertyCard.priceOnRequest')}</span>
                    )}
                </div>
                <div className="ns-mk-card-tagrow">
                    {insight ? (
                        <span className={`ns-price-tag tone-${insight.tone}`} title={t('propertyCard.ppmVs', { ppm: formatPpm(insight.ppm), median: formatPpm(insight.median), scope: insight.scope })}>
                            {insight.label} {DOT} {formatPpm(insight.ppm)}
                        </span>
                    ) : (
                        <span className="ns-mk-card-ppm">{area && rent != null ? formatPpm(Number(rent) / area) : '\u00a0'}</span>
                    )}
                </div>
                <h3>{property.property_name}</h3>
                <p className="ns-mk-card-loc" title={location || undefined}>
                    <i className="bi bi-geo-alt"></i> {location || t('propertyCard.noLocation')}
                </p>
                <div className="ns-mk-card-facts">
                    <span>
                        <i className={`bi ${icon}`}></i> {propertyTypeLabel(property.property_type)}
                    </span>
                    {area && (
                        <span>
                            <i className="bi bi-bounding-box"></i> {area} {SQ_M}
                        </span>
                    )}
                </div>
                <div className="ns-mk-card-services" aria-label={t('propertyCard.amenities')}>
                    {services.length > 0 ? (
                        <>
                            {services.slice(0, 4).map((name) => (
                                <span key={name} title={serviceLabel(name)}>
                                    <i className={`bi ${SERVICE_ICON[name] || 'bi-check2'}`}></i>
                                </span>
                            ))}
                            {services.length > 4 && <small>+{services.length - 4}</small>}
                        </>
                    ) : (
                        <em>{t('propertyCard.noAmenities')}</em>
                    )}
                </div>
            </button>

            {onToggleCompare && (
                <label className={`ns-mk-compare ${comparing ? 'is-on' : ''} ${compareFull && !comparing ? 'is-disabled' : ''}`}>
                    <input
                        type="checkbox"
                        checked={comparing}
                        disabled={compareFull && !comparing}
                        onChange={() => onToggleCompare(property)}
                    />
                    <span>{comparing ? t('propertyCard.comparing') : compareFull ? t('propertyCard.compareMax') : t('propertyCard.compare')}</span>
                </label>
            )}
        </article>
    )
}
