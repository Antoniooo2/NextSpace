export default function PropertyResultCard({ property, isHighlighted }) {
    return (
        <article className={'advisor-prop-card' + (isHighlighted ? ' advisor-prop-card-pick' : '')}>
            <div className="advisor-prop-media">
                {property.photo_url ? (
                    <img src={property.photo_url} alt={property.property_name} />
                ) : (
                    <i className="bi bi-shop"></i>
                )}
                {isHighlighted && <span className="advisor-prop-tag">Best fit</span>}
            </div>
            <div className="advisor-prop-body">
                <h4>{property.property_name}</h4>
                <p className="advisor-prop-meta">
                    {property.municipality || property.department || 'Location not listed'}
                    {property.property_type ? ' · ' + property.property_type : ''}
                </p>
                <p className="advisor-prop-price">
                    {property.monthly_rent != null ? `$${property.monthly_rent}` : 'Rent not listed'}
                    <small>/mo</small>
                </p>
            </div>
        </article>
    )
}
