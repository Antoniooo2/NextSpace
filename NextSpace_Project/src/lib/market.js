// Price context for listings: rent per m² against the median of similar
// spaces (same type, same department; the type-wide median when a department
// has fewer than 3). Medians come from market_price_stats(), aggregates only.
import { supabase } from './supabaseClient'
import { areaOf } from './listings'

export async function loadMarketStats() {
    const { data, error } = await supabase.rpc('market_price_stats')
    if (error) return new Map()
    return new Map((data || []).map((r) => [`${r.property_type}|${r.department}`, { median: Number(r.median_ppm), spaces: r.spaces }]))
}

export function pricePerM2(property) {
    const area = areaOf(property)
    if (!area || property.monthly_rent == null) return null
    return Number(property.monthly_rent) / area
}

export function formatPpm(value) {
    return `$${value < 10 ? value.toFixed(2) : Math.round(value)}/m²`
}

// { ppm, median, pct, label, tone, scope } or null when there's nothing fair
// to compare against.
export function priceInsight(property, stats) {
    const ppm = pricePerM2(property)
    if (ppm == null || !stats?.size) return null
    const local = stats.get(`${property.property_type}|${property.department}`)
    const ref = local || stats.get(`${property.property_type}|*`)
    if (!ref || !ref.median) return null
    const pct = Math.round(((ppm - ref.median) / ref.median) * 100)
    const scope = local ? `similar in ${property.department}` : `similar ${property.property_type} spaces`
    if (pct <= -10) return { ppm, median: ref.median, pct, tone: 'good', label: `${Math.abs(pct)}% below similar`, scope }
    if (pct >= 10) return { ppm, median: ref.median, pct, tone: 'high', label: `${pct}% above similar`, scope }
    return { ppm, median: ref.median, pct, tone: 'fair', label: 'Fair price', scope }
}
