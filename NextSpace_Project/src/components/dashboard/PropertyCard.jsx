export const TYPE_ICON = {
    'Café/Restaurant': 'bi-cup-hot',
    'Store/Boutique': 'bi-shop',
    'Beauty Salon': 'bi-scissors',
    'Pharmacy/Healthcare': 'bi-capsule',
    Other: 'bi-building',
}

const AVAILABILITY_CLASS = {
    Available: 'available',
    Occupied: 'occupied',
    Reserved: 'reserved',
}

export default function PropertyCard({ property, actionLabel = 'View details', onAction, secondaryActions }) {
    const typeIcon = TYPE_ICON[property.property_type] || 'bi-building'
    const availabilityClass = AVAILABILITY_CLASS[property.availability] || 'available'
    const rent = property.monthly_rent

    return (
        <div className="ns-prop-card">
            <div className="ns-prop-media">
                <div className="ns-prop-media-placeholder">
                    <i className={`bi ${typeIcon}`}></i>
                </div>
                {property.availability && (
                    <span className={`ns-prop-availability ${availabilityClass}`}>{property.availability}</span>
                )}
                <span className="ns-prop-price">
                    {rent != null ? `$${Number(rent).toLocaleString()}` : 'Contact'}
                    {rent != null && <small>/mo</small>}
                </span>
            </div>

            <div className="ns-prop-body">
                <h3 className="ns-prop-title">{property.property_name}</h3>
                <p className="ns-prop-location">
                    <i className={`bi ${typeIcon}`}></i> {property.property_type}
                </p>

                <div className="ns-prop-meta">
                    <span>
                        <i className="bi bi-arrows-angle-expand"></i> {property.business_size_width} × {property.business_size_length} m
                    </span>
                    {property.phone_number && (
                        <span>
                            <i className="bi bi-telephone"></i> {property.phone_number}
                        </span>
                    )}
                </div>

                <div className="ns-prop-actions">
                    <button type="button" className="ns-prop-btn" onClick={() => onAction && onAction(property)}>
                        {actionLabel}
                    </button>
                    {secondaryActions?.map((action) => (
                        <button
                            key={action.label}
                            type="button"
                            className="ns-prop-btn ns-prop-btn-icon"
                            onClick={() => action.onClick(property)}
                            aria-label={action.label}
                            title={action.label}
                        >
                            <i className={`bi ${action.icon}`}></i>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
