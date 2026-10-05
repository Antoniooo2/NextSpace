// Lease lifecycle shared by the owner and tenant Contracts screens.
// Mirrors supabase/migrations/*_contracts_v2.sql: every change goes through
// an RPC that checks who is calling and whether the step is allowed.
import { supabase } from './supabaseClient'
import i18n from '../i18n'
import { daysUntil, formatDueDate, todayInElSalvador } from './rentSchedule'
import { money } from './money'
import { contractRate, feeSplit, formatRate } from './platformFee'
import { contractStatusLabel } from './displayValues'
import { BRAND_VALUES } from './brand'
import { DASH } from './symbols'

function statusEntry(status, tone, icon) {
    return {
        get label() {
            return contractStatusLabel(status)
        },
        tone,
        icon,
    }
}

export const CONTRACT_STATUS_META = {
    Pending: statusEntry('Pending', 'info', 'bi-inbox'),
    Offered: statusEntry('Offered', 'warning', 'bi-pen'),
    Active: statusEntry('Active', 'success', 'bi-check-circle-fill'),
    Declined: statusEntry('Declined', 'neutral', 'bi-x-circle'),
    Withdrawn: statusEntry('Withdrawn', 'neutral', 'bi-arrow-counterclockwise'),
    Expired: statusEntry('Expired', 'neutral', 'bi-flag'),
    Cancelled: statusEntry('Cancelled', 'neutral', 'bi-slash-circle'),
}

export function statusMeta(contract) {
    if (contract.status === 'Expired' && contract.end_reason === 'terminated') {
        return { label: i18n.t('values.contractStatus.endedEarly'), tone: 'neutral', icon: 'bi-flag' }
    }
    return CONTRACT_STATUS_META[contract.status] || { label: contract.status, tone: 'neutral', icon: 'bi-file-earmark' }
}

export { money }

export function personName(person) {
    return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || DASH
}

// Day of the month rent is due (the lease's start day), as "15th".
export function dueDayLabel(startDate) {
    if (!startDate) return DASH
    const day = Number(startDate.slice(8, 10))
    return i18n.t('contracts.dueDay', { count: day, ordinal: true })
}

export function addMonths(ymd, months) {
    const [y, m, d] = ymd.split('-').map(Number)
    const target = new Date(Date.UTC(y, m - 1 + months, 1))
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
    target.setUTCDate(Math.min(d, lastDay))
    return target.toISOString().slice(0, 10)
}

export function addDays(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function expiresInText(hours) {
    if (hours < 24) return i18n.t('contracts.expiresInHours', { count: Math.max(1, Math.round(hours)) })
    return i18n.t('contracts.expiresInDays', { count: Math.round(hours / 24) })
}

export function offerExpiresIn(contract) {
    if (contract.status !== 'Offered' || !contract.offer_expires_at) return null
    const hours = (new Date(contract.offer_expires_at).getTime() - Date.now()) / 3600000
    if (hours <= 0) return { expired: true, text: i18n.t('contracts.offerExpired') }
    return { expired: false, withinDay: hours < 24, text: expiresInText(hours) }
}

export function daysLeft(contract, today = todayInElSalvador()) {
    return contract.end_date ? daysUntil(contract.end_date, today) : null
}

const LONG_DATE = { month: 'long', day: 'numeric', year: 'numeric' }

// The standard terms every NextSpace lease carries, filled with this
// contract's numbers. Special clauses from the owner are added after these.
export function standardClauses(contract) {
    const property = contract.add_business || {}
    const rent = money(contract.monthly_rent)
    const months = contract.duration_months
    const deposit = Number(contract.deposit || 0)
    const fee = feeSplit(contract.monthly_rent, contractRate(contract))
    const t = (key, values) => i18n.t(`contracts.clauses.${key}`, { ...BRAND_VALUES, ...values })

    return [
        {
            title: t('premises.title'),
            body: t('premises.body', {
                name: property.property_name || t('premises.fallbackName'),
                location: property.municipality
                    ? t('premises.location', { place: [property.municipality, property.department].filter(Boolean).join(', ') })
                    : '',
            }),
        },
        {
            title: t('term.title'),
            body: t('term.body', {
                start: formatDueDate(contract.start_date, LONG_DATE),
                end: formatDueDate(contract.end_date, LONG_DATE),
                length: months ? t('term.length', { count: months }) : '',
            }),
        },
        {
            title: t('rent.title'),
            body: t('rent.body', { rent, day: dueDayLabel(contract.start_date) }),
        },
        {
            title: t('fee.title'),
            body: t('fee.body', { rate: formatRate(fee.rate), fee: money(fee.fee), rent, net: money(fee.net) }),
        },
        {
            title: t('deposit.title'),
            body: deposit > 0 ? t('deposit.body', { deposit: money(deposit) }) : t('deposit.none'),
        },
        {
            title: t('use.title'),
            body: t('use.body'),
        },
        {
            title: t('maintenance.title'),
            body: t('maintenance.body'),
        },
        {
            title: t('latePayment.title'),
            body: t('latePayment.body'),
        },
        {
            title: t('earlyEnd.title'),
            body: t('earlyEnd.body'),
        },
        {
            title: t('renewal.title'),
            body: t('renewal.body'),
        },
        {
            title: t('signature.title'),
            body: t('signature.body'),
        },
    ]
}

// Which list a contract belongs to on the Contracts screens.
export function contractStage(contract) {
    if (contract.status === 'Pending') return 'requests'
    if (contract.status === 'Offered') return 'offers'
    if (contract.status === 'Active') return 'active'
    return 'closed'
}

async function rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args)
    if (error) throw new Error(error.message || i18n.t('common.genericError'))
    return data
}

