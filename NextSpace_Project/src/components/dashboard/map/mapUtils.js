import L from 'leaflet'
import { money } from '../../../lib/money'

// El Salvador, with a little margin so edge pins are reachable.
export const ES_CENTER = [13.7942, -88.8965]
export const ES_BOUNDS = [
    [12.9, -90.5],
    [14.8, -87.3],
]
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export function hasPin(property) {
    return Number.isFinite(Number(property.latitude)) && Number.isFinite(Number(property.longitude)) && property.latitude != null && property.longitude != null
}

// Leaflet's default marker images don't resolve under Vite, so every marker is a divIcon.
export function pinIcon() {
    return L.divIcon({
        className: 'ns-map-pin-wrap',
        html: '<span class="ns-map-pin"><i class="bi bi-geo-alt-fill"></i></span>',
        iconSize: [36, 44],
        iconAnchor: [18, 42],
    })
}

export function priceIcon(property, selected) {
    const label = property.monthly_rent != null ? money(property.monthly_rent) : '—'
    return L.divIcon({
        className: 'ns-map-price-wrap',
        html: `<span class="ns-map-price ${selected ? 'is-selected' : ''}">${label}</span>`,
        iconSize: null,
        iconAnchor: [0, 0],
    })
}
