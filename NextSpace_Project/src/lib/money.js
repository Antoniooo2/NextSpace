// Dollar amounts, the same way everywhere: up to 2 decimals on screen
// ($600, $612.5), always 2 on receipts and reports ($600.00).
import { currentLocale } from '../i18n'

function usd(value, minimumFractionDigits) {
    return new Intl.NumberFormat(currentLocale(), {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits,
        maximumFractionDigits: 2,
    }).format(Number(value || 0))
}

export function money(value) {
    return usd(value, 0)
}

export function moneyExact(value) {
    return usd(value, 2)
}