export const contractActions = {
    offer: ({ contractId, start, months, rent, deposit, clauses, ownerName }) =>
        rpc('offer_contract', {
            p_contract_id: contractId,
            p_start: start,
            p_months: Number(months),
            p_rent: Number(rent),
            p_deposit: deposit === '' || deposit == null ? null : Number(deposit),
            p_clauses: clauses || null,
            p_owner_name: ownerName,
        }),
    invite: ({ propertyId, identifier, start, months, rent, deposit, clauses, ownerName }) =>
        rpc('invite_tenant', {
            p_property_id: propertyId,
            p_identifier: identifier,
            p_start: start,
            p_months: Number(months),
            p_rent: Number(rent),
            p_deposit: deposit === '' || deposit == null ? null : Number(deposit),
            p_clauses: clauses || null,
            p_owner_name: ownerName,
        }),
    sign: ({ contractId, name }) => rpc('sign_contract', { p_contract_id: contractId, p_name: name }),
    decline: ({ contractId, reason }) => rpc('decline_contract', { p_contract_id: contractId, p_reason: reason || null }),
    withdraw: ({ contractId, reason }) => rpc('withdraw_contract', { p_contract_id: contractId, p_reason: reason || null }),
    requestTermination: ({ contractId, date, reason }) =>
        rpc('request_termination', { p_contract_id: contractId, p_date: date, p_reason: reason }),
    respondTermination: ({ contractId, accept }) =>
        rpc('respond_termination', { p_contract_id: contractId, p_accept: accept }),
    requestRenewal: ({ contractId, months, note }) =>
        rpc('request_renewal', { p_contract_id: contractId, p_months: Number(months), p_note: note || null }),
    offerRenewal: ({ contractId, months, rent, note, ownerName }) =>
        rpc('offer_renewal', {
            p_contract_id: contractId,
            p_months: Number(months),
            p_rent: Number(rent),
            p_note: note || null,
            p_owner_name: ownerName,
        }),
    signRenewal: ({ contractId, name }) => rpc('sign_renewal', { p_contract_id: contractId, p_name: name }),
    declineRenewal: ({ contractId, reason }) => rpc('decline_renewal', { p_contract_id: contractId, p_reason: reason || null }),
}

// Renewals open in the last 90 days of an active lease (same rule as the RPCs).
export const RENEWAL_WINDOW_DAYS = 90

export function renewalOpen(contract, today = todayInElSalvador()) {
    if (contract.status !== 'Active' || !contract.end_date || contract.termination_requested_at) return false
    const left = daysUntil(contract.end_date, today)
    return left >= 0 && left <= RENEWAL_WINDOW_DAYS
}

