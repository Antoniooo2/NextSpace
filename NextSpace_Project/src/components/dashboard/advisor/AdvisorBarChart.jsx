export default function AdvisorBarChart({ title, bars }) {
    const max = Math.max(...bars.map((bar) => bar.value), 1)

    return (
        <div className="advisor-chart">
            <h5>{title}</h5>
            <div className="advisor-chart-bars">
                {bars.map((bar) => (
                    <div key={bar.label} className={'advisor-chart-col' + (bar.emphasis ? ' advisor-chart-col-emphasis' : '')}>
                        <span className="advisor-chart-value">
                            {bar.prefix || ''}
                            {Math.round(bar.value)}
                        </span>
                        <div className="advisor-chart-bar-track">
                            <div className="advisor-chart-bar" style={{ height: Math.max(8, (bar.value / max) * 100) + '%' }} />
                        </div>
                        <span className="advisor-chart-label">{bar.label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
