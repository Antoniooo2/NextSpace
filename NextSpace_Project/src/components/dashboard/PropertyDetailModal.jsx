export default function PropertyDetailModal({ property, onClose }) {
    if (!property) return null

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                {property.image ? (
                    <img src={property.image} alt={property.title} className="ns-modal-img" />
                ) : (
                    <div className="ns-modal-img ns-modal-img-placeholder">
                        <i className="bi bi-image"></i>
                    </div>
                )}

                <div className="ns-modal-body">
                    <div className="ns-modal-heading">
                        <h2>{property.title}</h2>
                        <span className="ns-modal-price">
                            ${property.price.toLocaleString()}<small>/mo</small>
                        </span>
                    </div>

                    <p className="ns-modal-location">
                        <i className="bi bi-geo-alt"></i> {property.city}
                    </p>

                    <div className="ns-modal-tags">
                        <span><i className="bi bi-arrows-angle-expand"></i> {property.area} m²</span>
                        <span><i className={`bi ${property.feature.icon}`}></i> {property.feature.label}</span>
                    </div>

                    {property.ownerName && (
                        <p className="ns-modal-owner">
                            <i className="bi bi-person-badge"></i> Listed by {property.ownerName}
                        </p>
                    )}

                    <p className="ns-modal-desc">
                        A commercial space ready for your business in {property.city}. Reach out through
                        NextSpace to schedule a visit, request the digital contract, or ask the owner any
                        questions before booking.
                    </p>

                    <button type="button" className="ns-submit-btn" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
