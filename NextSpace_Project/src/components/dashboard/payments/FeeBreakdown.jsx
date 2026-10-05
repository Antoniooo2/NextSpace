import { useTranslation } from 'react-i18next'
import { moneyExact } from '../../../lib/money'
import { BRAND_VALUES } from '../../../lib/brand'
import { MINUS } from '../../../lib/symbols'
import { feeSplit, formatRate } from '../../../lib/platformFee'
import './payments.css'

// Rent − NextSpace fee = what the owner receives. Pass `split` for a paid
// month (its stored numbers) or `amount` + `rate` for an estimate.
export default function FeeBreakdown({
    amount,
    rate,
    split,
    grossLabel,
    netLabel,
    suffix = '',
    note,
}) {
    const { t } = useTranslation()
    const s = split || feeSplit(amount, rate)
    return (
        <dl className="ns-fee-breakdown">
            <div>
                <dt>{grossLabel || t('feeBreakdown.gross')}</dt>
                <dd>
                    {moneyExact(s.gross)}
                    {suffix}
                </dd>
            </div>
            <div>
                <dt>{t('pricing.example.fee', { ...BRAND_VALUES, rate: formatRate(s.rate) })}</dt>
                <dd>
                    {MINUS}
                    {moneyExact(s.fee)}
                    {suffix}
                </dd>
            </div>
            <div className="is-net">
                <dt>{netLabel || t('pricing.example.youReceive')}</dt>
                <dd>
                    {moneyExact(s.net)}
                    {suffix}
                </dd>
            </div>
            {note && <small className="ns-fee-breakdown-note">{note}</small>}
        </dl>
    )
}
