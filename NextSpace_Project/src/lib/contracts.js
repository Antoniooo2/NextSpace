// Lease lifecycle shared by the owner and tenant Contracts screens.
// Mirrors supabase/migrations/*_contracts_v2.sql: every change goes through
// an RPC that checks who is calling and whether the step is allowed.
import { supabase } from './supabaseClient'
import { daysUntil, formatDueDate, todayInElSalvador } from './rentSchedule'

export const CONTRACT_STATUS_META = {
    Pending: { label: 'Requested', tone: 'info', icon: 'bi-inbox' },
    Offered: { label: 'Awaiting signature', tone: 'warning', icon: 'bi-pen' },
    Active: { label: 'Active', tone: 'success', icon: 'bi-check-circle-fill' },
    Declined: { label: 'Declined', tone: 'neutral', icon: 'bi-x-circle' },
    Withdrawn: { label: 'Withdrawn', tone: 'neutral', icon: 'bi-arrow-counterclockwise' },
    Expired: { label: 'Ended', tone: 'neutral', icon: 'bi-flag' },
    Cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'bi-slash-circle' },
}

export const OPEN_STATUSES = ['Pending', 'Offered']
export const CLOSED_STATUSES = ['Declined', 'Withdrawn', 'Expired', 'Cancelled']

export function statusMeta(contract) {
    if (contract.status === 'Expired' && contract.end_reason === 'terminated') {
        return { label: 'Ended early', tone: 'neutral', icon: 'bi-flag' }
    }
    return CONTRACT_STATUS_META[contract.status] || { label: contract.status, tone: 'neutral', icon: 'bi-file-earmark' }
}

