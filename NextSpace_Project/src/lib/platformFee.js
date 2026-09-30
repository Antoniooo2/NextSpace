// NextSpace keeps a fee (5% today) of every monthly rent payment; the owner
// receives the rest through a transfer. The tenant always pays exactly the
// contract rent, and the deposit carries no fee.
//
// The rate lives in the platform_settings table. Signed leases keep the rate
// they were offered with (contract.commission_rate) and each paid month keeps
// the exact split it was paid with (payment.commission_amount/owner_amount),
// so everything here prefers those stored numbers and only estimates with the
// current rate what hasn't been paid yet.
import { supabase } from './supabaseClient'

export const DEFAULT_COMMISSION_RATE = 0.05

let ratePromise = null

// The current rate, read once per page load. Falls back to the default if
// the table can't be read, so a screen never breaks over it.
export function loadCommissionRate() {
    if (!ratePromise) {
        ratePromise = supabase
            .from('platform_settings')
            .select('commission_rate')
            .maybeSingle()
            .then(({ data, error }) => {
                const rate = Number(data?.commission_rate)
                if (error || !Number.isFinite(rate)) {
                    ratePromise = null
                    return DEFAULT_COMMISSION_RATE
                }
                return rate
            })
            .catch(() => {
                ratePromise = null
                return DEFAULT_COMMISSION_RATE
            })
    }
    return ratePromise
}

// "5%", "4.5%"
export function formatRate(rate = DEFAULT_COMMISSION_RATE) {
    return `${Number((Number(rate) * 100).toFixed(2))}%`
}

// Same rounding as the database: the fee is rounded to the cent and the
// owner gets the rest, so fee + owner part = what the tenant paid.
export function feeSplit(amount, rate = DEFAULT_COMMISSION_RATE) {
    const gross = Number(amount || 0)
    const fee = Math.round(gross * Number(rate) * 100) / 100
    return { gross, fee, net: Math.round((gross - fee) * 100) / 100, rate: Number(rate) }
}

// The split of one payment row: the stored one once it's paid, otherwise an
// estimate with the lease's rate (or the current one).
export function paymentSplit(payment, fallbackRate = DEFAULT_COMMISSION_RATE) {
    if (payment?.owner_amount != null && payment?.commission_amount != null) {
        return {
            gross: Number(payment.amount || 0),
            fee: Number(payment.commission_amount),
            net: Number(payment.owner_amount),
            rate: Number(payment.commission_rate ?? fallbackRate),
        }
    }
    return feeSplit(payment?.amount, payment?.commission_rate ?? fallbackRate)
}

// Totals over many payment rows.
export function sumSplit(payments, fallbackRate = DEFAULT_COMMISSION_RATE) {
    return payments.reduce(
        (t, p) => {
            const s = paymentSplit(p, fallbackRate)
            return {
                gross: round2(t.gross + s.gross),
                fee: round2(t.fee + s.fee),
                net: round2(t.net + s.net),
            }
        },
        { gross: 0, fee: 0, net: 0 }
    )
}

// The rate that applies to a lease.
export function contractRate(contract, fallbackRate = DEFAULT_COMMISSION_RATE) {
    const rate = Number(contract?.commission_rate)
    return Number.isFinite(rate) && contract?.commission_rate != null ? rate : fallbackRate
}

// Paid months that NextSpace hasn't transferred to the owner yet.
export function awaitingTransfer(payment) {
    return payment?.status === 'Paid' && payment?.owner_amount != null && payment?.payout_id == null
}

function round2(n) {
    return Math.round(n * 100) / 100
}
