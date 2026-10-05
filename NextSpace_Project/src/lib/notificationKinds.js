// What each notification is about, how it looks, where it leads, and whether
// it still asks something of the reader. Titles come from our own RPCs and
// automations ("Lease offer: …", "Rent overdue: …"), so the prefix is enough
// to tell them apart. Order matters: more specific prefixes first.
import { supabase } from './supabaseClient'
import i18n from '../i18n'
import { renewalOpen, renewalState } from './contracts'
import { formatDate, formatTime } from './format'
import { BRAND_VALUES } from './brand'

const KINDS = [
    { kind: 'request', test: /^(New contract request|Request waiting)/, icon: 'bi-inbox-fill', tone: 'info' },
    { kind: 'offer', test: /^(Lease offer|Updated lease offer|Offer expires soon)/, icon: 'bi-pen-fill', tone: 'warning' },
    { kind: 'signed', test: /^(Lease signed|Contract accepted|Lease renewed)/, icon: 'bi-patch-check-fill', tone: 'success' },
    { kind: 'renewal-closed', test: /^(Renewal not going ahead|Renewal offer expired)/, icon: 'bi-x-circle', tone: 'neutral' },
    {
        kind: 'closed',
        test: /^(Request declined|Request closed|Request withdrawn|Offer turned down|Contract cancelled|Offer expired|Invitation)/,
        icon: 'bi-x-circle',
        tone: 'neutral',
    },
    { kind: 'renewal-request', test: /^Renewal request/, icon: 'bi-arrow-repeat', tone: 'info' },
    { kind: 'renewal-offer', test: /^Renewal offer/, icon: 'bi-arrow-repeat', tone: 'warning' },
    { kind: 'end-request', test: /^Request to end lease early/, icon: 'bi-box-arrow-right', tone: 'danger' },
    { kind: 'end-result', test: /^Early end (accepted|declined)/, icon: 'bi-flag', tone: 'neutral' },
    { kind: 'lease-ending', test: /^Lease end(ing|s) /, icon: 'bi-hourglass-split', tone: 'warning' },
    { kind: 'lease-ended', test: /^Lease ended/, icon: 'bi-flag-fill', tone: 'neutral' },
    { kind: 'rent-late', test: /^(Rent overdue|Rent \d+ days overdue|Late rent|Still unpaid)/, icon: 'bi-exclamation-octagon-fill', tone: 'danger' },
    { kind: 'rent-due', test: /^(Rent due|Rent reminder from your owner)/, icon: 'bi-calendar-event', tone: 'warning' },
    { kind: 'paid', test: /^Payment (received|confirmed|recorded)/, icon: 'bi-check-circle-fill', tone: 'success' },
    { kind: 'transfer', test: /^Transfer sent/, icon: 'bi-bank', tone: 'success' },
    { kind: 'rony', test: /^Heads up from Rony/, icon: 'bi-stars', tone: 'rony' },
    { kind: 'match', test: /^New space for your search/, icon: 'bi-search-heart', tone: 'info' },
]

export function notificationKind(n) {
    const hit = KINDS.find((k) => k.test.test(n.title || ''))
    if (hit) return hit
    return n.process === 'Payments'
        ? { kind: 'payments', icon: 'bi-credit-card', tone: 'neutral' }
        : { kind: 'contracts', icon: 'bi-file-earmark-text', tone: 'neutral' }
}

// Where tapping a notification goes.
export function notificationTarget(n) {
    const { kind } = notificationKind(n)
    if (n.property_id && (kind === 'match' || n.process === 'Marketplace')) {
        return { section: 'home', contractId: null, propertyId: n.property_id }
    }
    const paymentsKinds = ['rent-late', 'rent-due', 'paid', 'transfer', 'rony']
    return {
        section: paymentsKinds.includes(kind) || (n.process === 'Payments' && kind !== 'lease-ending') ? 'payments' : 'contracts',
        contractId: n.contract_id ?? null,
    }
}

// The action a notification still asks for, given the contract's current
// state: { label, section } while it's pending, 'done' once it isn't, or
// null for notifications that never ask anything.
export function notificationAction(n, contract, owed) {
    const { kind } = notificationKind(n)
    if (!contract) return null
    const iAmTenant = contract.tenant_dui === n.recipient_dui
    const open = (key, section = 'contracts') => ({ labelKey: `notifications.actions.${key}`, section })

    switch (kind) {
        case 'request':
            return contract.status === 'Pending' ? open('answerRequest') : 'done'
        case 'offer':
            return contract.status === 'Offered' && new Date(contract.offer_expires_at) > new Date() ? open('reviewOffer') : 'done'
        case 'renewal-request':
            return contract.status === 'Active' && contract.renewal_requested_at ? open('answer') : 'done'
        case 'renewal-offer':
            return contract.status === 'Active' && contract.renewal_offered_at ? open('reviewRenewal') : 'done'
        case 'end-request':
            return contract.status === 'Active' && contract.termination_requested_at && contract.termination_requested_by !== (iAmTenant ? 'tenant' : 'owner')
                ? open('answer')
                : 'done'
        case 'lease-ending':
            if (renewalOpen(contract) && !renewalState(contract)) return open(iAmTenant ? 'askToRenew' : 'offerRenewal')
            return contract.status === 'Active' && renewalState(contract) ? 'done' : null
        case 'rent-due':
        case 'rent-late': {
            const due = owed[n.contract_id] || 0
            if (due > 0) return open(iAmTenant ? 'payNow' : 'viewRent', 'payments')
            return 'done'
        }
        default:
            return null
    }
}

