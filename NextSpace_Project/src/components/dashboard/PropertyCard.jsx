import { SERVICE_ICON, areaOf, isNewListing, locationOf, typeColors, typeIcon } from '../../lib/listings'
import { formatPpm } from '../../lib/market'

const REQUEST_BADGE = {
    Pending: { label: 'Requested', icon: 'bi-inbox', tone: 'info' },
    Offered: { label: 'Offer waiting', icon: 'bi-pen', tone: 'warning' },
    Active: { label: 'Your lease', icon: 'bi-key', tone: 'success' },
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
    const icon = typeIcon(property.property_type)
    const [bg, fg] = typeColors(property.property_type)
    const rent = property.monthly_rent
    const area = areaOf(property)
    const location = locationOf(property)
    const services = property.service_names || []
    const badge = requestStatus ? REQUEST_BADGE[requestStatus] : null

    return (
        <article className={`ns-mk-card ${comparing ? 'is-comparing' : ''}`}>
            <button type="button" className="ns-mk-card-media" onClick={() => onOpen?.(property)} aria-label={`Open ${property.property_name}`}>
                {property.photo_url ? (
                    <img src={property.photo_url} alt="" loading="lazy" />
                ) : (
                    <span className="ns-mk-card-placeholder" style={{ background: bg, color: fg }}>
                        <i className={`bi ${icon}`}></i>
                        <small>{property.property_type}</small>
                    </span>
                )}
                {isNewListing(property) && <span className="ns-mk-badge-new">New</span>}
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
                    aria-label={saved ? 'Remove from saved' : 'Save this space'}
                    title={saved ? 'Saved' : 'Save'}
                >
                    <i className={`bi ${saved ? 'bi-heart-fill' : 'bi-heart'}`}></i>
                </button>
            )}

            {badge && (
                <button type="button" className={`ns-mk-mine tone-${badge.tone}`} onClick={() => onOpenRequest?.(property)}>
                    <i className={`bi ${badge.icon}`}></i> {badge.label}
                </button>
            )}

            <button type="button" className="ns-mk-card-body" onClick={() => onOpen?.(property)}>
                <div className="ns-mk-card-price">
                    {rent != null ? (
                        <>
                            ${Number(rent).toLocaleString()}
                            <small>/month</small>
                        </>
                    ) : (
                        <span className="ns-mk-card-noprice">Price on request</span>
                    )}
                </div>
                {insight && (
                    <span className={`ns-price-tag tone-${insight.tone}`} title={`${formatPpm(insight.ppm)} vs ${formatPpm(insight.median)} for ${insight.scope}`}>
                        {insight.label} · {formatPpm(insight.ppm)}
                    </span>
                )}
                <h3>{property.property_name}</h3>
                <p className="ns-mk-card-loc">
                    <i className="bi bi-geo-alt"></i> {location || 'Location not listed'}
                </p>
                <div className="ns-mk-card-facts">
                    <span>
                        <i className={`bi ${icon}`}></i> {property.property_type}
                    </span>
                    {area && (
                        <span>
                            <i className="bi bi-bounding-box"></i> {area} m²
                        </span>
                    )}
                </div>
                {services.length > 0 && (
                    <div className="ns-mk-card-services" aria-label="Amenities">
                        {services.slice(0, 4).map((name) => (
                            <span key={name} title={name}>
                                <i className={`bi ${SERVICE_ICON[name] || 'bi-check2'}`}></i>
                            </span>
                        ))}
                        {services.length > 4 && <small>+{services.length - 4}</small>}
                    </div>
                )}
            </button>

            {onToggleCompare && (
                <label className={`ns-mk-compare ${comparing ? 'is-on' : ''} ${compareFull && !comparing ? 'is-disabled' : ''}`}>
                    <input
                        type="checkbox"
                        checked={comparing}
                        disabled={compareFull && !comparing}
                        onChange={() => onToggleCompare(property)}
                    />
                    <span>{comparing ? 'Comparing' : compareFull ? 'Compare (3 max)' : 'Compare'}</span>
                </label>
            )}
        </article>
    )
}
