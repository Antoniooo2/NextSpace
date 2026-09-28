// Saved Marketplace searches: the business gets a notification when a new or
// re-listed space matches (notify_saved_searches on the server).
import { supabase } from './supabaseClient'

export async function loadSavedSearches() {
    const { data } = await supabase.from('saved_searches').select('*').order('created_at', { ascending: false })
    return data || []
}

export async function createSavedSearch(label, filters) {
    const { data, error } = await supabase.from('saved_searches').insert({ label, filters }).select().single()
    if (error) throw new Error(error.message)
    return data
}

export async function deleteSavedSearch(searchId) {
    await supabase.from('saved_searches').delete().eq('search_id', searchId)
}

// "Cafés in Santa Tecla · up to $800 · Parking"
export function describeSearch(filters, serviceNames = {}) {
    const parts = []
    parts.push(filters.category ? filters.category : 'Any space')
    if (filters.municipality || filters.department) parts[0] += ` in ${filters.municipality || filters.department}`
    if (filters.query) parts.push(`“${filters.query}”`)
    if (filters.minPrice || filters.maxPrice) {
        parts.push(
            filters.minPrice && filters.maxPrice
                ? `$${filters.minPrice}–$${filters.maxPrice}`
                : filters.maxPrice
                  ? `up to $${filters.maxPrice}`
                  : `from $${filters.minPrice}`
        )
    }
    if (filters.minArea || filters.maxArea) parts.push(`${filters.minArea || 0}–${filters.maxArea || '∞'} m²`)
    for (const id of filters.services || []) if (serviceNames[id]) parts.push(serviceNames[id])
    return parts.join(' · ').slice(0, 120)
}
