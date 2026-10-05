import { useTranslation } from 'react-i18next'
import { serviceLabel } from '../../../lib/displayValues'

export default function CompareTable({ results, highlight }) {
    const { t } = useTranslation()
    if (!results || results.length < 2) return null

    return (
        <div className="advisor-compare">
            <table>
                <thead>
                    <tr>
                        <th>{t('common.property')}</th>
                        <th>{t('propertyDetail.rent')}</th>
                        <th>{t('compare.location')}</th>
                        <th>{t('advisor.table.services')}</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((property) => (
                        <tr
                            key={property.property_id}
                            className={highlight?.includes(property.property_id) ? 'advisor-compare-pick' : ''}
                        >
                            <td>{property.property_name}</td>
                            <td>{property.monthly_rent != null ? `$${property.monthly_rent}` : t('advisor.table.notListed')}</td>
                            <td>{property.municipality || property.department || t('advisor.table.notListed')}</td>
                            <td>{property.services?.length > 0 ? property.services.map(serviceLabel).join(', ') : t('advisor.table.noneListed')}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
