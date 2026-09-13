export default function FilterPill({ filter, servicesCatalog, onEdit }) {
    const parts = []
    parts.push(filter.property_type?.length ? filter.property_type.join(', ') : 'Any type')
    if (filter.municipality) parts.push(filter.municipality)
    else if (filter.department) parts.push(filter.department)
    if (filter.budget_max != null) parts.push(`up to $${filter.budget_max}`)

    if (filter.required_services?.length > 0) {
        const names = (servicesCatalog || [])
            .filter((s) => filter.required_services.includes(s.service_id))
            .map((s) => s.service_name)
        if (names.length > 0) {
            parts.push(names.length + (names.length > 1 ? ' services' : ' service'))
        }
    }

    return (
        <div className="advisor-pill">
            <i className="bi bi-sliders"></i>
            <span className="advisor-pill-text">{parts.join(' - ')}</span>
            <button type="button" className="advisor-pill-edit" onClick={onEdit}>
                <i className="bi bi-pencil"></i> Edit
            </button>
        </div>
    )
}
