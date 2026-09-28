import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { money } from '../../../lib/contracts'
import { daysUntil, effectiveStatus, todayInElSalvador } from '../../../lib/rentSchedule'

// The three "live" cards on Rony's welcome screen. They come straight from
// the user's own rows (no AI call), and each one carries the question it
// asks Rony when tapped.

function lateText(days) {
    return days === 1 ? '1 day late' : `${days} days late`
}

async function callerDui() {
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { user: null, dui: null }
    const { data } = await supabase.from('users').select('dui').eq('id_supabase_auth', user.id).maybeSingle()
    return { user, dui: data?.dui || null }
}

async function openPayments(contractIds) {
    if (contractIds.length === 0) return []
    const { data } = await supabase
        .from('payment')
        .select('payment_id, contract_id, payment_date, amount, status')
        .in('contract_id', contractIds)
        .in('status', ['Scheduled', 'Pending', 'Late'])
        .order('payment_date', { ascending: true })
    const today = todayInElSalvador()
    return (data || []).map((p) => ({ ...p, status: effectiveStatus(p, today) }))
}

async function businessCards() {
    const { user, dui } = await callerDui()
    if (!dui) return []

    const [{ data: contracts }, { data: saved }] = await Promise.all([
        supabase
            .from('contract')
            .select('contract_id, status, add_business!contract_property_id_fkey(property_name)')
            .eq('tenant_dui', dui)
            .in('status', ['Active', 'Offered', 'Pending']),
        supabase
            .from('saved_properties')
            .select('property_id, add_business(property_name)')
            .eq('user_auth_id', user.id)
            .order('saved_at', { ascending: false })
            .limit(1),
    ])

    const nameOf = (c) => c?.add_business?.property_name || 'your space'
    const byId = new Map((contracts || []).map((c) => [c.contract_id, c]))
    const active = (contracts || []).filter((c) => c.status === 'Active')
    const payments = await openPayments(active.map((c) => c.contract_id))
    const cards = []

    const late = payments.find((p) => p.status === 'Late')
    const next = payments.find((p) => p.status !== 'Late')
    if (late) {
        const name = nameOf(byId.get(late.contract_id))
        cards.push({
            tone: 'bad',
            icon: 'bi-exclamation-triangle',
            title: `${money(late.amount)} overdue`,
            subtitle: `${name} · ${lateText(-daysUntil(late.payment_date))}`,
            prompt: `I'm late on rent for ${name}. How much do I owe and what should I do?`,
        })
    } else if (next) {
        const name = nameOf(byId.get(next.contract_id))
        const days = daysUntil(next.payment_date)
        cards.push({
            tone: days <= 7 ? 'warn' : 'info',
            icon: 'bi-calendar-event',
            title: `${money(next.amount)} due ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}`,
            subtitle: `Next rent · ${name}`,
            prompt: 'When is my next payment due and how much is it?',
        })
    }

    const offer = (contracts || []).find((c) => c.status === 'Offered')
    if (offer) {
        cards.push({
            tone: 'warn',
            icon: 'bi-pen',
            title: 'Lease offer to sign',
            subtitle: nameOf(offer),
            prompt: `I have a lease offer for ${nameOf(offer)}. What should I check before signing?`,
        })
    } else {
        const pending = (contracts || []).find((c) => c.status === 'Pending')
        if (pending) {
            cards.push({
                tone: 'info',
                icon: 'bi-hourglass-split',
                title: 'Request waiting on the owner',
                subtitle: nameOf(pending),
                prompt: `I asked to lease ${nameOf(pending)}. What happens next?`,
            })
        }
    }

    const lastSaved = saved?.[0]?.add_business?.property_name
    if (lastSaved) {
        cards.push({
            tone: 'good',
            icon: 'bi-bookmark-heart',
            title: 'Find more like your saved spaces',
            subtitle: `Last saved: ${lastSaved}`,
            prompt: `Find me spaces similar to ${lastSaved}.`,
        })
    }

    if (cards.length < 3) {
        cards.push({
            tone: 'info',
            icon: 'bi-search',
            title: 'Find a new space',
            subtitle: 'Tell Rony your budget and area',
            prompt: 'Help me find a commercial space within my budget.',
        })
    }
    return cards.slice(0, 3)
}

