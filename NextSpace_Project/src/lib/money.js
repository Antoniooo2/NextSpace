// Dollar amounts, the same way everywhere: up to 2 decimals on screen
// ($600, $612.5), always 2 on receipts and reports ($600.00).
export function money(value) {
    return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function moneyExact(value) {
    return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
