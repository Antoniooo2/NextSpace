// Saved Marketplace searches: the business gets a notification when a new or
// re-listed space matches (notify_saved_searches on the server).
import { supabase } from './supabaseClient'
import i18n from '../i18n'
import { propertyTypeLabel } from './displayValues'
import { DOT, EN_DASH, INFINITY, QUOTE_CLOSE, QUOTE_OPEN, SQ_M } from './symbols'

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
export function describeSearch(filters, serviceNames = {}, { stored = false } = {}) {
    const t = stored ? i18n.getFixedT('en') : i18n.t.bind(i18n)
    const parts = []
    const category = filters.category ? (stored ? filters.category : propertyTypeLabel(filters.category)) : t('savedSearch.anySpace')
    const place = filters.municipality || filters.department
    parts.push(place ? t('savedSearch.inPlace', { what: category, place }) : category)
    if (filters.query) parts.push(`${QUOTE_OPEN}${filters.query}${QUOTE_CLOSE}`)
    if (filters.minPrice || filters.maxPrice) {
        parts.push(
            filters.minPrice && filters.maxPrice
                ? `$${filters.minPrice}${EN_DASH}$${filters.maxPrice}`
                : filters.maxPrice
                  ? t('savedSearch.upTo', { amount: `$${filters.maxPrice}` })
                  : t('savedSearch.from', { amount: `$${filters.minPrice}` })
        )
    }
    if (filters.minArea || filters.maxArea) parts.push(`${filters.minArea || 0}${EN_DASH}${filters.maxArea || INFINITY} ${SQ_M}`)
    for (const id of filters.services || []) if (serviceNames[id]) parts.push(serviceNames[id])
    return parts.join(` ${DOT} `).slice(0, 120)
}