async function ownerCards() {
    const { dui } = await callerDui()
    if (!dui) return []

    const [{ data: contracts }, { data: properties }] = await Promise.all([
        supabase
            .from('contract')
            .select(
                'contract_id, property_id, status, add_business!contract_property_id_fkey!inner(property_name, owner_id), users!contract_tenant_dui_fkey(first_name,last_name)'
            )
            .eq('add_business.owner_id', dui)
            .in('status', ['Active', 'Pending']),
        supabase.from('add_business').select('property_id, property_name, availability').eq('owner_id', dui),
    ])

    const list = contracts || []
    const cards = []

    const late = (await openPayments(list.filter((c) => c.status === 'Active').map((c) => c.contract_id))).find(
        (p) => p.status === 'Late'
    )
    if (late) {
        const c = list.find((x) => x.contract_id === late.contract_id)
        const tenant = [c?.users?.first_name, c?.users?.last_name].filter(Boolean).join(' ') || 'A tenant'
        cards.push({
            tone: 'bad',
            icon: 'bi-exclamation-triangle',
            title: `${tenant} is ${lateText(-daysUntil(late.payment_date))}`,
            subtitle: `${money(late.amount)} · ${c?.add_business?.property_name || ''}`,
            prompt: `Draft a friendly reminder for ${tenant} about the late rent.`,
        })
    }

    const requests = list.filter((c) => c.status === 'Pending')
    if (requests.length > 0) {
        const name = requests[0].add_business?.property_name
        cards.push({
            tone: 'warn',
            icon: 'bi-inbox',
            title: requests.length === 1 ? '1 lease request waiting' : `${requests.length} lease requests waiting`,
            subtitle: name || 'Review who applied',
            prompt: name ? `Which lease request should I accept for ${name}?` : 'Which lease request should I accept?',
        })
    }

    const leased = new Set(list.filter((c) => c.status === 'Active').map((c) => c.property_id))
    const vacant = (properties || []).find((p) => p.availability === 'Available' && !leased.has(p.property_id))
    if (vacant) {
        cards.push({
            tone: 'info',
            icon: 'bi-megaphone',
            title: `${vacant.property_name} has no tenant`,
            subtitle: 'Make the listing stand out',
            prompt: `How can I improve the listing for ${vacant.property_name}?`,
        })
    }

    if (!late && cards.length < 3) {
        cards.push({
            tone: 'good',
            icon: 'bi-check-circle',
            title: 'No late rent right now',
            subtitle: 'See what you will collect this year',
            prompt: 'How much will I still collect this year?',
        })
    }
    if (cards.length < 3) {
        cards.push({
            tone: 'info',
            icon: 'bi-clipboard-data',
            title: 'Portfolio check-up',
            subtitle: 'What needs attention first',
            prompt: 'Give me a quick overview of my portfolio and tell me what needs attention first.',
        })
    }
    return cards.slice(0, 3)
}

export function useAdvisorLiveCards(role, enabled = true) {
    const [cards, setCards] = useState([])

    useEffect(() => {
        if (!enabled) return undefined
        let cancelled = false
        const load = role === 'property-owner' ? ownerCards : businessCards
        load()
            .then((next) => {
                if (!cancelled) setCards(next)
            })
            .catch(() => {
                // The cards are a shortcut; the topics below still work.
            })
        return () => {
            cancelled = true
        }
    }, [role, enabled])

    return cards
}

export const BUSINESS_TOPICS = [
    {
        id: 'search',
        label: 'Find a space',
        icon: 'bi-search',
        prompts: [
            'Find me a local in San Salvador under $800',
            'What are the cheapest spaces with parking?',
            'Which area has the best prices for a restaurant?',
            'Show me spaces with water and electricity included',
        ],
    },
    {
        id: 'rent',
        label: 'My rent',
        icon: 'bi-credit-card',
        prompts: [
            'When is my next payment due?',
            'How much do I still owe this year?',
            'Am I late on anything?',
        ],
    },
    {
        id: 'leases',
        label: 'My leases',
        icon: 'bi-file-earmark-text',
        prompts: [
            'When does my lease end?',
            'Should I renew my lease?',
            'What should I check before signing a lease?',
        ],
    },
]

export const OWNER_TOPICS = [
    {
        id: 'portfolio',
        label: 'My portfolio',
        icon: 'bi-buildings',
        prompts: [
            'What needs my attention?',
            'Which property earns the most?',
            'Is my rent in line with the market?',
            'What if I raise the rent 10%?',
        ],
    },
    {
        id: 'rent',
        label: 'Collections',
        icon: 'bi-cash-coin',
        prompts: [
            'Who is late on rent?',
            'How much will I still collect this year?',
            'Draft a reminder for a late tenant',
        ],
    },
    {
        id: 'listings',
        label: 'Better listings',
        icon: 'bi-megaphone',
        prompts: [
            'Improve my listings',
            'Which listing needs better photos or details?',
            'Rewrite the description of my vacant space',
        ],
    },
]
