import { listingStatusLabel } from './displayValues'

export const PROPERTY_TYPES = [
    'Café/Restaurant',
    'Store/Boutique',
    'Beauty Salon',
    'Pharmacy/Healthcare',
    'Other',
]

// How a listing's availability reads to its owner. 'Occupied' is set by the
// lease flow only; owners switch between listed and paused.
function listingEntry(status, tone, icon) {
    return {
        get label() {
            return listingStatusLabel(status)
        },
        tone,
        icon,
    }
}

export const LISTING_STATUS = {
    Available: listingEntry('Available', 'success', 'bi-broadcast'),
    Reserved: listingEntry('Reserved', 'neutral', 'bi-pause-circle'),
    Occupied: listingEntry('Occupied', 'info', 'bi-key'),
}

export const TYPE_ICON = {
    'Café/Restaurant': 'bi-cup-hot',
    'Store/Boutique': 'bi-shop',
    'Beauty Salon': 'bi-scissors',
    'Pharmacy/Healthcare': 'bi-capsule',
    Other: 'bi-building',
}
