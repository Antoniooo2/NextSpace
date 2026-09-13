const CHART_TITLES = {
    occupancy: 'Portfolio occupancy',
    payment_status: 'Payment status',
    income_by_month: 'Income by month',
    budget_fit: 'Rent comparison',
}

function BarChart({ title, bars }) {
    const max = Math.max(...bars.map((b) => b.value), 1)

    return (
        <div className="advisor-chart">
            <h5>{title}</h5>
            <div className="advisor-chart-bars">
                {bars.map((bar) => (
                    <div key={bar.label} className="advisor-chart-col">
                        <span className="advisor-chart-value">
                            {bar.prefix || ''}
                            {Math.round(bar.value)}
                        </span>
                        <div className="advisor-chart-bar" style={{ height: Math.max(8, (bar.value / max) * 90) + 'px' }} />
                        <span className="advisor-chart-label">{bar.label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default function OwnerChart({ chart, stats, simulation }) {
    if (!chart) return null

    if (chart === 'occupancy' && stats?.by_availability) {
        const bars = Object.entries(stats.by_availability).map(([label, value]) => ({ label, value }))
        if (bars.length === 0) return null
        return <BarChart title={CHART_TITLES.occupancy} bars={bars} />
    }

    if (chart === 'payment_status' && stats?.by_payment_status) {
        const bars = Object.entries(stats.by_payment_status).map(([label, value]) => ({ label, value }))
        if (bars.length === 0) return null
        return <BarChart title={CHART_TITLES.payment_status} bars={bars} />
    }

    if (chart === 'income_by_month' && stats?.income_by_month?.length > 0) {
        const bars = stats.income_by_month.map((m) => ({ label: m.month, value: m.amount, prefix: '$' }))
        return <BarChart title={CHART_TITLES.income_by_month} bars={bars} />
    }

    if (chart === 'budget_fit' && simulation) {
        return (
            <BarChart
                title={CHART_TITLES.budget_fit}
                bars={[
                    { label: 'Current', value: simulation.current_rent, prefix: '$' },
                    { label: 'Proposed', value: simulation.new_rent, prefix: '$' },
                ]}
            />
        )
    }

    return null
}
