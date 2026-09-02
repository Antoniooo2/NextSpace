export default function PropertyCard({ property, actionLabel = 'View details', onAction, secondaryAction }) {
    return (
        <div className="ns-prop-card">
            <div className="ns-prop-media">
                {property.image ? (
                    <img src={property.image} alt={property.title} />
                ) : (
                    <div className="ns-prop-media-placeholder">
                        <i className="bi bi-image"></i>
                    </div>
                )}
                <span className="ns-prop-price">
                    ${property.price.toLocaleString()}
                    <small>/mo</small>
                </span>
            </div>

            <div className="ns-prop-body">
                <h3 className="ns-prop-title">{property.title}</h3>
                <p className="ns-prop-location">
                    <i className="bi bi-geo-alt"></i> {property.city}
                </p>

                <div className="ns-prop-meta">
                    <span>
                        <i className="bi bi-arrows-angle-expand"></i> {property.area} m²
                    </span>
                    <span>
                        <i className={`bi ${property.feature.icon}`}></i> {property.feature.label}
                    </span>
                </div>

                <div className="ns-prop-actions">
                    <button type="button" className="ns-prop-btn" onClick={() => onAction && onAction(property)}>
                        {actionLabel}
                    </button>
                    {secondaryAction && (
                        <button
                            type="button"
                            className="ns-prop-btn ns-prop-btn-icon"
                            onClick={() => secondaryAction.onClick(property)}
                            aria-label={secondaryAction.label}
                            title={secondaryAction.label}
                        >
                            <i className={`bi ${secondaryAction.icon}`}></i>
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
