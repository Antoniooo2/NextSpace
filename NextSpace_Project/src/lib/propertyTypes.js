export const PROPERTY_TYPES = [
    'Café/Restaurant',
    'Store/Boutique',
    'Beauty Salon',
    'Pharmacy/Healthcare',
    'Other',
]

// How a listing's availability reads to its owner. 'Occupied' is set by the
// lease flow only; owners switch between listed and paused.
export const LISTING_STATUS = {
    Available: { label: 'Listed', tone: 'success', icon: 'bi-broadcast' },
    Reserved: { label: 'Paused', tone: 'neutral', icon: 'bi-pause-circle' },
    Occupied: { label: 'Leased', tone: 'info', icon: 'bi-key' },
}

export const TYPE_ICON = {
    'Café/Restaurant': 'bi-cup-hot',
    'Store/Boutique': 'bi-shop',
    'Beauty Salon': 'bi-scissors',
    'Pharmacy/Healthcare': 'bi-capsule',
    Other: 'bi-building',
}
