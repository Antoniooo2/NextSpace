import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PAYMENT_STATUS_LABEL, formatDueDate, todayInElSalvador } from '../../../lib/rentSchedule'
import { paymentMethodLabel } from '../../../lib/displayValues'
import { DOT } from '../../../lib/symbols'
import { daysLate, monthLabel, money, svDateOf, tenantName } from '../../../lib/leaseInsights'
import { awaitingTransfer, contractRate, paymentSplit } from '../../../lib/platformFee'

const STATUS_FILTERS = ['all', 'Paid', 'Pending', 'Late']

const MONTHS_PAGE = 6

const STATUS_ICON = {
    Paid: 'bi-check-circle-fill',
    Pending: 'bi-clock-fill',
    Late: 'bi-exclamation-octagon-fill',
}

// Rent history as a feed grouped by month (newest first) with search and
// filters, instead of one long table. Only months that have come due or were
// paid; future months live in the timeline. rows carry `.contract`.
export default function PaymentHistory({ rows, viewer = 'tenant', onOpen, onReceipt, receiptBusyId, feeRate }) {
    const { t } = useTranslation()
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
            // What the owner gets from the paid months, after the NextSpace fee.
            paidNet: items
                .filter((p) => p.status === 'Paid')
                .reduce((s, p) => s + paymentSplit(p, contractRate(p.contract, feeRate)).net, 0),
            total: items.reduce((s, p) => s + Number(p.amount), 0),
        }))
    }, [filtered, feeRate])

    const visible = groups.slice(0, pages * MONTHS_PAGE)
    const filtersActive = query || status !== 'all' || leaseId !== 'all' || year !== 'all'

    if (history.length === 0) {
        return <p className="ns-pay-muted mb-0">{t('history.empty')}</p>
    }

    return (
        <div className="ns-history">
            <div className="ns-history-controls">
                <div className="ns-history-search">
                    <i className="bi bi-search"></i>
                    <input
                        type="search"
                        placeholder={viewer === 'owner' ? t('history.searchOwner') : t('history.searchTenant')}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                            setPages(1)
                        }}
                        aria-label={t('history.searchLabel')}
                    />
                </div>
                <div className="ns-segmented" role="radiogroup" aria-label={t('docs.reports.status')}>
                    {STATUS_FILTERS.map((id) => (
                        <button
                            type="button"
                            key={id}
                            role="radio"
                            aria-checked={status === id}
                            className={status === id ? 'active' : ''}
                            onClick={() => {
                                setStatus(id)
                                setPages(1)
                            }}
                        >
                            {id === 'all' ? t('common.all') : PAYMENT_STATUS_LABEL[id]}
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
                        aria-label={t('common.property')}
                    >
                        <option value="all">{t('history.allProperties')}</option>
                        {leases.map((c) => (
                            <option key={c.contract_id} value={c.contract_id}>
                                {c.add_business?.property_name || t('contractDetail.contractNumber', { id: c.contract_id })}
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
                        aria-label={t('history.year')}
                    >
                        <option value="all">{t('history.allYears')}</option>
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
                    <p className="ns-pay-muted mb-2">{t('history.noMatch')}</p>
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
                            {t('marketplace.clearFilters')}
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
                                    {group.paid < group.total
                                        ? t('history.paidOf', { paid: money(group.paid), total: money(group.total) })
                                        : t('history.paid', { paid: money(group.paid) })}
                                    {viewer === 'owner' && group.paid > 0 ? ` ${DOT} ${t('ownerPayments.next30.toYou', { amount: money(group.paidNet) })}` : ''}
                                </span>
                            </header>
                            <ul>
                                {group.items.map((p) => {
                                    const late = daysLate(p, today)
                                    const property = p.contract?.add_business?.property_name || t('propertyDetail.rent')
                                    const title = viewer === 'owner' ? `${tenantName(p.contract?.users)} ${DOT} ${property}` : property
                                    const due = t('history.due', { date: formatDueDate(p.payment_date, { month: 'short', day: 'numeric' }) })
                                    const meta =
                                        p.status === 'Paid'
                                            ? `${t('history.paidOn', { date: formatDueDate(svDateOf(p.paid_at || p.payment_date), { month: 'short', day: 'numeric' }) })} ${DOT} ${
                                                  late > 0 ? t('rent.daysLate', { count: late }) : t('leaseDetail.activity.onTime')
                                              }${p.payment_method ? ` ${DOT} ${paymentMethodLabel(p.payment_method)}` : ''}`
                                            : p.status === 'Late'
                                              ? `${due} ${DOT} ${t('rent.daysLate', { count: late })}`
                                              : due
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
                                                    <small>
                                                        {viewer === 'owner' && p.status === 'Paid'
                                                            ? `${t('ownerPayments.next30.toYou', { amount: money(paymentSplit(p, contractRate(p.contract, feeRate)).net) })}${
                                                                  awaitingTransfer(p) ? ` ${DOT} ${t('history.pendingTransfer')}` : ''
                                                              }`
                                                            : PAYMENT_STATUS_LABEL[p.status] || p.status}
                                                    </small>
                                                </span>
                                            </button>
                                            {p.status === 'Paid' && onReceipt && (
                                                <button
                                                    type="button"
                                                    className="ns-pay-icon-btn"
                                                    onClick={() => onReceipt(p)}
                                                    disabled={receiptBusyId === p.payment_id}
                                                    title={t('paymentDetail.downloadReceipt')}
                                                    aria-label={t('paymentDetail.downloadReceipt')}
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
                            {t('history.showOlder', { count: groups.length - visible.length })}
                        </button>
                    )}
                </>
            )}
        </div>
    )
}
