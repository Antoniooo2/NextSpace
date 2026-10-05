import { currentLocale } from '../i18n'

export function formatNumber(value, options) {
    return new Intl.NumberFormat(currentLocale(), options).format(Number(value || 0))
}

export function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    if (!value) return ''
    return new Intl.DateTimeFormat(currentLocale(), options).format(value instanceof Date ? value : new Date(value))
}

export function formatTime(value, options = { hour: 'numeric', minute: '2-digit' }) {
    if (!value) return ''
    return new Intl.DateTimeFormat(currentLocale(), options).format(value instanceof Date ? value : new Date(value))
}

export function formatDateTime(value, options = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) {
    if (!value) return ''
    return new Intl.DateTimeFormat(currentLocale(), options).format(value instanceof Date ? value : new Date(value))
}
