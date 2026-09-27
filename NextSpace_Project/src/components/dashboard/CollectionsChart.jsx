import { useEffect, useRef, useState } from 'react'

// Two-series ordinal pair from one blue ramp (validated with the dataviz
// palette validator, --ordinal): light = expected, dark = collected.
const EXPECTED_COLOR = '#86b6ef'
const COLLECTED_COLOR = '#1c5cab'

const HEIGHT = 220
const PAD = { top: 12, right: 8, bottom: 28, left: 52 }

function compactMoney(value) {
    if (value >= 1000) return `$${Number((value / 1000).toFixed(2))}k`
    return `$${Math.round(value)}`
}

function money(value) {
    return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

// Round gridline step (1, 2 or 5 x 10^n) giving about four gridlines, so
// every tick is a whole, readable amount.
function niceStep(maxValue) {
    if (maxValue <= 0) return 100
    const raw = maxValue / 4
    const magnitude = 10 ** Math.floor(Math.log10(raw))
    for (const s of [1, 2, 5, 10]) {
        if (s * magnitude >= raw) return s * magnitude
    }
    return 10 * magnitude
}

// Bar with a 4px rounded top and a square base sitting on the baseline.
function barPath(x, y, w, h) {
    if (h <= 0) return ''
    const r = Math.min(4, w / 2, h)
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

// months: [{ key: 'YYYY-MM', label: 'Sep', expected, collected }]
export default function CollectionsChart({ months }) {
    const [hover, setHover] = useState(null)
    const [WIDTH, setWidth] = useState(640)
    const plotRef = useRef(null)

    // Draw at the container's real pixel width so text stays 11px instead of
    // scaling up with the viewBox on wide screens.
    useEffect(() => {
        const el = plotRef.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(([entry]) => {
            const next = Math.round(entry.contentRect.width)
            if (next > 0) setWidth(next)
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    const plotW = WIDTH - PAD.left - PAD.right
    const plotH = HEIGHT - PAD.top - PAD.bottom
    const dataMax = Math.max(...months.map((m) => Math.max(m.expected, m.collected)), 0)
    const step = niceStep(dataMax)
    const max = Math.max(step, Math.ceil(dataMax / step) * step)
    const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)
    const groupW = plotW / months.length
    const barW = Math.min(26, (groupW - 18) / 2)
    const gap = 2
    const y = (v) => PAD.top + plotH - (v / max) * plotH

    const hovered = hover != null ? months[hover] : null

    return (
        <div className="ns-collect-chart">
            <div className="ns-collect-legend" aria-hidden="true">
                <span>
                    <i style={{ background: EXPECTED_COLOR }} /> Expected
                </span>
                <span>
                    <i style={{ background: COLLECTED_COLOR }} /> Collected
                </span>
            </div>

            <div className="ns-collect-plot" ref={plotRef}>
                <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    width={WIDTH}
                    height={HEIGHT}
                    role="img"
                    aria-label="Rent expected versus collected over the last six months"
                    onMouseLeave={() => setHover(null)}
                >
                    {ticks.map((t) => (
                        <g key={t}>
                            <line
                                x1={PAD.left}
                                x2={WIDTH - PAD.right}
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
                        const x1 = cx - barW - gap / 2
                        const x2 = cx + gap / 2
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
                                <path d={barPath(x1, y(m.expected), barW, y(0) - y(m.expected))} fill={EXPECTED_COLOR} />
                                <path d={barPath(x2, y(m.collected), barW, y(0) - y(m.collected))} fill={COLLECTED_COLOR} />
                                <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="ns-collect-tick">
                                    {m.label}
                                </text>
                                {/* Hit target: the whole month column, bigger than the bars. */}
                                <rect
                                    x={PAD.left + groupW * i}
                                    y={PAD.top}
                                    width={groupW}
                                    height={plotH + PAD.bottom}
                                    fill="transparent"
                                    onMouseEnter={() => setHover(i)}
                                    onFocus={() => setHover(i)}
                                    onBlur={() => setHover(null)}
                                    tabIndex={0}
                                    aria-label={`${m.fullLabel}: expected ${money(m.expected)}, collected ${money(m.collected)}`}
                                />
                            </g>
                        )
                    })}
                </svg>

                {hovered && (
                    <div
                        className="ns-collect-tooltip"
                        style={{
                            left: `${((PAD.left + groupW * hover + groupW / 2) / WIDTH) * 100}%`,
                        }}
                        role="status"
                    >
                        <strong>{hovered.fullLabel}</strong>
                        <span>
                            <i style={{ background: EXPECTED_COLOR }} /> Expected <b>{money(hovered.expected)}</b>
                        </span>
                        <span>
                            <i style={{ background: COLLECTED_COLOR }} /> Collected <b>{money(hovered.collected)}</b>
                        </span>
                        {hovered.expected > 0 && (
                            <em>{Math.round((hovered.collected / hovered.expected) * 100)}% collected</em>
                        )}
                    </div>
                )}
            </div>

            <table className="visually-hidden">
                <caption>Rent expected versus collected, last six months</caption>
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Expected</th>
                        <th>Collected</th>
                    </tr>
                </thead>
                <tbody>
                    {months.map((m) => (
                        <tr key={m.key}>
                            <td>{m.fullLabel}</td>
                            <td>{money(m.expected)}</td>
                            <td>{money(m.collected)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
