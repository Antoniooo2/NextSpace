import i18n from '../i18n'

const PROPERTY_TYPE_KEYS = {
    'Caf\u00e9/Restaurant': 'cafeRestaurant',
    'Store/Boutique': 'storeBoutique',
    'Beauty Salon': 'beautySalon',
    'Pharmacy/Healthcare': 'pharmacyHealthcare',
    Other: 'other',
}

const SERVICE_KEYS = {
    Parking: 'parking',
    'Air Conditioning': 'airConditioning',
    'Fiber Optic Internet': 'fiberInternet',
    '24/7 Security': 'security',
    Elevator: 'elevator',
    'Electrical Panel': 'electricalPanel',
    Others: 'others',
}

const PAYMENT_STATUS_KEYS = {
    Scheduled: 'scheduled',
    Pending: 'pending',
    Paid: 'paid',
    Late: 'late',
    Cancelled: 'cancelled',
}

const CONTRACT_STATUS_KEYS = {
    Pending: 'pending',
    Offered: 'offered',
    Active: 'active',
    Declined: 'declined',
    Withdrawn: 'withdrawn',
    Expired: 'expired',
    Cancelled: 'cancelled',
}

const LISTING_STATUS_KEYS = {
    Available: 'available',
    Reserved: 'reserved',
    Occupied: 'occupied',
}

const PAYMENT_METHOD_KEYS = {
    Wompi: 'wompi',
    Cash: 'cash',
}

const ACCOUNT_TYPE_KEYS = {
    Savings: 'savings',
    Checking: 'checking',
}

const PROCESS_KEYS = {
    Payments: 'payments',
    Contracts: 'contracts',
    Marketplace: 'marketplace',
}

function lookup(group, keys, value) {
    const key = keys[value]
    return key ? i18n.t(`values.${group}.${key}`) : value || ''
}

export function propertyTypeLabel(value) {
    return lookup('propertyType', PROPERTY_TYPE_KEYS, value)
}

export function serviceLabel(value) {
    return lookup('service', SERVICE_KEYS, value)
}

export function paymentStatusLabel(value) {
    return lookup('paymentStatus', PAYMENT_STATUS_KEYS, value)
}

export function contractStatusLabel(value) {
    return lookup('contractStatus', CONTRACT_STATUS_KEYS, value)
}

export function listingStatusLabel(value) {
    return lookup('listingStatus', LISTING_STATUS_KEYS, value)
}

export function paymentMethodLabel(value) {
    return lookup('paymentMethod', PAYMENT_METHOD_KEYS, value)
}

export function accountTypeLabel(value) {
    return lookup('accountType', ACCOUNT_TYPE_KEYS, value)
}

export function processLabel(value) {
    return lookup('process', PROCESS_KEYS, value)
}

const AVAILABILITY_KEYS = {
    Available: 'available',
    Reserved: 'reserved',
    Occupied: 'occupied',
}

export function availabilityLabel(value) {
    return lookup('availability', AVAILABILITY_KEYS, value)
}
