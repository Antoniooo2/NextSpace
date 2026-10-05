import { useTranslation } from 'react-i18next'
import { propertyTypeLabel, serviceLabel } from '../../../lib/displayValues'

export default function PropertyResultCard({ property, isHighlighted, onView }) {
    const { t } = useTranslation()
    return (
        <article
            className={'advisor-prop-card' + (isHighlighted ? ' advisor-prop-card-pick' : '')}
            onClick={onView}
            role={onView ? 'button' : undefined}
            tabIndex={onView ? 0 : undefined}
            onKeyDown={(e) => {
                if (onView && (e.key === 'Enter' || e.key === ' ')) onView()
            }}
        >
            <div className="advisor-prop-media">
                {property.photo_url ? (
                    <img src={property.photo_url} alt={property.property_name} />
                ) : (
                    <i className="bi bi-shop"></i>
                )}
                {isHighlighted && <span className="advisor-prop-tag">{t('advisor.card.bestFit')}</span>}
            </div>
            <div className="advisor-prop-body">
                <h4>{property.property_name}</h4>
                <p className="advisor-prop-meta">
                    {property.municipality || property.department || t('propertyCard.noLocation')}
                    {property.property_type ? ' - ' + propertyTypeLabel(property.property_type) : ''}
                </p>
                <p className="advisor-prop-price">
                    {property.monthly_rent != null ? `$${property.monthly_rent}` : t('advisor.card.noRent')}
                    <small>{t('payments.perMo')}</small>
                </p>
                {property.services?.length > 0 && (
                    <p className="advisor-prop-services">{property.services.map(serviceLabel).join(', ')}</p>
                )}
            </div>
        </article>
    )
}
