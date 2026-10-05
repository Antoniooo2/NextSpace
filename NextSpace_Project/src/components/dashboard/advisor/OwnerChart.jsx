import { useTranslation } from 'react-i18next'
import { currentLocale } from '../../../i18n'
import { availabilityLabel, paymentStatusLabel } from '../../../lib/displayValues'
import AdvisorBarChart from './AdvisorBarChart'
import CollectionsChart from '../CollectionsChart'

function monthLabels(monthKey) {
    const [y, m] = monthKey.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, 1))
    return {
        label: date.toLocaleDateString(currentLocale(), { month: 'short', timeZone: 'UTC' }),
        fullLabel: date.toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    }
}

const CHART_TITLES = {
    occupancy: 'advisor.charts.occupancy',
    payment_status: 'advisor.charts.paymentStatus',
    income_by_month: 'advisor.charts.incomeByMonth',
    expected_vs_collected: 'ownerPayments.chart.title',
    budget_fit: 'advisor.charts.rentComparison',
}

export default function OwnerChart({ chart, stats, simulation }) {
    const { t } = useTranslation()
    if (!chart) return null

    if (chart === 'occupancy' && stats?.by_availability) {
        const bars = Object.entries(stats.by_availability).map(([label, value]) => ({ label: availabilityLabel(label), value }))
        if (bars.length === 0) return null
        return <AdvisorBarChart title={t(CHART_TITLES.occupancy)} bars={bars} />
    }

    if (chart === 'payment_status' && stats?.by_payment_status) {
        const bars = Object.entries(stats.by_payment_status).map(([label, value]) => ({ label: paymentStatusLabel(label), value }))
        if (bars.length === 0) return null
        return <AdvisorBarChart title={t(CHART_TITLES.payment_status)} bars={bars} />
    }

    if (chart === 'income_by_month' && stats?.income_by_month?.length > 0) {
        const bars = stats.income_by_month.map((m) => ({ label: m.month, value: m.amount, prefix: '$' }))
        return <AdvisorBarChart title={t(CHART_TITLES.income_by_month)} bars={bars} />
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
                <p className="advisor-collect-title">{t(CHART_TITLES.expected_vs_collected)}</p>
                <CollectionsChart months={months} />
            </div>
        )
    }

    if (chart === 'budget_fit' && simulation) {
        return (
            <AdvisorBarChart
                title={t(CHART_TITLES.budget_fit)}
                bars={[
                    { label: t('advisor.charts.current'), value: simulation.current_rent, prefix: '$' },
                    { label: t('advisor.charts.proposed'), value: simulation.new_rent, prefix: '$', emphasis: true },
                ]}
            />
        )
    }

    return null
}
