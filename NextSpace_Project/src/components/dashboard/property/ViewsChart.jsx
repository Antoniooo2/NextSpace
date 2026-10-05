import { useState } from 'react'

// Daily views for the last 30 days as small bars, with the total and the
// change against the 30 days before. `days` is 60 rows, oldest first.
export default function ViewsChart({ days }) {
    const [hover, setHover] = useState(null)
    if (!days || days.length === 0) return null

    const recent = days.slice(-30)
    const previous = days.slice(0, -30)
    const total = recent.reduce((s, d) => s + d.views, 0)
    const prevTotal = previous.reduce((s, d) => s + d.views, 0)
    // A percentage only means something with a real baseline.
    const change = prevTotal >= 5 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null
    const max = Math.max(1, ...recent.map((d) => d.views))
    const label = (d) => new Date(`${d.day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const shown = hover != null ? recent[hover] : null

    return (
        <div className="ns-vc">
            <div className="ns-vc-head">
                <div>
                    <strong>{total}</strong>
                    <span>views in the last 30 days</span>
                </div>
                {change != null ? (
                    <em className={change >= 0 ? 'is-up' : 'is-down'}>
                        <i className={`bi ${change >= 0 ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}`}></i> {Math.abs(change)}% vs previous 30
                    </em>
                ) : (
                    <em>{prevTotal === 0 ? (total > 0 ? 'First views this month' : '') : `${prevTotal} the 30 days before`}</em>
                )}
            </div>
            <div className="ns-vc-bars" role="img" aria-label={`${total} views in the last 30 days`} onMouseLeave={() => setHover(null)}>
                {recent.map((d, i) => (
                    <span
                        key={d.day}
                        className={`${d.views > 0 ? '' : 'is-zero'} ${hover === i ? 'is-hover' : ''}`}
                        style={{ height: `${d.views > 0 ? Math.max(8, (d.views / max) * 100) : 4}%` }}
                        onMouseEnter={() => setHover(i)}
                    />
                ))}
            </div>
            <div className="ns-vc-foot">
                {shown ? (
                    <span>
                        {label(shown)}: <strong>{shown.views}</strong> {shown.views === 1 ? 'view' : 'views'}
                    </span>
                ) : (
                    <>
                        <span>{label(recent[0])}</span>
                        <span>Today</span>
                    </>
                )}
            </div>
        </div>
    )
}
