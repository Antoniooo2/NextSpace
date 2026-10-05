import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '../../i18n'
import { BRAND_VALUES } from '../../lib/brand'
import { paymentMethodLabel } from '../../lib/displayValues'
import { DASH, DOT } from '../../lib/symbols'
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TAG, dueCountdown, formatDueDate, isPayable } from '../../lib/rentSchedule'
import { downloadReceiptPdf, receiptNumber } from '../../lib/paymentDocuments'
import { moneyExact as money } from '../../lib/money'
import { contractRate, paymentSplit } from '../../lib/platformFee'
import FeeBreakdown from './payments/FeeBreakdown'

export default function PaymentDetailModal({
    payment,
    contract,
    tenant,
    canPay,
    paying,
    onPay,
    onClose,
    onAskRony,
    viewer = 'tenant',
    payout,
    feeRate,
}) {
    const { t } = useTranslation()
    const [downloading, setDownloading] = useState(false)
    const [downloadError, setDownloadError] = useState('')

    const isPaid = payment.status === 'Paid'
    const countdown = !isPaid && payment.status !== 'Cancelled' ? dueCountdown(payment.payment_date) : null

    const handleDownload = async () => {
        setDownloading(true)
        setDownloadError('')
        try {
            await downloadReceiptPdf({ payment, contract, tenant })
        } catch (err) {
            console.error('Could not build the receipt PDF', err)
            setDownloadError(t('payments.receiptError'))
        } finally {
            setDownloading(false)
        }
    }

    const rows = [
        [t('docs.receipt.rentPeriod'), formatDueDate(payment.payment_date, { month: 'long', year: 'numeric' })],
        [t('docs.receipt.dueDate'), formatDueDate(payment.payment_date, { month: 'long', day: 'numeric', year: 'numeric' })],
        [
            t('docs.receipt.paidOn'),
            payment.paid_at
                ? new Date(payment.paid_at).toLocaleString(currentLocale(), {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: 'America/El_Salvador',
                  })
                : DASH,
        ],
        [t('docs.reports.method'), payment.payment_method ? paymentMethodLabel(payment.payment_method) : DASH],
        [t('docs.receipt.transactionId'), payment.wompi_transaction_id || DASH],
        [t('docs.reports.receipt'), isPaid ? receiptNumber(payment) : DASH],
        [t('common.property'), contract.add_business?.property_name || DASH],
        [t('docs.receipt.contract'), `#${contract.contract_id}`],
    ]
    if (viewer === 'owner' && isPaid) {
        rows.push([
            t('paymentDetail.transferToYou'),
            payout
                ? t('paymentDetail.sent', {
                      date: new Date(payout.sent_at).toLocaleDateString(currentLocale(), {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: 'America/El_Salvador',
                      }),
                      reference: payout.reference,
                      dot: DOT,
                  })
                : t('paymentDetail.nextTransfer'),
        ])
    }
    if (viewer === 'tenant' && isPaid) {
        rows.push([t('paymentDetail.paidTo'), t('paymentDetail.ownerThrough', BRAND_VALUES)])
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div
                className="ns-modal ns-modal-form ns-pay-detail-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t('paymentDetail.title')}
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <div className="ns-pay-detail-head">
                        <span className={`ns-pay-tag ${PAYMENT_STATUS_TAG[payment.status] || 'tag-pending'}`}>
                            {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                        </span>
                        {countdown && <span className={`ns-pay-countdown tone-${countdown.tone}`}>{countdown.text}</span>}
                    </div>
                    <p className="ns-pay-detail-amount">{money(payment.amount)}</p>
                    <p className="ns-pay-muted mb-3">
                        {t('paymentDetail.rentFor', { month: formatDueDate(payment.payment_date, { month: 'long', year: 'numeric' }) })}
                    </p>

                    {viewer === 'owner' && payment.status !== 'Cancelled' && (
                        <FeeBreakdown
                            split={paymentSplit(payment, contractRate(contract, feeRate))}
                            grossLabel={isPaid ? t('paymentDetail.tenantPaid') : t('paymentDetail.tenantPays')}
                            netLabel={isPaid ? t('pricing.example.youReceive') : t('paymentDetail.willReceive')}
                        />
                    )}

                    <dl className="ns-pay-detail-list">
                        {rows.map(([label, value]) => (
                            <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>

                    {downloadError && (
                        <div className="alert alert-danger py-2" role="alert">
                            {downloadError}
                        </div>
                    )}

                    {isPaid ? (
                        <button type="button" className="ns-submit-btn" onClick={handleDownload} disabled={downloading}>
                            <i className="bi bi-file-earmark-pdf"></i> {downloading ? t('paymentDetail.creatingPdf') : t('paymentDetail.downloadReceipt')}
                        </button>
                    ) : isPayable(payment.status) && viewer === 'owner' ? (
                        <p className="ns-pay-muted mb-0">
                            {t('paymentDetail.waitingTenant', { ...BRAND_VALUES, name: tenant?.first_name || t('paymentDetail.theTenant') })}
                        </p>
                    ) : isPayable(payment.status) && canPay ? (
                        <button type="button" className="ns-submit-btn" onClick={onPay} disabled={paying}>
                            {paying ? t('payments.opening', BRAND_VALUES) : t('paymentDetail.pay', { amount: money(payment.amount) })}
                        </button>
                    ) : isPayable(payment.status) ? (
                        <p className="ns-pay-muted mb-0">{t('paymentDetail.olderFirst')}</p>
                    ) : (
                        <p className="ns-pay-muted mb-0">
                            {payment.status === 'Scheduled'
                                ? viewer === 'owner'
                                    ? t('paymentDetail.notDueOwner')
                                    : t('paymentDetail.notDueTenant')
                                : t('paymentDetail.cancelled')}
                        </p>
                    )}

                    {onAskRony && (
                        <button
                            type="button"
                            className="ns-detail-ask-rony"
                            onClick={() => {
                                const month = formatDueDate(payment.payment_date, { month: 'long', year: 'numeric' })
                                const property = contract.add_business?.property_name || t('payments.tenant.myLease')
                                onAskRony({
                                    text: t('paymentDetail.askText', {
                                        month,
                                        name: property,
                                        amount: money(payment.amount),
                                        date: formatDueDate(payment.payment_date),
                                        status: PAYMENT_STATUS_LABEL[payment.status] || payment.status,
                                    }),
                                })
                            }}
                        >
                            <i className="bi bi-stars"></i> {t('paymentDetail.askRony', BRAND_VALUES)}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
