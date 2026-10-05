// Circular progress (0..1) with content in the middle.
export default function ProgressRing({ value, size = 64, stroke = 6, tone = 'success', label, children }) {
    const radius = (size - stroke) / 2
    const circumference = 2 * Math.PI * radius
    const clamped = Math.min(1, Math.max(0, value || 0))

    return (
        <div
            className={`ns-ring tone-${tone}`}
            style={{ width: size, height: size }}
            role="img"
            aria-label={label || `${Math.round(clamped * 100)}%`}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle className="ns-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
                <circle
                    className="ns-ring-fill"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={stroke}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - clamped)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            <div className="ns-ring-center">{children}</div>
        </div>
    )
}
