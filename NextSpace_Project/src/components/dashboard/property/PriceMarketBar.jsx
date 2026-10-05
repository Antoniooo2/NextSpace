import { useTranslation } from 'react-i18next'
import { formatPpm } from '../../../lib/market'
import { BRAND_VALUES } from '../../../lib/brand'

// Where this space's rent per m² falls against the median of similar
// spaces: a track from 0 to twice the median, the median in the middle.
export default function PriceMarketBar({ insight }) {
    const { t } = useTranslation()
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
                <span>{t('priceBar.cheaper')}</span>
                <span>
                    {t('priceBar.median', { value: formatPpm(insight.median) })}
                </span>
                <span>{t('priceBar.pricier')}</span>
            </div>
            <small>{t('priceBar.compared', { ...BRAND_VALUES, scope: insight.scope })}</small>
        </div>
    )
}
