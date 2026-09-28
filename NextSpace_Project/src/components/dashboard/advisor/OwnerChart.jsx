import AdvisorBarChart from './AdvisorBarChart'
import CollectionsChart from '../CollectionsChart'

function monthLabels(monthKey) {
    const [y, m] = monthKey.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, 1))
    return {
        label: date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
        fullLabel: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    }
}

const CHART_TITLES = {
    occupancy: 'Portfolio occupancy',
    payment_status: 'Payment status',
    income_by_month: 'Income by month',
    expected_vs_collected: 'Rent expected vs collected',
    budget_fit: 'Rent comparison',
}

export default function OwnerChart({ chart, stats, simulation }) {
    if (!chart) return null

    if (chart === 'occupancy' && stats?.by_availability) {
        const bars = Object.entries(stats.by_availability).map(([label, value]) => ({ label, value }))
        if (bars.length === 0) return null
        return <AdvisorBarChart title={CHART_TITLES.occupancy} bars={bars} />
    }

    if (chart === 'payment_status' && stats?.by_payment_status) {
        const bars = Object.entries(stats.by_payment_status).map(([label, value]) => ({ label, value }))
        if (bars.length === 0) return null
        return <AdvisorBarChart title={CHART_TITLES.payment_status} bars={bars} />
    }

    if (chart === 'income_by_month' && stats?.income_by_month?.length > 0) {
        const bars = stats.income_by_month.map((m) => ({ label: m.month, value: m.amount, prefix: '$' }))
        return <AdvisorBarChart title={CHART_TITLES.income_by_month} bars={bars} />
    }

    if (chart === 'expected_vs_collected' && stats?.collections_last_6_months?.length > 0) {
        const months = stats.collections_last_6_months.map((m) => ({
            key: m.month,
            ...monthLabels(m.month),
            expected: m.expected,
            collected: m.collected,
        }))
        return (
            <div className="advisor-collect-chart">
                <p className="advisor-collect-title">{CHART_TITLES.expected_vs_collected}</p>
                <CollectionsChart months={months} />
            </div>
        )
    }

    if (chart === 'budget_fit' && simulation) {
        return (
            <AdvisorBarChart
                title={CHART_TITLES.budget_fit}
                bars={[
                    { label: 'Current', value: simulation.current_rent, prefix: '$' },
                    { label: 'Proposed', value: simulation.new_rent, prefix: '$', emphasis: true },
                ]}
            />
        )
    }

    return null
}
