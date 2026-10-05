import { useTranslation } from 'react-i18next'
import i18n from '../../../i18n'
import AdvisorBarChart from './AdvisorBarChart'

function shortLabel(name) {
    if (!name) return i18n.t('advisor.chart.listing')
    const firstWord = name.trim().split(/\s+/)[0]
    return firstWord.length > 12 ? firstWord.slice(0, 12) + '...' : firstWord
}

export default function BusinessChart({ chart, results, budgetMax }) {
    const { t } = useTranslation()
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
        budgetMax != null ? [...rentBars, { label: t('advisor.chart.budget'), value: budgetMax, prefix: '$', emphasis: true }] : rentBars

    return <AdvisorBarChart title={t('advisor.chart.rentVsBudget')} bars={bars} />
}
