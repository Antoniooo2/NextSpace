// Numbers about a lease's rent history, computed from its installments
// (one payment row per month; payment_date = due date). Shared by the owner
// and tenant Payments screens so both sides always see the same figures.
import { daysUntil, effectiveStatus, formatDueDate, isPayable, todayInElSalvador } from './rentSchedule'
import { money } from './money'
import i18n, { currentLocale } from '../i18n'
import { BRAND_VALUES } from './brand'

export { money }

const t = (key, values) => i18n.t(key, { ...BRAND_VALUES, ...values })

// Calendar date (YYYY-MM-DD) in El Salvador of a timestamptz string.
export function svDateOf(timestamp) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date(timestamp))
}

export function monthKeyShift(monthKey, offset) {
    const [y, m] = monthKey.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + offset, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(monthKey, month = 'short') {
    const [y, m] = monthKey.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(currentLocale(), {
        month,
        year: month === 'long' ? 'numeric' : undefined,
        timeZone: 'UTC',
    })
}

function sum(rows) {
    return rows.reduce((total, p) => total + Number(p.amount || 0), 0)
}

// Installments of one lease with today's status, oldest first, no cancelled.
export function leaseInstallments(payments, today = todayInElSalvador()) {
    return payments
        .filter((p) => p.status !== 'Cancelled')
        .map((p) => ({ ...p, status: effectiveStatus(p, today) }))
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
}

// Days a month was (or still is) late: paid after the due date, or unpaid
// past it. 0 when paid on time or not due yet.
export function daysLate(p, today = todayInElSalvador()) {
    if (p.status === 'Paid') {
        if (!p.paid_at) return 0
        // daysUntil(a, b) is a - b in days: paid date minus due date.
        return Math.max(0, daysUntil(svDateOf(p.paid_at), p.payment_date))
    }
    if (p.status === 'Late') return Math.max(0, -daysUntil(p.payment_date, today))
    return 0
}

export function leaseStats(installments, today = todayInElSalvador()) {
    const due = installments.filter((p) => p.payment_date <= today)
    const paid = installments.filter((p) => p.status === 'Paid')
    const paidOnTime = due.filter((p) => p.status === 'Paid' && daysLate(p, today) === 0)
    const owed = installments.filter((p) => isPayable(p.status))
    const late = installments.filter((p) => p.status === 'Late')
    const lateDays = due.map((p) => daysLate(p, today))
    const unpaid = installments.filter((p) => p.status !== 'Paid')

    return {
        monthsTotal: installments.length,
        monthsPaid: paid.length,
        monthsDue: due.length,
        paidOnTime: paidOnTime.length,
        onTimeRate: due.length > 0 ? paidOnTime.length / due.length : null,
        avgDaysLate: due.length > 0 ? lateDays.reduce((a, b) => a + b, 0) / due.length : 0,
        owedNow: sum(owed),
        owedMonths: owed,
        lateMonths: late.length,
        oldestLateDays: late.length > 0 ? daysLate(late[0], today) : 0,
        nextUnpaid: unpaid[0] || null,
        collectedTotal: sum(paid),
        remainingTotal: sum(unpaid),
        remainingMonths: unpaid.length,
        leaseTotal: sum(installments),
    }
}

// Payment risk of a tenant on one lease, from how they have actually paid.
export function riskLevel(stats) {
    if (stats.monthsDue === 0) {
        return { level: 'new', label: t('risk.new'), reasons: [t('risk.reasons.noHistory')] }
    }

    const reasons = []
    const onTimePct = Math.round((stats.onTimeRate ?? 0) * 100)
    reasons.push(t('risk.reasons.paidOnTime', { count: stats.monthsDue, paid: stats.paidOnTime, pct: onTimePct }))
    if (stats.lateMonths > 0) {
        reasons.push(t('risk.reasons.lateMonths', { count: stats.lateMonths, days: stats.oldestLateDays }))
    }
    if (stats.avgDaysLate >= 1) reasons.push(t('risk.reasons.avgLate', { days: stats.avgDaysLate.toFixed(1) }))

    if (stats.oldestLateDays > 15 || stats.lateMonths >= 2 || (stats.monthsDue >= 2 && stats.onTimeRate < 0.5)) {
        return { level: 'high', label: t('risk.high'), reasons }
    }
    if (stats.lateMonths > 0 || stats.onTimeRate < 0.85 || stats.avgDaysLate > 3) {
        return { level: 'medium', label: t('risk.medium'), reasons }
    }
    return { level: 'low', label: t('risk.low'), reasons }
}

// Share of the lease's calendar time that has passed (0..1).
export function leaseTimeProgress(contract, today = todayInElSalvador()) {
    if (!contract.start_date || !contract.end_date) return 0
    const total = daysUntil(contract.end_date, contract.start_date)
    if (total <= 0) return 1
    const elapsed = daysUntil(today, contract.start_date)
    return Math.min(1, Math.max(0, elapsed / total))
}

export function tenantName(users) {
    return users ? `${users.first_name} ${users.last_name}` : t('common.tenant')
}

// leases: [{ contract, installments, stats }]. Expected rent per month for
// the next `count` months (current month first), plus which leases end.
export function incomeProjection(leases, today = todayInElSalvador(), count = 6) {
    const start = today.slice(0, 7)
    const keys = Array.from({ length: count }, (_, i) => monthKeyShift(start, i))
    const months = keys.map((key) => {
        const parts = leases
            .map(({ contract, installments }) => ({
                name: contract.add_business?.property_name || t('common.property'),
                amount: sum(installments.filter((p) => p.payment_date.slice(0, 7) === key)),
            }))
            .filter((p) => p.amount > 0)
        return { key, label: monthLabel(key), fullLabel: monthLabel(key, 'long'), total: sum(parts), parts }
    })

    const endings = leases
        .filter(({ contract }) => contract.end_date && contract.end_date.slice(0, 7) >= start && contract.end_date.slice(0, 7) <= keys[keys.length - 1])
        .map(({ contract }) => ({
            contractId: contract.contract_id,
            name: contract.add_business?.property_name || t('common.property'),
            endDate: contract.end_date,
            monthlyRent: Number(contract.monthly_rent || 0),
            daysLeft: daysUntil(contract.end_date, today),
        }))
        .sort((a, b) => a.endDate.localeCompare(b.endDate))

    return { months, endings }
}

// What Rony points out on the owner's overview, most urgent first. Each item
// may carry an action the card turns into a button.
export function ownerInsights({ leases, thisMonth, projection, today = todayInElSalvador() }) {
    const items = []

    const late = leases
        .filter(({ stats }) => stats.lateMonths > 0)
        .sort((a, b) => b.stats.oldestLateDays - a.stats.oldestLateDays)
    for (const { contract, stats } of late) {
        items.push({
            tone: 'danger',
            icon: 'bi-exclamation-octagon-fill',
            text: t('insights.owner.late', {
                count: stats.oldestLateDays,
                tenant: tenantName(contract.users),
                name: contract.add_business?.property_name || t('insights.owner.theirLease'),
                owed: money(stats.owedNow),
                over: stats.lateMonths > 1 ? t('insights.overMonths', { count: stats.lateMonths }) : '',
            }),
            action: { type: 'open-lease', contractId: contract.contract_id, label: t('insights.owner.sendReminder') },
        })
    }

    if (thisMonth.expected > 0) {
        const pct = Math.round((thisMonth.collected / thisMonth.expected) * 100)
        items.push({
            tone: pct >= 100 ? 'success' : 'info',
            icon: 'bi-cash-stack',
            text: t('insights.owner.collected', { collected: money(thisMonth.collected), expected: money(thisMonth.expected), pct }),
        })
    }

    const week = leases.flatMap(({ contract, installments }) =>
        installments
            .filter((p) => p.status !== 'Paid' && p.status !== 'Late')
            .filter((p) => {
                const d = daysUntil(p.payment_date, today)
                return d >= 0 && d <= 7
            })
            .map((p) => ({ contract, p }))
    )
    if (week.length > 0) {
        const tenants = new Set(week.map((w) => w.contract.contract_id)).size
        items.push({
            tone: 'info',
            icon: 'bi-calendar-check',
            text: t('insights.owner.dueThisWeek', { amount: money(sum(week.map((w) => w.p))), count: tenants }),
        })
    }

    for (const ending of projection.endings) {
        if (ending.daysLeft < 0 || ending.daysLeft > 90) continue
        const lease = leases.find((l) => l.contract.contract_id === ending.contractId)
        const reliable = lease && riskLevel(lease.stats).level === 'low'
        items.push({
            tone: 'warning',
            icon: 'bi-hourglass-split',
            text:
                t('insights.owner.leaseEnds', { name: ending.name, count: ending.daysLeft, rent: money(ending.monthlyRent) }) +
                (reliable ? t('insights.owner.goodCandidate') : ''),
            action:
                ending.daysLeft <= 90
                    ? {
                          type: 'open-contract',
                          contractId: ending.contractId,
                          label: lease?.contract.renewal_requested_at ? t('insights.owner.answerRenewal') : t('insights.owner.offerRenewal'),
                      }
                    : {
                          type: 'ask-rony',
                          label: t('insights.owner.askRony'),
                          text: t('insights.owner.askRonyText', { name: ending.name, date: formatDueDate(ending.endDate) }),
                      },
        })
    }

    if (late.length === 0 && leases.length > 0) {
        items.push({ tone: 'success', icon: 'bi-check-circle-fill', text: t('insights.owner.noneLate') })
    }

    return items
}

// What Rony points out on the tenant's Payments screen, most urgent first.
// leases: [{ contract, installments, stats }].
export function tenantInsights({ leases, today = todayInElSalvador() }) {
    const items = []

    for (const { contract, stats } of leases) {
        const name = contract.add_business?.property_name || t('insights.tenant.yourLease')
        if (stats.lateMonths > 0) {
            items.push({
                tone: 'danger',
                icon: 'bi-exclamation-octagon-fill',
                text: t('insights.tenant.late', {
                    name,
                    count: stats.oldestLateDays,
                    owed: money(stats.owedNow),
                    over: stats.lateMonths > 1 ? t('insights.overMonths', { count: stats.lateMonths }) : '',
                }),
                action: { type: 'select-lease', contractId: contract.contract_id, label: t('insights.tenant.payNow') },
            })
        } else if (stats.owedNow > 0 && stats.nextUnpaid) {
            const d = daysUntil(stats.nextUnpaid.payment_date, today)
            const when = d === 0 ? t('insights.tenant.today') : d === 1 ? t('insights.tenant.tomorrow') : t('insights.tenant.inDays', { count: d })
            items.push({
                tone: 'warning',
                icon: 'bi-clock-fill',
                text: t('insights.tenant.due', { amount: money(stats.nextUnpaid.amount), name, when }),
                action: { type: 'select-lease', contractId: contract.contract_id, label: t('insights.tenant.payNow') },
            })
        }
    }

    const owing = leases.filter(({ stats }) => stats.owedNow > 0)
    if (owing.length > 1) {
        const total = owing.reduce((s, { stats }) => s + stats.owedNow, 0)
        items.push({
            tone: 'info',
            icon: 'bi-wallet2',
            text: t('insights.tenant.totalOwed', { total: money(total), count: owing.length }),
        })
    }

    for (const { contract, stats } of leases) {
        if (!contract.end_date) continue
        const left = daysUntil(contract.end_date, today)
        if (left < 0 || left > 90 || contract.termination_requested_at) continue
        const name = contract.add_business?.property_name || t('insights.tenant.yourLease')
        if (contract.renewal_offered_at) {
            items.push({
                tone: 'warning',
                icon: 'bi-arrow-repeat',
                text: t('insights.tenant.renewalOffered', { name, rent: money(contract.renewal_rent) }),
                action: { type: 'open-contract', contractId: contract.contract_id, label: t('insights.tenant.reviewRenewal') },
            })
            continue
        }
        if (contract.renewal_requested_at) {
            items.push({
                tone: 'info',
                icon: 'bi-arrow-repeat',
                text: t('insights.tenant.renewalRequested', { name }),
            })
            continue
        }
        const record =
            stats.monthsDue > 0 && stats.paidOnTime === stats.monthsDue ? t('insights.tenant.strongRecord', { count: stats.monthsDue }) : ''
        items.push({
            tone: 'warning',
            icon: 'bi-hourglass-split',
            text: t('insights.tenant.leaseEnds', { name, count: left, date: formatDueDate(contract.end_date) }) + record,
            action: { type: 'renewal-request', contractId: contract.contract_id, label: t('insights.tenant.askToRenew') },
        })
    }

    if (owing.length === 0 && leases.length > 0) {
        const next = leases
            .map(({ contract, stats }) => ({ contract, p: stats.nextUnpaid }))
            .filter((x) => x.p)
            .sort((a, b) => a.p.payment_date.localeCompare(b.p.payment_date))[0]
        items.push({
            tone: 'success',
            icon: 'bi-check-circle-fill',
            text: next
                ? t('insights.tenant.upToDateNext', {
                      amount: money(next.p.amount),
                      name: next.contract.add_business?.property_name || t('insights.tenant.yourLease'),
                      date: formatDueDate(next.p.payment_date),
                  })
                : t('insights.tenant.allPaid'),
        })
    }

    const streak = leases.filter(({ stats }) => stats.monthsDue >= 3 && stats.paidOnTime === stats.monthsDue)
    for (const { contract, stats } of streak) {
        items.push({
            tone: 'success',
            icon: 'bi-award-fill',
            text: t('insights.tenant.streak', { count: stats.monthsDue, name: contract.add_business?.property_name || t('insights.tenant.yourLease') }),
        })
    }

    return items
}