// 'offered' (owner's offer waiting for the tenant), 'requested' (tenant asked,
// waiting for the owner's offer) or null.
export function renewalState(contract) {
    if (contract.renewal_offered_at) return 'offered'
    if (contract.renewal_requested_at) return 'requested'
    return null
}

export function renewalExpiresIn(contract) {
    if (!contract.renewal_expires_at) return null
    const hours = (new Date(contract.renewal_expires_at).getTime() - Date.now()) / 3600000
    if (hours <= 0) return i18n.t('contracts.expired')
    return expiresInText(hours)
}

// The applicant's record on NextSpace (aggregates only), keyed by DUI.
export async function loadApplicantRecords(duis) {
    const unique = [...new Set(duis.filter(Boolean))]
    if (unique.length === 0) return {}
    const { data, error } = await supabase.rpc('applicant_records', { p_duis: unique })
    if (error) return {}
    return Object.fromEntries((data || []).map((r) => [r.tenant_dui, r]))
}

export function recordSummary(record) {
    if (!record || record.leases === 0 || record.months_due === 0) {
        return { tone: 'neutral', short: i18n.t('contracts.record.newOnBrand', BRAND_VALUES), pct: null }
    }
    const pct = Math.round((record.months_on_time / record.months_due) * 100)
    const tone = record.months_late_now > 0 || pct < 70 ? 'danger' : pct < 90 ? 'warning' : 'success'
    return { tone, short: i18n.t('contracts.record.onTimePct', { pct }), pct }
}

// Ranking for "who should I accept": on-time rate smoothed by how much history
// there is (1 month at 100% isn't as telling as 12), minus months late now.
// A business with no history sits in the middle, at 0.5.
export function recordScore(record) {
    if (!record || record.months_due === 0) return 0.5
    return (record.months_on_time + 1) / (record.months_due + 2) - 0.15 * record.months_late_now
}

// Why a record ranks where it does, in one short phrase.
export function recordReason(record) {
    const summary = recordSummary(record)
    if (summary.pct == null) return i18n.t('contracts.record.noHistory', BRAND_VALUES)
    const months = i18n.t('contracts.record.monthsOnTime', { count: record.months_due, onTime: record.months_on_time })
    if (record.months_late_now > 0) {
        return i18n.t('contracts.record.lateNow', { months, count: record.months_late_now })
    }
    return i18n.t('contracts.record.nothingLate', { months })
}

function eventEntry(icon, key) {
    return {
        icon,
        get label() {
            return i18n.t(`contracts.events.${key}`)
        },
    }
}

export const EVENT_META = {
    requested: eventEntry('bi-inbox-fill', 'requested'),
    invited: eventEntry('bi-envelope-paper-fill', 'invited'),
    offered: eventEntry('bi-pen-fill', 'offered'),
    signed: eventEntry('bi-patch-check-fill', 'signed'),
    declined: eventEntry('bi-x-circle-fill', 'declined'),
    auto_declined: eventEntry('bi-x-circle', 'autoDeclined'),
    withdrawn: eventEntry('bi-arrow-counterclockwise', 'withdrawn'),
    termination_requested: eventEntry('bi-hourglass-split', 'terminationRequested'),
    termination_accepted: eventEntry('bi-check2-circle', 'terminationAccepted'),
    termination_declined: eventEntry('bi-slash-circle', 'terminationDeclined'),
    expired: eventEntry('bi-flag-fill', 'expired'),
    renewal_offer: eventEntry('bi-arrow-repeat', 'renewalOffer'),
    renewal_request: eventEntry('bi-arrow-repeat', 'renewalRequest'),
    reminder: eventEntry('bi-send-fill', 'reminder'),
    auto_reminder: eventEntry('bi-bell-fill', 'autoReminder'),
    renewed: eventEntry('bi-arrow-repeat', 'renewed'),
    renewal_declined: eventEntry('bi-slash-circle', 'renewalDeclined'),
    renewal_expired: eventEntry('bi-hourglass-bottom', 'renewalExpired'),
    offer_expired: eventEntry('bi-hourglass-bottom', 'offerExpired'),
    request_reminder: eventEntry('bi-bell', 'requestReminder'),
    offer_reminder: eventEntry('bi-bell', 'offerReminder'),
}
