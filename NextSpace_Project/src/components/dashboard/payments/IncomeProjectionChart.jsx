import { useEffect, useRef, useState } from 'react'
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
export default function IncomeProjectionChart({
    projection,
    label = 'Expected rent for the next six months',
    endingNote = (e) => `${money(e.monthlyRent)}/month less after that.`,
}) {
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
                    aria-label={label}
                    onMouseLeave={() => setHover(null)}
                >
                    {ticks.map((t) => (
                        <g key={t}>
                            <line
                                x1={PAD.left}
                                x2={width - PAD.right}
                                y1={y(t)}
                                y2={y(t)}
                                className={t === 0 ? 'ns-collect-baseline' : 'ns-collect-grid'}
                            />
                            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="ns-collect-tick">
                                {compactMoney(t)}
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
                                        ⚑ lease ends
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
                                    aria-label={`${m.fullLabel}: ${money(m.total)} expected`}
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
                            {hovered.fullLabel} · {money(hovered.total)}
                        </strong>
                        {hovered.parts.length === 0 && <em>No rent scheduled</em>}
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
                            <i className="bi bi-flag-fill"></i> {e.name}'s lease ends {formatDueDate(e.endDate)}
                            {e.daysLeft >= 0 && ` (in ${e.daysLeft} days)`} — {endingNote(e)}
                        </li>
                    ))}
                </ul>
            )}

            <table className="visually-hidden">
                <caption>{label}</caption>
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Expected</th>
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
