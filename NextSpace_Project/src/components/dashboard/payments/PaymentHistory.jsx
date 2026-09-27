import { useMemo, useState } from 'react'
import { formatDueDate, todayInElSalvador } from '../../../lib/rentSchedule'
import { daysLate, monthLabel, money, svDateOf, tenantName } from '../../../lib/leaseInsights'

const STATUS_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'Paid', label: 'Paid' },
    { id: 'Pending', label: 'Due' },
    { id: 'Late', label: 'Late' },
]

const MONTHS_PAGE = 6

const STATUS_ICON = {
    Paid: 'bi-check-circle-fill',
    Pending: 'bi-clock-fill',
    Late: 'bi-exclamation-octagon-fill',
}

// Rent history as a feed grouped by month (newest first) with search and
// filters, instead of one long table. Only months that have come due or were
// paid; future months live in the timeline. rows carry `.contract`.
export default function PaymentHistory({ rows, viewer = 'tenant', onOpen, onReceipt, receiptBusyId }) {
    const today = todayInElSalvador()
    const [query, setQuery] = useState('')
    const [status, setStatus] = useState('all')
    const [leaseId, setLeaseId] = useState('all')
    const [year, setYear] = useState('all')
    const [pages, setPages] = useState(1)

    const history = useMemo(
        () => rows.filter((p) => p.status !== 'Scheduled').sort((a, b) => b.payment_date.localeCompare(a.payment_date)),
        [rows]
    )

    const leases = useMemo(() => {
        const seen = new Map()
        for (const p of history) {
            if (p.contract && !seen.has(p.contract.contract_id)) seen.set(p.contract.contract_id, p.contract)
        }
        return [...seen.values()]
    }, [history])

    const years = useMemo(() => [...new Set(history.map((p) => p.payment_date.slice(0, 4)))], [history])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return history.filter((p) => {
            if (status !== 'all' && p.status !== status) return false
            if (leaseId !== 'all' && p.contract?.contract_id !== Number(leaseId)) return false
            if (year !== 'all' && !p.payment_date.startsWith(year)) return false
            if (!q) return true
            const haystack = [
                p.contract?.add_business?.property_name,
                viewer === 'owner' ? tenantName(p.contract?.users) : '',
                monthLabel(p.payment_date.slice(0, 7), 'long'),
                p.wompi_transaction_id,
                String(p.amount),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
            return haystack.includes(q)
        })
    }, [history, query, status, leaseId, year, viewer])

    const groups = useMemo(() => {
        const byMonth = new Map()
        for (const p of filtered) {
            const key = p.payment_date.slice(0, 7)
            if (!byMonth.has(key)) byMonth.set(key, [])
            byMonth.get(key).push(p)
        }
        return [...byMonth.entries()].map(([key, items]) => ({
            key,
            items,
            paid: items.filter((p) => p.status === 'Paid').reduce((s, p) => s + Number(p.amount), 0),
            total: items.reduce((s, p) => s + Number(p.amount), 0),
        }))
    }, [filtered])

    const visible = groups.slice(0, pages * MONTHS_PAGE)
    const filtersActive = query || status !== 'all' || leaseId !== 'all' || year !== 'all'

    if (history.length === 0) {
        return <p className="ns-pay-muted mb-0">Nothing has come due yet.</p>
    }

    return (
        <div className="ns-history">
            <div className="ns-history-controls">
                <div className="ns-history-search">
                    <i className="bi bi-search"></i>
                    <input
                        type="search"
                        placeholder={viewer === 'owner' ? 'Search tenant, property, month...' : 'Search property, month, amount...'}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                            setPages(1)
                        }}
                        aria-label="Search payment history"
                    />
                </div>
                <div className="ns-segmented" role="radiogroup" aria-label="Status">
                    {STATUS_FILTERS.map((f) => (
                        <button
                            type="button"
                            key={f.id}
                            role="radio"
                            aria-checked={status === f.id}
                            className={status === f.id ? 'active' : ''}
                            onClick={() => {
                                setStatus(f.id)
                                setPages(1)
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                {leases.length > 1 && (
                    <select
                        className="form-select ns-history-select"
                        value={leaseId}
                        onChange={(e) => {
                            setLeaseId(e.target.value)
                            setPages(1)
                        }}
                        aria-label="Property"
                    >
                        <option value="all">All properties</option>
                        {leases.map((c) => (
                            <option key={c.contract_id} value={c.contract_id}>
                                {c.add_business?.property_name || `Contract #${c.contract_id}`}
                            </option>
                        ))}
                    </select>
                )}
                {years.length > 1 && (
                    <select
                        className="form-select ns-history-select"
                        value={year}
                        onChange={(e) => {
                            setYear(e.target.value)
                            setPages(1)
                        }}
                        aria-label="Year"
                    >
                        <option value="all">All years</option>
                        {years.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {groups.length === 0 ? (
                <div className="ns-history-empty">
                    <p className="ns-pay-muted mb-2">No payments match these filters.</p>
                    {filtersActive && (
                        <button
                            type="button"
                            className="ns-link-btn"
                            onClick={() => {
                                setQuery('')
                                setStatus('all')
                                setLeaseId('all')
                                setYear('all')
                            }}
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {visible.map((group) => (
                        <section key={group.key} className="ns-history-group">
                            <header>
                                <h4>{monthLabel(group.key, 'long')}</h4>
                                <span>
                                    {money(group.paid)} paid{group.paid < group.total ? ` of ${money(group.total)}` : ''}
                                </span>
                            </header>
                            <ul>
                                {group.items.map((p) => {
                                    const late = daysLate(p, today)
                                    const property = p.contract?.add_business?.property_name || 'Rent'
                                    const title = viewer === 'owner' ? `${tenantName(p.contract?.users)} · ${property}` : property
                                    const meta =
                                        p.status === 'Paid'
                                            ? `Paid ${formatDueDate(svDateOf(p.paid_at || p.payment_date), { month: 'short', day: 'numeric' })} · ${late > 0 ? `${late} days late` : 'on time'}${p.payment_method ? ` · ${p.payment_method}` : ''}`
                                            : p.status === 'Late'
                                              ? `Due ${formatDueDate(p.payment_date, { month: 'short', day: 'numeric' })} · ${late} days late`
                                              : `Due ${formatDueDate(p.payment_date, { month: 'short', day: 'numeric' })}`
                                    return (
                                        <li key={p.payment_id} className={`status-${p.status.toLowerCase()}`}>
                                            <button type="button" className="ns-history-row" onClick={() => onOpen?.(p)}>
                                                <i className={`bi ${STATUS_ICON[p.status] || 'bi-circle'}`} aria-hidden="true"></i>
                                                <span className="ns-history-main">
                                                    <strong>{title}</strong>
                                                    <small>{meta}</small>
                                                </span>
                                                <span className="ns-history-amount">
                                                    {money(p.amount)}
                                                    <small>{p.status === 'Pending' ? 'Due' : p.status}</small>
                                                </span>
                                            </button>
                                            {p.status === 'Paid' && onReceipt && (
                                                <button
                                                    type="button"
                                                    className="ns-pay-icon-btn"
                                                    onClick={() => onReceipt(p)}
                                                    disabled={receiptBusyId === p.payment_id}
                                                    title="Download receipt (PDF)"
                                                    aria-label="Download receipt (PDF)"
                                                >
                                                    <i className="bi bi-file-earmark-pdf"></i>
                                                </button>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    ))}
                    {groups.length > visible.length && (
                        <button type="button" className="ns-outline-btn ns-history-more" onClick={() => setPages((n) => n + 1)}>
                            Show older months ({groups.length - visible.length} more)
                        </button>
                    )}
                </>
            )}
        </div>
    )
}
