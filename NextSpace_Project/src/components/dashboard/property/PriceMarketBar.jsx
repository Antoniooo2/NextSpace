import { formatPpm } from '../../../lib/market'

// Where this space's rent per m² falls against the median of similar
// spaces: a track from 0 to twice the median, the median in the middle.
export default function PriceMarketBar({ insight }) {
    if (!insight) return null
    const max = insight.median * 2
    const pos = Math.max(2, Math.min(98, (insight.ppm / max) * 100))

    return (
        <div className={`ns-pmb tone-${insight.tone}`}>
            <div className="ns-pmb-head">
                <strong>{insight.label}</strong>
                <span>{formatPpm(insight.ppm)}</span>
            </div>
            <div className="ns-pmb-track" aria-hidden="true">
                <span className="ns-pmb-zone is-low" />
                <span className="ns-pmb-zone is-mid" />
                <span className="ns-pmb-zone is-high" />
                <span className="ns-pmb-median" />
                <span className="ns-pmb-dot" style={{ left: `${pos}%` }} />
            </div>
            <div className="ns-pmb-scale">
                <span>Cheaper</span>
                <span>
                    Median {formatPpm(insight.median)}
                </span>
                <span>Pricier</span>
            </div>
            <small>Compared with {insight.scope} on NextSpace.</small>
        </div>
    )
}
