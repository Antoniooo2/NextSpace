export default function PropertyDetailPage({ property, onBack }) {
    if (!property) return null

    const ownerInitials = (property.ownerName || 'NextSpace')
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()

    return (
        <div className="ns-detail-page">
            <button type="button" className="ns-detail-back" onClick={onBack}>
                <i className="bi bi-arrow-left"></i> Back to listings
            </button>

            <div className="ns-detail-hero">
                {property.image ? (
                    <img src={property.image} alt={property.title} />
                ) : (
                    <div className="ns-detail-hero-placeholder">
                        <i className="bi bi-image"></i>
                    </div>
                )}
            </div>

            <div className="ns-detail-grid">
                <div className="ns-detail-main">
                    <h1>{property.title}</h1>
                    <p className="ns-detail-location">
                        <i className="bi bi-geo-alt"></i> {property.city}
                    </p>

                    <div className="ns-detail-tags">
                        <span>
                            <i className="bi bi-arrows-angle-expand"></i> {property.area} m²
                        </span>
                        <span>
                            <i className={`bi ${property.feature.icon}`}></i> {property.feature.label}
                        </span>
                    </div>

                    <p className="ns-detail-desc">
                        A commercial space ready for your business in {property.city}. Reach out through
                        NextSpace to schedule a visit, request the digital contract, or ask the owner any
                        questions before booking.
                    </p>
                </div>

                <aside className="ns-detail-side">
                    <div className="ns-detail-price">
                        ${property.price.toLocaleString()} <small>/mo</small>
                    </div>

                    {property.ownerName && (
                        <div className="ns-detail-owner">
                            <span className="ns-detail-owner-avatar">{ownerInitials}</span>
                            <div>
                                <div className="ns-detail-owner-name">{property.ownerName}</div>
                                <div className="ns-detail-owner-label">Listing owner</div>
                            </div>
                        </div>
                    )}

                    <button type="button" className="ns-submit-btn">
                        Request a visit
                    </button>
                </aside>
            </div>
        </div>
    )
}