import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DOT, FLAG } from '../../../lib/symbols'
import { formatDueDate } from '../../../lib/rentSchedule'
import { money } from '../../../lib/leaseInsights'

// Single series (expected rent per month), so no legend: the card title
// names it. Blue slot-1 hue from the validated dataviz palette.
const BAR_COLOR = '#2a78d6'
const HEIGHT = 180
const PAD = { top: 12, right: 8, bottom: 28, left: 52 }

function compactMoney(value) {
    if (value >= 1000) return `$${Number((value / 1000).toFixed(2))}k`
    return `$${Math.round(value)}`
}

function niceStep(maxValue) {
    if (maxValue <= 0) return 100
    const raw = maxValue / 3
    const magnitude = 10 ** Math.floor(Math.log10(raw))
    for (const s of [1, 2, 5, 10]) {
        if (s * magnitude >= raw) return s * magnitude
    }
    return 10 * magnitude
}

function barPath(x, y, w, h) {
    if (h <= 0) return ''
    const r = Math.min(4, w / 2, h)
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

// projection: { months: [{ key, label, fullLabel, total, parts }], endings }
export default function IncomeProjectionChart({ projection, label, endingNote }) {
    const { t } = useTranslation()
    const chartLabel = label || t('projectionChart.label')
    const noteFor = endingNote || ((e) => t('projectionChart.endingNote', { rent: money(e.monthlyRent) }))
    const [hover, setHover] = useState(null)
    const [width, setWidth] = useState(560)
    const ref = useRef(null)

    useEffect(() => {
        const el = ref.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(([entry]) => {
            const next = Math.round(entry.contentRect.width)
            if (next > 0) setWidth(next)
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    const { months, endings } = projection
    const plotW = width - PAD.left - PAD.right
    const plotH = HEIGHT - PAD.top - PAD.bottom
    const dataMax = Math.max(...months.map((m) => m.total), 0)
    const step = niceStep(dataMax)
    const max = Math.max(step, Math.ceil(dataMax / step) * step)
    const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)
    const groupW = plotW / months.length
    const barW = Math.min(34, groupW - 16)
    const y = (v) => PAD.top + plotH - (v / max) * plotH
    const hovered = hover != null ? months[hover] : null
    const endingByMonth = Object.fromEntries(endings.map((e) => [e.endDate.slice(0, 7), e]))

    return (
        <div className="ns-projection">
            <div className="ns-collect-plot" ref={ref}>
                <svg
                    viewBox={`0 0 ${width} ${HEIGHT}`}
                    width={width}
                    height={HEIGHT}
                    role="img"
                    aria-label={chartLabel}
                    onMouseLeave={() => setHover(null)}
                >
                    {ticks.map((tick) => (
                        <g key={tick}>
                            <line
                                x1={PAD.left}
                                x2={width - PAD.right}
                                y1={y(tick)}
                                y2={y(tick)}
                                className={tick === 0 ? 'ns-collect-baseline' : 'ns-collect-grid'}
                            />
                            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="ns-collect-tick">
                                {compactMoney(tick)}
                            </text>
                        </g>
                    ))}
                    {months.map((m, i) => {
                        const cx = PAD.left + groupW * i + groupW / 2
                        const ending = endingByMonth[m.key]
                        return (
                            <g key={m.key}>
                                {hover === i && (
                                    <rect
                                        x={PAD.left + groupW * i + 2}
                                        y={PAD.top}
                                        width={groupW - 4}
                                        height={plotH}
                                        rx="6"
                                        className="ns-collect-hover-band"
                                    />
                                )}
                                <path d={barPath(cx - barW / 2, y(m.total), barW, y(0) - y(m.total))} fill={BAR_COLOR} />
                                <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="ns-collect-tick">
                                    {m.label}
                                </text>
                                {ending && (
                                    <text x={cx} y={PAD.top + 10} textAnchor="middle" className="ns-projection-flag">
                                        {FLAG} {t('projectionChart.leaseEnds')}
                                    </text>
                                )}
                                <rect
                                    x={PAD.left + groupW * i}
                                    y={PAD.top}
                                    width={groupW}
                                    height={plotH + PAD.bottom}
                                    fill="transparent"
                                    tabIndex={0}
                                    onMouseEnter={() => setHover(i)}
                                    onFocus={() => setHover(i)}
                                    onBlur={() => setHover(null)}
                                    aria-label={t('projectionChart.barAria', { month: m.fullLabel, amount: money(m.total) })}
                                />
                            </g>
                        )
                    })}
                </svg>
                {hovered && (
                    <div
                        className="ns-collect-tooltip"
                        style={{ left: `${((PAD.left + groupW * hover + groupW / 2) / width) * 100}%` }}
                        role="status"
                    >
                        <strong>
                            {hovered.fullLabel} {DOT} {money(hovered.total)}
                        </strong>
                        {hovered.parts.length === 0 && <em>{t('projectionChart.noRent')}</em>}
                        {hovered.parts.map((p) => (
                            <span key={p.name}>
                                {p.name} <b>{money(p.amount)}</b>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {endings.length > 0 && (
                <ul className="ns-projection-endings">
                    {endings.map((e) => (
                        <li key={e.contractId}>
                            <i className="bi bi-flag-fill"></i>{' '}
                            {t('projectionChart.ending', {
                                name: e.name,
                                date: formatDueDate(e.endDate),
                                days: e.daysLeft >= 0 ? t('projectionChart.inDays', { count: e.daysLeft }) : '',
                                note: noteFor(e),
                            })}
                        </li>
                    ))}
                </ul>
            )}

            <table className="visually-hidden">
                <caption>{chartLabel}</caption>
                <thead>
                    <tr>
                        <th>{t('docs.reports.month')}</th>
                        <th>{t('docs.reports.expected')}</th>
                    </tr>
                </thead>
                <tbody>
                    {months.map((m) => (
                        <tr key={m.key}>
                            <td>{m.fullLabel}</td>
                            <td>{money(m.total)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
