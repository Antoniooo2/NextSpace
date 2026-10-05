import AdvisorBarChart from './AdvisorBarChart'

function shortLabel(name) {
    if (!name) return 'Listing'
    const firstWord = name.trim().split(/\s+/)[0]
    return firstWord.length > 12 ? firstWord.slice(0, 12) + '...' : firstWord
}

export default function BusinessChart({ chart, results, budgetMax }) {
    if (chart !== 'budget_fit') return null
    if (!results || results.length === 0) return null

    const rentBars = results
        .filter((property) => property.monthly_rent != null)
        .map((property) => ({
            label: shortLabel(property.property_name),
            value: property.monthly_rent,
            prefix: '$',
        }))

    if (rentBars.length === 0) return null

    const bars =
        budgetMax != null ? [...rentBars, { label: 'Budget', value: budgetMax, prefix: '$', emphasis: true }] : rentBars

    return <AdvisorBarChart title="Rent against your budget" bars={bars} />
}