// Contracts and unpaid rent behind a list of notifications, so each one can
// say whether it still needs something.
export async function loadNotificationContext(notifications) {
    const ids = [...new Set(notifications.map((n) => n.contract_id).filter(Boolean))]
    if (ids.length === 0) return { contracts: {}, owed: {} }
    const [{ data: contractRows }, { data: paymentRows }] = await Promise.all([
        supabase
            .from('contract')
            .select(
                'contract_id, status, tenant_dui, end_date, offer_expires_at, renewal_requested_at, renewal_offered_at, termination_requested_at, termination_requested_by'
            )
            .in('contract_id', ids),
        supabase.from('payment').select('contract_id, status').in('contract_id', ids).in('status', ['Pending', 'Late']),
    ])
    const contracts = Object.fromEntries((contractRows || []).map((c) => [c.contract_id, c]))
    const owed = {}
    for (const p of paymentRows || []) owed[p.contract_id] = (owed[p.contract_id] || 0) + 1
    return { contracts, owed }
}

export async function markNotificationsRead(ids) {
    if (ids.length === 0) return
    await supabase.from('notifications').update({ read: true }).in('notification_id', ids)
}

export function timeLabel(iso) {
    const date = new Date(iso)
    const now = new Date()
    const mins = Math.round((now - date) / 60000)
    if (mins < 1) return i18n.t('notifications.time.justNow')
    if (mins < 60) return i18n.t('notifications.time.minAgo', { count: mins })
    if (date.toDateString() === now.toDateString()) return formatTime(date)
    return formatDate(date, { month: 'short', day: 'numeric' })
}

// Today / Yesterday / This week / Earlier.
export function dayGroup(iso) {
    const d = new Date(iso)
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
    if (diffDays <= 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return 'thisWeek'
    return 'earlier'
}

const TITLE_PREFIXES = {
    'New contract request': 'newContractRequest',
    'Contract accepted': 'contractAccepted',
    'Lease offer': 'leaseOffer',
    'Updated lease offer': 'updatedLeaseOffer',
    'Offer expires soon': 'offerExpiresSoon',
    'Offer expired': 'offerExpired',
    'Offer turned down': 'offerTurnedDown',
    Offer: 'offer',
    'Lease signed': 'leaseSigned',
    'Lease renewed': 'leaseRenewed',
    'Lease ended': 'leaseEnded',
    'Request declined': 'requestDeclined',
    'Request closed': 'requestClosed',
    'Request withdrawn': 'requestWithdrawn',
    'Request to end lease early': 'requestEndEarly',
    'Early end accepted': 'earlyEndAccepted',
    'Early end declined': 'earlyEndDeclined',
    'Renewal request': 'renewalRequest',
    'Renewal offer': 'renewalOffer',
    'Renewal offer expires soon': 'renewalOfferExpiresSoon',
    'Renewal offer expired': 'renewalOfferExpired',
    'Renewal not going ahead': 'renewalNotGoingAhead',
    'Rent due today': 'rentDueToday',
    'Rent due tomorrow': 'rentDueTomorrow',
    'Rent overdue': 'rentOverdue',
    'Late rent': 'lateRent',
    'Rent reminder from your owner': 'rentReminderFromOwner',
    'Payment received': 'paymentReceived',
    'Payment confirmed': 'paymentConfirmed',
    'Payment recorded': 'paymentRecorded',
    'Transfer sent': 'transferSent',
    'Heads up from Rony': 'headsUpFromRony',
    'New space for your search': 'newSpaceForSearch',
    'This week': 'thisWeek',
    'Message from your property owner': 'messageFromOwner',
}

const COUNTED_PREFIXES = [
    [/^Rent due in (\d+) days$/, 'rentDueInDays'],
    [/^Lease ending in (\d+) days$/, 'leaseEndingInDays'],
    [/^Rent (\d+) days overdue$/, 'rentDaysOverdue'],
    [/^Still unpaid after (\d+) days$/, 'stillUnpaidAfterDays'],
    [/^Request waiting (\d+) days$/, 'requestWaitingDays'],
]

const TITLE_FALLBACKS = {
    'your property': 'yourProperty',
    'your lease': 'yourLease',
    'a space': 'aSpace',
}

function translatePrefix(prefix) {
    const key = TITLE_PREFIXES[prefix]
    if (key) return i18n.t(`notifications.titles.${key}`, BRAND_VALUES)
    for (const [pattern, countedKey] of COUNTED_PREFIXES) {
        const match = prefix.match(pattern)
        if (match) return i18n.t(`notifications.titles.${countedKey}`, { count: Number(match[1]) })
    }
    return null
}

export function notificationTitle(n) {
    const title = n?.title || ''
    const split = title.indexOf(': ')
    const prefix = split === -1 ? title : title.slice(0, split)
    const translated = translatePrefix(prefix)
    if (translated == null) return title
    if (split === -1) return translated
    const rest = title.slice(split + 2)
    const fallback = TITLE_FALLBACKS[rest]
    return `${translated}: ${fallback ? i18n.t(`notifications.titles.fallback.${fallback}`) : rest}`
}
