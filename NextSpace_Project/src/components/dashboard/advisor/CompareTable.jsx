export default function CompareTable({ results, highlight }) {
    if (!results || results.length < 2) return null

    return (
        <div className="advisor-compare">
            <table>
                <thead>
                    <tr>
                        <th>Property</th>
                        <th>Rent</th>
                        <th>Location</th>
                        <th>Services</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((property) => (
                        <tr
                            key={property.property_id}
                            className={highlight?.includes(property.property_id) ? 'advisor-compare-pick' : ''}
                        >
                            <td>{property.property_name}</td>
                            <td>{property.monthly_rent != null ? `$${property.monthly_rent}` : 'Not listed'}</td>
                            <td>{property.municipality || property.department || 'Not listed'}</td>
                            <td>{property.services?.length > 0 ? property.services.join(', ') : 'None listed'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
