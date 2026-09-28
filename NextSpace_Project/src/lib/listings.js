// Small helpers shared by the Marketplace, My Properties and the detail page.
import { TYPE_ICON } from './propertyTypes'

export const SERVICE_ICON = {
    Parking: 'bi-p-square',
    'Air Conditioning': 'bi-snow',
    'Fiber Optic Internet': 'bi-wifi',
    '24/7 Security': 'bi-shield-check',
    Elevator: 'bi-arrow-down-up',
    'Electrical Panel': 'bi-lightning-charge',
    Others: 'bi-plus-circle',
}

// Placeholder look for spaces without photos, one colour per type.
export const TYPE_COLOR = {
    'Café/Restaurant': ['#fff1e6', '#c2410c'],
    'Store/Boutique': ['#eef3fd', '#2f5fe0'],
    'Beauty Salon': ['#fdf0f7', '#be185d'],
    'Pharmacy/Healthcare': ['#e9f8f0', '#15803d'],
    Other: ['#f1f2f6', '#475569'],
}

export function typeColors(type) {
    return TYPE_COLOR[type] || TYPE_COLOR.Other
}

export function typeIcon(type) {
    return TYPE_ICON[type] || 'bi-building'
}

export function areaOf(property) {
    const w = Number(property.business_size_width)
    const l = Number(property.business_size_length)
    return w > 0 && l > 0 ? Math.round(w * l) : null
}

export function locationOf(property) {
    return [property.municipality, property.department].filter(Boolean).join(', ')
}

const DAY = 86400000

export function isNewListing(property, days = 7) {
    if (!property.registration_date) return false
    return Date.now() - new Date(property.registration_date).getTime() < days * DAY
}

export function daysSince(ts) {
    if (!ts) return null
    return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / DAY))
}

// What a listing is missing. Incomplete listings get fewer requests, so the
// owner sees what to add.
export function listingChecklist(property) {
    return [
        { id: 'photo', label: 'Photos', done: (property.photos?.length || (property.photo_url ? 1 : 0)) > 0 },
        { id: 'more-photos', label: '3+ photos', done: (property.photos?.length || 0) >= 3 },
        { id: 'rent', label: 'Monthly rent', done: property.monthly_rent != null },
        { id: 'description', label: 'Description', done: (property.description || '').trim().length >= 40 },
        { id: 'location', label: 'Location', done: Boolean(property.municipality && property.department) },
        { id: 'services', label: 'Amenities', done: (property.service_ids?.length || 0) > 0 },
    ]
}

export function listingScore(property) {
    const items = listingChecklist(property)
    return Math.round((items.filter((i) => i.done).length / items.length) * 100)
}
