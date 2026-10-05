import { supabase } from './supabaseClient'
import i18n, { currentLocale } from '../i18n'
import { paymentStatusLabel } from './displayValues'

// Mirrors supabase/migrations/*_rent_schedule.sql. Each Active lease has one
// payment row per month; payment_date is that installment's DUE date.
//   Scheduled  due more than PAYABLE_WINDOW_DAYS away (not payable yet)
//   Pending    due within the window, or today (payable)
//   Late       past due and unpaid (payable)
//   Paid / Cancelled
export const PAYABLE_WINDOW_DAYS = 7

export const PAYMENT_STATUS_TAG = {
    Scheduled: 'tag-scheduled',
    Pending: 'tag-pending',
    Paid: 'tag-paid',
    Late: 'tag-late',
    Cancelled: 'tag-cancelled',
}

export const PAYMENT_STATUS_LABEL = {
    get Scheduled() {
        return paymentStatusLabel('Scheduled')
    },
    get Pending() {
        return paymentStatusLabel('Pending')
    },
    get Paid() {
        return paymentStatusLabel('Paid')
    },
    get Late() {
        return paymentStatusLabel('Late')
    },
    get Cancelled() {
        return paymentStatusLabel('Cancelled')
    },
}

// Today's date in El Salvador as YYYY-MM-DD, matching the database's
// sv_today() so the page and the daily job agree on what is late.
export function todayInElSalvador() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date())
}

function toUtcDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
}

export function daysUntil(dateStr, today = todayInElSalvador()) {
    return Math.round((toUtcDay(dateStr) - toUtcDay(today)) / 86400000)
}

// The status the installment has as of today. The database refreshes these
// daily, but a page opened just after midnight shouldn't show yesterday's.
export function effectiveStatus(payment, today = todayInElSalvador()) {
    if (payment.status !== 'Scheduled' && payment.status !== 'Pending') return payment.status
    const days = daysUntil(payment.payment_date, today)
    if (days < 0) return 'Late'
    if (days <= PAYABLE_WINDOW_DAYS) return 'Pending'
    return 'Scheduled'
}

export function isPayable(status) {
    return status === 'Pending' || status === 'Late'
}

export function formatDueDate(dateStr, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(currentLocale(), { ...options, timeZone: 'UTC' })
}

export function dueCountdown(dateStr, today = todayInElSalvador()) {
    const days = daysUntil(dateStr, today)
    if (days === 0) return { text: i18n.t('rent.dueToday'), tone: 'warning' }
    if (days === 1) return { text: i18n.t('rent.dueTomorrow'), tone: 'warning' }
    if (days > 1) return { text: i18n.t('rent.dueInDays', { count: days }), tone: days <= PAYABLE_WINDOW_DAYS ? 'warning' : 'neutral' }
    const late = -days
    return { text: i18n.t('rent.daysLate', { count: late }), tone: 'danger' }
}

// Brings Scheduled/Pending rows up to date server-side before a screen reads
// them. Failure is non-fatal: effectiveStatus() covers the display anyway.
export async function refreshPaymentStatuses() {
    const { error } = await supabase.rpc('refresh_payment_statuses')
    if (error) console.warn('Could not refresh payment statuses', error)
}

export const PAYMENTS_NOT_CONFIGURED = 'payments_not_configured'
