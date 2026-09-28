import { SERVICE_ICON, areaOf, isNewListing, locationOf, typeIcon } from '../../lib/listings'

// A space in the Marketplace: photo, price, where it is, how big, and the
// amenities at a glance. The heart saves it (same list as Profile › Saved).
export default function PropertyCard({ property, onOpen, saved = false, onToggleSave }) {
    const icon = typeIcon(property.property_type)
    const rent = property.monthly_rent
    const area = areaOf(property)
    const location = locationOf(property)
    const services = property.service_names || []

    return (
        <article className="ns-mk-card">
            <button type="button" className="ns-mk-card-media" onClick={() => onOpen?.(property)} aria-label={`Open ${property.property_name}`}>
                {property.photo_url ? (
                    <img src={property.photo_url} alt="" loading="lazy" />
                ) : (
                    <span className="ns-mk-card-placeholder">
                        <i className={`bi ${icon}`}></i>
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
        </article>
    )
}
