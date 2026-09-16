const ISSUE_LABELS = {
    no_photos: 'No photos',
    short_description: 'Description too short',
    no_services: 'No services listed',
    no_municipality: 'Missing location',
    no_rent: 'No rent set',
}

export default function AuditTable({ audit, onRewrite, disabled }) {
    const incomplete = (audit || []).filter((row) => row.issues.length > 0)
    if (incomplete.length === 0) return null

    return (
        <div className="advisor-compare">
            <table>
                <thead>
                    <tr>
                        <th>Property</th>
                        <th>Issues</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {incomplete.map((row) => (
                        <tr key={row.property_id}>
                            <td>{row.property_name}</td>
                            <td>{row.issues.map((code) => ISSUE_LABELS[code] || code).join(', ')}</td>
                            <td>
                                <button
                                    type="button"
                                    className="advisor-audit-rewrite"
                                    onClick={() => onRewrite(row)}
                                    disabled={disabled}
                                >
                                    Rewrite
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
