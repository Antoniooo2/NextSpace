import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../../i18n'
import { BRAND_VALUES } from '../../../lib/brand'
import { DOT } from '../../../lib/symbols'
import { supabase } from '../../../lib/supabaseClient'
import { money } from '../../../lib/contracts'
import { daysUntil, effectiveStatus, todayInElSalvador } from '../../../lib/rentSchedule'

// The three "live" cards on Rony's welcome screen. They come straight from
// the user's own rows (no AI call), and each one carries the question it
// asks Rony when tapped.

const t = (key, values) => i18n.t(`advisor.cards.${key}`, { ...BRAND_VALUES, ...values })

function lateText(days) {
    return i18n.t('rent.daysLate', { count: days })
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

    const nameOf = (c) => c?.add_business?.property_name || t('yourSpace')
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
            title: t('overdue', { amount: money(late.amount) }),
            subtitle: `${name} ${DOT} ${lateText(-daysUntil(late.payment_date))}`,
            prompt: t('latePrompt', { name }),
        })
    } else if (next) {
        const name = nameOf(byId.get(next.contract_id))
        const days = daysUntil(next.payment_date)
        cards.push({
            tone: days <= 7 ? 'warn' : 'info',
            icon: 'bi-calendar-event',
            title: t('dueTitle', {
                amount: money(next.amount),
                when:
                    days === 0
                        ? i18n.t('insights.tenant.today')
                        : days === 1
                          ? i18n.t('insights.tenant.tomorrow')
                          : i18n.t('insights.tenant.inDays', { count: days }),
            }),
            subtitle: t('nextRent', { name, dot: DOT }),
            prompt: t('nextPrompt'),
        })
    }

    const offer = (contracts || []).find((c) => c.status === 'Offered')
    if (offer) {
        cards.push({
            tone: 'warn',
            icon: 'bi-pen',
            title: t('offerTitle'),
            subtitle: nameOf(offer),
            prompt: t('offerPrompt', { name: nameOf(offer) }),
        })
    } else {
        const pending = (contracts || []).find((c) => c.status === 'Pending')
        if (pending) {
            cards.push({
                tone: 'info',
                icon: 'bi-hourglass-split',
                title: t('pendingTitle'),
                subtitle: nameOf(pending),
                prompt: t('pendingPrompt', { name: nameOf(pending) }),
            })
        }
    }

    const lastSaved = saved?.[0]?.add_business?.property_name
    if (lastSaved) {
        cards.push({
            tone: 'good',
            icon: 'bi-bookmark-heart',
            title: t('savedTitle'),
            subtitle: t('savedSubtitle', { name: lastSaved }),
            prompt: t('savedPrompt', { name: lastSaved }),
        })
    }

    if (cards.length < 3) {
        cards.push({
            tone: 'info',
            icon: 'bi-search',
            title: t('findTitle'),
            subtitle: t('findSubtitle'),
            prompt: t('findPrompt'),
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
        const tenant = [c?.users?.first_name, c?.users?.last_name].filter(Boolean).join(' ') || t('aTenant')
        cards.push({
            tone: 'bad',
            icon: 'bi-exclamation-triangle',
            title: t('tenantLate', { tenant, late: lateText(-daysUntil(late.payment_date)) }),
            subtitle: `${money(late.amount)} ${DOT} ${c?.add_business?.property_name || ''}`,
            prompt: t('reminderPrompt', { tenant }),
        })
    }

    const requests = list.filter((c) => c.status === 'Pending')
    if (requests.length > 0) {
        const name = requests[0].add_business?.property_name
        cards.push({
            tone: 'warn',
            icon: 'bi-inbox',
            title: t('requestsTitle', { count: requests.length }),
            subtitle: name || t('reviewApplied'),
            prompt: name ? t('requestsPromptName', { name }) : t('requestsPrompt'),
        })
    }

    const leased = new Set(list.filter((c) => c.status === 'Active').map((c) => c.property_id))
    const vacant = (properties || []).find((p) => p.availability === 'Available' && !leased.has(p.property_id))
    if (vacant) {
        cards.push({
            tone: 'info',
            icon: 'bi-megaphone',
            title: t('vacantTitle', { name: vacant.property_name }),
            subtitle: t('vacantSubtitle'),
            prompt: t('vacantPrompt', { name: vacant.property_name }),
        })
    }

    if (!late && cards.length < 3) {
        cards.push({
            tone: 'good',
            icon: 'bi-check-circle',
            title: t('noLateTitle'),
            subtitle: t('noLateSubtitle'),
            prompt: t('noLatePrompt'),
        })
    }
    if (cards.length < 3) {
        cards.push({
            tone: 'info',
            icon: 'bi-clipboard-data',
            title: t('checkupTitle'),
            subtitle: t('checkupSubtitle'),
            prompt: t('checkupPrompt'),
        })
    }
    return cards.slice(0, 3)
}

export function useAdvisorLiveCards(role, enabled = true) {
    const { i18n: i18next } = useTranslation()
    const language = i18next.language
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
    }, [role, enabled, language])

    return cards
}

function topic(id, icon, key) {
    return {
        id,
        icon,
        get label() {
            return i18n.t(`advisor.topics.${key}.label`)
        },
        get prompts() {
            return i18n.t(`advisor.topics.${key}.prompts`, { returnObjects: true })
        },
    }
}

export const BUSINESS_TOPICS = [
    topic('search', 'bi-search', 'businessSearch'),
    topic('rent', 'bi-credit-card', 'businessRent'),
    topic('leases', 'bi-file-earmark-text', 'businessLeases'),
]

export const OWNER_TOPICS = [
    topic('portfolio', 'bi-buildings', 'ownerPortfolio'),
    topic('rent', 'bi-cash-coin', 'ownerRent'),
    topic('listings', 'bi-megaphone', 'ownerListings'),
]