export function money(value) {
    return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function personName(person) {
    return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || '—'
}

// Day of the month rent is due (the lease's start day), as "15th".
export function dueDayLabel(startDate) {
    if (!startDate) return '—'
    const day = Number(startDate.slice(8, 10))
    const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
    return `${day}${suffix}`
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

export function offerExpiresIn(contract) {
    if (contract.status !== 'Offered' || !contract.offer_expires_at) return null
    const hours = (new Date(contract.offer_expires_at).getTime() - Date.now()) / 3600000
    if (hours <= 0) return { expired: true, text: 'Offer expired' }
    if (hours < 24) return { expired: false, text: `Expires in ${Math.max(1, Math.round(hours))} hours` }
    return { expired: false, text: `Expires in ${Math.round(hours / 24)} days` }
}

export function daysLeft(contract, today = todayInElSalvador()) {
    return contract.end_date ? daysUntil(contract.end_date, today) : null
}

// The standard terms every NextSpace lease carries, filled with this
// contract's numbers. Special clauses from the owner are added after these.
export function standardClauses(contract) {
    const property = contract.add_business || {}
    const rent = money(contract.monthly_rent)
    const months = contract.duration_months
    const deposit = Number(contract.deposit || 0)

    return [
        {
            title: 'Premises',
            body: `The owner leases to the tenant the commercial space "${property.property_name || 'the property'}"${
                property.municipality ? ` in ${[property.municipality, property.department].filter(Boolean).join(', ')}` : ''
            }, as listed on NextSpace, for the tenant's business use.`,
        },
        {
            title: 'Term',
            body: `The lease runs from ${formatDueDate(contract.start_date, { month: 'long', day: 'numeric', year: 'numeric' })} to ${formatDueDate(contract.end_date, { month: 'long', day: 'numeric', year: 'numeric' })}${
                months ? ` (${months} ${months === 1 ? 'month' : 'months'})` : ''
            }.`,
        },
        {
            title: 'Rent and payment',
            body: `The monthly rent is ${rent}, due on the ${dueDayLabel(contract.start_date)} of each month starting on the start date. Rent is paid online through NextSpace (Wompi); it can be paid from 7 days before each due date and is applied to the oldest unpaid month first. Each payment produces a receipt.`,
        },
        {
            title: 'Deposit',
            body:
                deposit > 0
                    ? `The tenant gives the owner a security deposit of ${money(deposit)} before the start date. It is returned at the end of the lease, minus the cost of documented damages beyond normal wear.`
                    : 'No security deposit is required for this lease.',
        },
        {
            title: 'Use of the space',
            body: 'The tenant will use the space only for lawful commercial activity, keep the permits its business requires, and not sublet it without the owner’s written consent.',
        },
        {
            title: 'Maintenance',
            body: 'The owner is responsible for structural repairs and the building’s main installations. The tenant is responsible for day-to-day upkeep and for damage caused by its use of the space.',
        },
        {
            title: 'Late payment',
            body: 'If rent is not paid by its due date, NextSpace sends reminders on the due date and after 7 and 15 days. No late fee applies unless one is stated in the special clauses.',
        },
        {
            title: 'Ending the lease early',
            body: 'Either party may ask to end the lease early through NextSpace, stating a date and a reason. It only takes effect if the other party accepts; rent after the agreed end date is then removed.',
        },
        {
            title: 'Renewal',
            body: 'In the last 90 days of the lease either party may propose a renewal through NextSpace. It takes effect when the owner’s renewal offer is signed by the tenant; the new rent applies from the current end date. Otherwise the lease ends on the end date and the space becomes available again.',
        },
        {
            title: 'Electronic signature',
            body: 'Both parties accept that typing their full name and confirming through NextSpace, recorded with the date and time, is their signature of this lease.',
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
    if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
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
    if (hours <= 0) return 'Expired'
    if (hours < 24) return `Expires in ${Math.max(1, Math.round(hours))} hours`
    return `Expires in ${Math.round(hours / 24)} days`
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
        return { tone: 'neutral', short: 'New on NextSpace', pct: null }
    }
    const pct = Math.round((record.months_on_time / record.months_due) * 100)
    const tone = record.months_late_now > 0 || pct < 70 ? 'danger' : pct < 90 ? 'warning' : 'success'
    return { tone, short: `${pct}% on time`, pct }
}

export const EVENT_META = {
    requested: { icon: 'bi-inbox-fill', label: 'Lease requested' },
    invited: { icon: 'bi-envelope-paper-fill', label: 'Invitation sent' },
    offered: { icon: 'bi-pen-fill', label: 'Offer sent and signed by the owner' },
    signed: { icon: 'bi-patch-check-fill', label: 'Signed by the tenant — lease active' },
    declined: { icon: 'bi-x-circle-fill', label: 'Declined' },
    auto_declined: { icon: 'bi-x-circle', label: 'Closed automatically' },
    withdrawn: { icon: 'bi-arrow-counterclockwise', label: 'Withdrawn by the business' },
    termination_requested: { icon: 'bi-hourglass-split', label: 'Early end requested' },
    termination_accepted: { icon: 'bi-check2-circle', label: 'Early end accepted' },
    termination_declined: { icon: 'bi-slash-circle', label: 'Early end declined' },
    expired: { icon: 'bi-flag-fill', label: 'Lease ended' },
    renewal_offer: { icon: 'bi-arrow-repeat', label: 'Renewal offered and signed by the owner' },
    renewal_request: { icon: 'bi-arrow-repeat', label: 'Renewal requested by the business' },
    reminder: { icon: 'bi-send-fill', label: 'Rent reminder sent' },
    auto_reminder: { icon: 'bi-bell-fill', label: 'Automatic rent reminder' },
    renewed: { icon: 'bi-arrow-repeat', label: 'Renewal signed — lease extended' },
    renewal_declined: { icon: 'bi-slash-circle', label: 'Renewal not going ahead' },
    renewal_expired: { icon: 'bi-hourglass-bottom', label: 'Renewal offer expired' },
    offer_expired: { icon: 'bi-hourglass-bottom', label: 'Offer expired' },
    request_reminder: { icon: 'bi-bell', label: 'Owner reminded about the request' },
    offer_reminder: { icon: 'bi-bell', label: 'Business reminded to sign' },
}
