import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_VALUES } from '../../../lib/brand'
import { accountTypeLabel } from '../../../lib/displayValues'
import { DOT, MINUS } from '../../../lib/symbols'
import { formatDueDate } from '../../../lib/rentSchedule'
import { monthLabel, svDateOf, tenantName } from '../../../lib/leaseInsights'
import { money } from '../../../lib/money'
import { awaitingTransfer, feeSplit, formatRate, paymentSplit, sumSplit } from '../../../lib/platformFee'
import { maskAccountNumber } from '../../../lib/payouts'

const WAITING_PAGE = 6

// "Your money": how rent reaches the owner (tenant pays → NextSpace keeps its
// fee → the rest is transferred), what is waiting to be transferred, the
// transfers already sent and the bank account they go to.
export default function OwnerTransfers({ rows, payouts, account, rate, exampleRent, onEditAccount, loadError }) {
    const { t } = useTranslation()
    const [showAllWaiting, setShowAllWaiting] = useState(false)

    const year = new Date().getFullYear().toString()
    const waiting = rows
        .filter(awaitingTransfer)
        .sort((a, b) => (a.paid_at || a.payment_date).localeCompare(b.paid_at || b.payment_date))
    const waitingTotals = sumSplit(waiting, rate)
    const paidThisYear = rows.filter((p) => p.status === 'Paid' && svDateOf(p.paid_at || p.payment_date).startsWith(year))
    const yearTotals = sumSplit(paidThisYear, rate)
    const transferredThisYear = payouts
        .filter((payout) => svDateOf(payout.sent_at).startsWith(year))
        .reduce((s, payout) => s + Number(payout.net_amount || 0), 0)
    const example = feeSplit(exampleRent || 1000, rate)
    const visibleWaiting = showAllWaiting ? waiting : waiting.slice(0, WAITING_PAGE)

    return (
        <>
            <div className="ns-fee-flow" aria-label={t('transfers.flowLabel')}>
                <div className="ns-fee-step">
                    <i className="bi bi-person-check"></i>
                    <span>
                        <small>{t('pricing.example.tenantPays')}</small>
                        <strong>{money(example.gross)}</strong>
                    </span>
                </div>
                <i className="bi bi-arrow-right ns-fee-arrow" aria-hidden="true"></i>
                <div className="ns-fee-step is-fee">
                    <i className="bi bi-percent"></i>
                    <span>
                        <small>{t('pricing.example.fee', { ...BRAND_VALUES, rate: formatRate(rate) })}</small>
                        <strong>
                            {MINUS}
                            {money(example.fee)}
                        </strong>
                    </span>
                </div>
                <i className="bi bi-arrow-right ns-fee-arrow" aria-hidden="true"></i>
                <div className="ns-fee-step is-net">
                    <i className="bi bi-bank"></i>
                    <span>
                        <small>{t('pricing.example.youReceive')}</small>
                        <strong>{money(example.net)}</strong>
                    </span>
                </div>
                <p className="ns-fee-flow-note">
                    {t('transfers.flowNote', { ...BRAND_VALUES, rate: formatRate(rate) })}
                </p>
            </div>

            {loadError && (
                <div className="alert alert-warning py-2" role="alert">
                    {loadError}
                </div>
            )}

            <div className="ns-kpi-row">
                <div className={`ns-kpi ${waiting.length > 0 ? 'is-highlight' : ''}`}>
                    <span className="ns-kpi-label">{t('transfers.waiting')}</span>
                    <span className="ns-kpi-value">{money(waitingTotals.net)}</span>
                    <span className="ns-trend">
                        {waiting.length === 0 ? t('transfers.nothingPending') : t('transfers.waitingCount', { count: waiting.length, dot: DOT })}
                    </span>
                </div>
                <div className="ns-kpi">
                    <span className="ns-kpi-label">{t('transfers.transferredIn', { year })}</span>
                    <span className="ns-kpi-value">{money(transferredThisYear)}</span>
                    <span className="ns-trend">
                        {payouts.length === 0
                            ? t('transfers.noneYet')
                            : t('transfers.lastOne', { date: formatDueDate(svDateOf(payouts[0].sent_at), { month: 'short', day: 'numeric' }) })}
                    </span>
                </div>
                <div className="ns-kpi">
                    <span className="ns-kpi-label">{t('transfers.feeIn', { ...BRAND_VALUES, year })}</span>
                    <span className="ns-kpi-value">{money(yearTotals.fee)}</span>
                    <span className="ns-trend">
                        {t('transfers.rateOf', { rate: formatRate(rate), amount: money(yearTotals.gross) })}
                    </span>
                </div>
            </div>

            <div className="ns-pay-grid-2 ns-pay-grid-even">
                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>{t('ownerPayments.transfers')}</h3>
                        <span>{t('transfers.sentBy', BRAND_VALUES)}</span>
                    </div>
                    {payouts.length === 0 ? (
                        <p className="ns-pay-muted mb-0">
                            {t('transfers.emptyText', BRAND_VALUES)}
                        </p>
                    ) : (
                        <ul className="ns-transfer-list">
                            {payouts.map((payout) => (
                                <li key={payout.payout_id}>
                                    <span className="ns-transfer-icon">
                                        <i className="bi bi-bank"></i>
                                    </span>
                                    <span className="ns-transfer-main">
                                        <strong>
                                            {formatDueDate(svDateOf(payout.sent_at), { month: 'long', day: 'numeric', year: 'numeric' })}
                                        </strong>
                                        <small>
                                            {t('transfers.line', {
                                                count: payout.payment_count,
                                                gross: money(payout.gross_amount),
                                                fee: money(payout.commission_amount),
                                                reference: payout.reference,
                                                dot: DOT,
                                                minus: MINUS,
                                            })}
                                        </small>
                                    </span>
                                    <span className="ns-transfer-amount">{money(payout.net_amount)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>{t('transfers.bankAccount')}</h3>
                        {account && (
                            <button type="button" className="ns-link-btn" onClick={onEditAccount}>
                                {t('transfers.change')}
                            </button>
                        )}
                    </div>
                    {account ? (
                        <div className="ns-payout-account">
                            <i className="bi bi-bank2"></i>
                            <span>
                                <strong>{account.bank_name}</strong>
                                <small>
                                    {accountTypeLabel(account.account_type)} {maskAccountNumber(account.account_number)} {DOT} {account.holder_name}
                                </small>
                            </span>
                        </div>
                    ) : (
                        <div className="ns-payout-account is-missing">
                            <p className="mb-2">
                                <i className="bi bi-exclamation-circle"></i> {t('transfers.missing', BRAND_VALUES)}
                            </p>
                            <button type="button" className="ns-filled-btn" onClick={onEditAccount}>
                                {t('transfers.addBank')}
                            </button>
                        </div>
                    )}

                    {waiting.length > 0 && (
                        <>
                            <h4 className="ns-transfer-subhead">{t('transfers.nextTransfer')}</h4>
                            <ul className="ns-transfer-list is-compact">
                                {visibleWaiting.map((p) => {
                                    const split = paymentSplit(p, rate)
                                    return (
                                        <li key={p.payment_id}>
                                            <span className="ns-transfer-main">
                                                <strong>
                                                    {p.contract?.add_business?.property_name || t('propertyDetail.rent')} {DOT}{' '}
                                                    {monthLabel(p.payment_date.slice(0, 7), 'long')}
                                                </strong>
                                                <small>
                                                    {t('transfers.paidLine', {
                                                        name: tenantName(p.contract?.users),
                                                        gross: money(split.gross),
                                                        fee: money(split.fee),
                                                        minus: MINUS,
                                                    })}
                                                </small>
                                            </span>
                                            <span className="ns-transfer-amount">{money(split.net)}</span>
                                        </li>
                                    )
                                })}
                            </ul>
                            {waiting.length > WAITING_PAGE && (
                                <button type="button" className="ns-link-btn" onClick={() => setShowAllWaiting((v) => !v)}>
                                    {showAllWaiting ? t('profile.saved.showLess') : t('transfers.showAll', { count: waiting.length })}
                                </button>
                            )}
                        </>
                    )}
                </section>
            </div>
        </>
    )
}
