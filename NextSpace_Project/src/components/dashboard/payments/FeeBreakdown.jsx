import { moneyExact } from '../../../lib/money'
import { feeSplit, formatRate } from '../../../lib/platformFee'
import './payments.css'

// Rent − NextSpace fee = what the owner receives. Pass `split` for a paid
// month (its stored numbers) or `amount` + `rate` for an estimate.
export default function FeeBreakdown({
    amount,
    rate,
    split,
    grossLabel = 'Rent the tenant pays',
    netLabel = 'You receive',
    suffix = '',
    note,
}) {
    const s = split || feeSplit(amount, rate)
    return (
        <dl className="ns-fee-breakdown">
            <div>
                <dt>{grossLabel}</dt>
                <dd>
                    {moneyExact(s.gross)}
                    {suffix}
                </dd>
            </div>
            <div>
                <dt>NextSpace fee ({formatRate(s.rate)})</dt>
                <dd>
                    −{moneyExact(s.fee)}
                    {suffix}
                </dd>
            </div>
            <div className="is-net">
                <dt>{netLabel}</dt>
                <dd>
                    {moneyExact(s.net)}
                    {suffix}
                </dd>
            </div>
            {note && <small className="ns-fee-breakdown-note">{note}</small>}
        </dl>
    )
}
