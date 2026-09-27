// Numbers about a lease's rent history, computed from its installments
// (one payment row per month; payment_date = due date). Shared by the owner
// and tenant Payments screens so both sides always see the same figures.
import { daysUntil, effectiveStatus, isPayable, todayInElSalvador } from './rentSchedule'

export function money(value) {
    return `$${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

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
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
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
        return { level: 'new', label: 'New lease', reasons: ['No rent has come due yet, so there is no payment history.'] }
    }

    const reasons = []
    const onTimePct = Math.round((stats.onTimeRate ?? 0) * 100)
    reasons.push(`${stats.paidOnTime} of ${stats.monthsDue} months paid on time (${onTimePct}%).`)
    if (stats.lateMonths > 0) {
        reasons.push(
            `${stats.lateMonths} ${stats.lateMonths === 1 ? 'month' : 'months'} unpaid and late, the oldest ${stats.oldestLateDays} days.`
        )
    }
    if (stats.avgDaysLate >= 1) reasons.push(`On average rent arrives ${stats.avgDaysLate.toFixed(1)} days late.`)

    if (stats.oldestLateDays > 15 || stats.lateMonths >= 2 || (stats.monthsDue >= 2 && stats.onTimeRate < 0.5)) {
        return { level: 'high', label: 'High risk', reasons }
    }
    if (stats.lateMonths > 0 || stats.onTimeRate < 0.85 || stats.avgDaysLate > 3) {
        return { level: 'medium', label: 'Watch', reasons }
    }
    return { level: 'low', label: 'Reliable', reasons }
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
    return users ? `${users.first_name} ${users.last_name}` : 'Tenant'
}

// leases: [{ contract, installments, stats }]. Expected rent per month for
// the next `count` months (current month first), plus which leases end.
export function incomeProjection(leases, today = todayInElSalvador(), count = 6) {
    const start = today.slice(0, 7)
    const keys = Array.from({ length: count }, (_, i) => monthKeyShift(start, i))
    const months = keys.map((key) => {
        const parts = leases
            .map(({ contract, installments }) => ({
                name: contract.add_business?.property_name || 'Property',
                amount: sum(installments.filter((p) => p.payment_date.slice(0, 7) === key)),
            }))
            .filter((p) => p.amount > 0)
        return { key, label: monthLabel(key), fullLabel: monthLabel(key, 'long'), total: sum(parts), parts }
    })

    const endings = leases
        .filter(({ contract }) => contract.end_date && contract.end_date.slice(0, 7) >= start && contract.end_date.slice(0, 7) <= keys[keys.length - 1])
        .map(({ contract }) => ({
            contractId: contract.contract_id,
            name: contract.add_business?.property_name || 'Property',
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
            text: `${tenantName(contract.users)} is ${stats.oldestLateDays} ${stats.oldestLateDays === 1 ? 'day' : 'days'} late on ${contract.add_business?.property_name || 'their lease'} — ${money(stats.owedNow)} owed${stats.lateMonths > 1 ? ` over ${stats.lateMonths} months` : ''}.`,
            action: { type: 'open-lease', contractId: contract.contract_id, label: 'Send a reminder' },
        })
    }

    if (thisMonth.expected > 0) {
        const pct = Math.round((thisMonth.collected / thisMonth.expected) * 100)
        items.push({
            tone: pct >= 100 ? 'success' : 'info',
            icon: 'bi-cash-stack',
            text: `This month you've collected ${money(thisMonth.collected)} of ${money(thisMonth.expected)} expected (${pct}%).`,
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
            text: `${money(sum(week.map((w) => w.p)))} is due in the next 7 days from ${tenants} ${tenants === 1 ? 'tenant' : 'tenants'}.`,
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
                `${ending.name}'s lease ends in ${ending.daysLeft} days — your expected rent drops by ${money(ending.monthlyRent)}/month after that.` +
                (reliable ? ' The tenant has paid on time, a good candidate to renew.' : ''),
            action:
                ending.daysLeft <= 60
                    ? { type: 'open-lease', contractId: ending.contractId, label: 'Offer renewal' }
                    : {
                          type: 'ask-rony',
                          label: 'Ask Rony',
                          text: `${ending.name}'s lease ends on ${ending.endDate}. Should I offer a renewal or re-list it, and at what rent?`,
                      },
        })
    }

    if (late.length === 0 && leases.length > 0) {
        items.push({ tone: 'success', icon: 'bi-check-circle-fill', text: 'No tenant is late on rent.' })
    }

    return items
}

// What Rony points out on the tenant's Payments screen, most urgent first.
// leases: [{ contract, installments, stats }].
export function tenantInsights({ leases, today = todayInElSalvador() }) {
    const items = []

    for (const { contract, stats } of leases) {
        const name = contract.add_business?.property_name || 'your lease'
        if (stats.lateMonths > 0) {
            items.push({
                tone: 'danger',
                icon: 'bi-exclamation-octagon-fill',
                text: `Your rent for ${name} is ${stats.oldestLateDays} ${stats.oldestLateDays === 1 ? 'day' : 'days'} late — ${money(stats.owedNow)} owed${stats.lateMonths > 1 ? ` over ${stats.lateMonths} months` : ''}. Months are paid oldest first.`,
                action: { type: 'select-lease', contractId: contract.contract_id, label: 'Pay now' },
            })
        } else if (stats.owedNow > 0 && stats.nextUnpaid) {
            const d = daysUntil(stats.nextUnpaid.payment_date, today)
            items.push({
                tone: 'warning',
                icon: 'bi-clock-fill',
                text: `${money(stats.nextUnpaid.amount)} for ${name} is due ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}.`,
                action: { type: 'select-lease', contractId: contract.contract_id, label: 'Pay now' },
            })
        }
    }

    const owing = leases.filter(({ stats }) => stats.owedNow > 0)
    if (owing.length > 1) {
        const total = owing.reduce((s, { stats }) => s + stats.owedNow, 0)
        items.push({
            tone: 'info',
            icon: 'bi-wallet2',
            text: `In total you owe ${money(total)} right now across ${owing.length} leases.`,
        })
    }

    for (const { contract, stats } of leases) {
        if (!contract.end_date) continue
        const left = daysUntil(contract.end_date, today)
        if (left < 0 || left > 60) continue
        const name = contract.add_business?.property_name || 'your lease'
        const record =
            stats.monthsDue > 0 && stats.paidOnTime === stats.monthsDue
                ? ` You've paid all ${stats.monthsDue} months on time, a strong case for renewing.`
                : ''
        items.push({
            tone: 'warning',
            icon: 'bi-hourglass-split',
            text: `Your lease for ${name} ends in ${left} days (${contract.end_date}).${record}`,
            action: { type: 'renewal-request', contractId: contract.contract_id, label: 'Ask to renew' },
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
                ? `You're up to date on every lease. Next payment: ${money(next.p.amount)} for ${next.contract.add_business?.property_name || 'your lease'} on ${next.p.payment_date}.`
                : "You're up to date and every month of your leases is paid.",
        })
    }

    const streak = leases.filter(({ stats }) => stats.monthsDue >= 3 && stats.paidOnTime === stats.monthsDue)
    for (const { contract, stats } of streak) {
        items.push({
            tone: 'success',
            icon: 'bi-award-fill',
            text: `${stats.monthsDue} months in a row paid on time for ${contract.add_business?.property_name || 'your lease'}. Nice record.`,
        })
    }

    return items
}
