import { useState } from 'react'
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
    const [showAllWaiting, setShowAllWaiting] = useState(false)

    const year = new Date().getFullYear().toString()
    const waiting = rows
        .filter(awaitingTransfer)
        .sort((a, b) => (a.paid_at || a.payment_date).localeCompare(b.paid_at || b.payment_date))
    const waitingTotals = sumSplit(waiting, rate)
    const paidThisYear = rows.filter((p) => p.status === 'Paid' && svDateOf(p.paid_at || p.payment_date).startsWith(year))
    const yearTotals = sumSplit(paidThisYear, rate)
    const transferredThisYear = payouts
        .filter((t) => svDateOf(t.sent_at).startsWith(year))
        .reduce((s, t) => s + Number(t.net_amount || 0), 0)
    const example = feeSplit(exampleRent || 1000, rate)
    const visibleWaiting = showAllWaiting ? waiting : waiting.slice(0, WAITING_PAGE)

    return (
        <>
            <div className="ns-fee-flow" aria-label="How your rent reaches you">
                <div className="ns-fee-step">
                    <i className="bi bi-person-check"></i>
                    <span>
                        <small>Your tenant pays</small>
                        <strong>{money(example.gross)}</strong>
                    </span>
                </div>
                <i className="bi bi-arrow-right ns-fee-arrow" aria-hidden="true"></i>
                <div className="ns-fee-step is-fee">
                    <i className="bi bi-percent"></i>
                    <span>
                        <small>NextSpace fee ({formatRate(rate)})</small>
                        <strong>−{money(example.fee)}</strong>
                    </span>
                </div>
                <i className="bi bi-arrow-right ns-fee-arrow" aria-hidden="true"></i>
                <div className="ns-fee-step is-net">
                    <i className="bi bi-bank"></i>
                    <span>
                        <small>You receive</small>
                        <strong>{money(example.net)}</strong>
                    </span>
                </div>
                <p className="ns-fee-flow-note">
                    Tenants pay the full rent online with Wompi. NextSpace keeps {formatRate(rate)} for finding your tenant,
                    collecting rent, reminders and contracts, and transfers the rest to your bank account. Deposits carry no
                    fee.
                </p>
            </div>

            {loadError && (
                <div className="alert alert-warning py-2" role="alert">
                    {loadError}
                </div>
            )}

            <div className="ns-kpi-row">
                <div className={`ns-kpi ${waiting.length > 0 ? 'is-highlight' : ''}`}>
                    <span className="ns-kpi-label">Waiting to be transferred</span>
                    <span className="ns-kpi-value">{money(waitingTotals.net)}</span>
                    <span className="ns-trend">
                        {waiting.length === 0
                            ? 'Nothing pending'
                            : `${waiting.length} ${waiting.length === 1 ? 'payment' : 'payments'} · goes out in the next transfer`}
                    </span>
                </div>
                <div className="ns-kpi">
                    <span className="ns-kpi-label">Transferred in {year}</span>
                    <span className="ns-kpi-value">{money(transferredThisYear)}</span>
                    <span className="ns-trend">
                        {payouts.length === 0 ? 'No transfers yet' : `Last one ${formatDueDate(svDateOf(payouts[0].sent_at), { month: 'short', day: 'numeric' })}`}
                    </span>
                </div>
                <div className="ns-kpi">
                    <span className="ns-kpi-label">NextSpace fee in {year}</span>
                    <span className="ns-kpi-value">{money(yearTotals.fee)}</span>
                    <span className="ns-trend">
                        {formatRate(rate)} of {money(yearTotals.gross)} collected
                    </span>
                </div>
            </div>

            <div className="ns-pay-grid-2 ns-pay-grid-even">
                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>Transfers</h3>
                        <span>Sent by NextSpace to your bank account</span>
                    </div>
                    {payouts.length === 0 ? (
                        <p className="ns-pay-muted mb-0">
                            No transfers yet. When NextSpace sends you money it shows up here with its bank reference, and you get
                            a notification.
                        </p>
                    ) : (
                        <ul className="ns-transfer-list">
                            {payouts.map((t) => (
                                <li key={t.payout_id}>
                                    <span className="ns-transfer-icon">
                                        <i className="bi bi-bank"></i>
                                    </span>
                                    <span className="ns-transfer-main">
                                        <strong>
                                            {formatDueDate(svDateOf(t.sent_at), { month: 'long', day: 'numeric', year: 'numeric' })}
                                        </strong>
                                        <small>
                                            {t.payment_count} {t.payment_count === 1 ? 'payment' : 'payments'} · {money(t.gross_amount)}{' '}
                                            collected − {money(t.commission_amount)} fee · Ref. {t.reference}
                                        </small>
                                    </span>
                                    <span className="ns-transfer-amount">{money(t.net_amount)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="ns-panel">
                    <div className="ns-panel-head">
                        <h3>Bank account</h3>
                        {account && (
                            <button type="button" className="ns-link-btn" onClick={onEditAccount}>
                                Change
                            </button>
                        )}
                    </div>
                    {account ? (
                        <div className="ns-payout-account">
                            <i className="bi bi-bank2"></i>
                            <span>
                                <strong>{account.bank_name}</strong>
                                <small>
                                    {account.account_type} {maskAccountNumber(account.account_number)} · {account.holder_name}
                                </small>
                            </span>
                        </div>
                    ) : (
                        <div className="ns-payout-account is-missing">
                            <p className="mb-2">
                                <i className="bi bi-exclamation-circle"></i> Add the bank account where you want to receive your
                                rent. NextSpace can't transfer your money until you do.
                            </p>
                            <button type="button" className="ns-filled-btn" onClick={onEditAccount}>
                                Add bank account
                            </button>
                        </div>
                    )}

                    {waiting.length > 0 && (
                        <>
                            <h4 className="ns-transfer-subhead">In your next transfer</h4>
                            <ul className="ns-transfer-list is-compact">
                                {visibleWaiting.map((p) => {
                                    const split = paymentSplit(p, rate)
                                    return (
                                        <li key={p.payment_id}>
                                            <span className="ns-transfer-main">
                                                <strong>
                                                    {p.contract?.add_business?.property_name || 'Rent'} ·{' '}
                                                    {monthLabel(p.payment_date.slice(0, 7), 'long')}
                                                </strong>
                                                <small>
                                                    {tenantName(p.contract?.users)} paid {money(split.gross)} − {money(split.fee)} fee
                                                </small>
                                            </span>
                                            <span className="ns-transfer-amount">{money(split.net)}</span>
                                        </li>
                                    )
                                })}
                            </ul>
                            {waiting.length > WAITING_PAGE && (
                                <button type="button" className="ns-link-btn" onClick={() => setShowAllWaiting((v) => !v)}>
                                    {showAllWaiting ? 'Show less' : `Show all ${waiting.length}`}
                                </button>
                            )}
                        </>
                    )}
                </section>
            </div>
        </>
    )
}
