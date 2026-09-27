import { useState } from 'react'
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TAG, dueCountdown, formatDueDate, isPayable } from '../../lib/rentSchedule'
import { downloadReceiptPdf, receiptNumber } from '../../lib/paymentDocuments'

function money(value) {
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function PaymentDetailModal({ payment, contract, tenant, canPay, paying, onPay, onClose, viewer = 'tenant' }) {
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
            setDownloadError('Could not create the receipt. Please try again.')
        } finally {
            setDownloading(false)
        }
    }

    const rows = [
        ['Rent period', formatDueDate(payment.payment_date, { month: 'long', year: 'numeric' })],
        ['Due date', formatDueDate(payment.payment_date, { month: 'long', day: 'numeric', year: 'numeric' })],
        [
            'Paid on',
            payment.paid_at
                ? new Date(payment.paid_at).toLocaleString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: 'America/El_Salvador',
                  })
                : '—',
        ],
        ['Method', payment.payment_method || '—'],
        ['Transaction ID', payment.wompi_transaction_id || '—'],
        ['Receipt', isPaid ? receiptNumber(payment) : '—'],
        ['Property', contract.add_business?.property_name || '—'],
        ['Contract', `#${contract.contract_id}`],
    ]

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div
                className="ns-modal ns-modal-form ns-pay-detail-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Payment details"
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
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
                        Rent for {formatDueDate(payment.payment_date, { month: 'long', year: 'numeric' })}
                    </p>

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
                            <i className="bi bi-file-earmark-pdf"></i> {downloading ? 'Creating PDF...' : 'Download receipt (PDF)'}
                        </button>
                    ) : isPayable(payment.status) && viewer === 'owner' ? (
                        <p className="ns-pay-muted mb-0">
                            Waiting for {tenant?.first_name || 'the tenant'} to pay it with Wompi in the app.
                        </p>
                    ) : isPayable(payment.status) && canPay ? (
                        <button type="button" className="ns-submit-btn" onClick={onPay} disabled={paying}>
                            {paying ? 'Opening Wompi...' : `Pay ${money(payment.amount)}`}
                        </button>
                    ) : isPayable(payment.status) ? (
                        <p className="ns-pay-muted mb-0">Older months are paid first. Pay the earliest outstanding month to continue.</p>
                    ) : (
                        <p className="ns-pay-muted mb-0">
                            {payment.status === 'Scheduled'
                                ? viewer === 'owner'
                                    ? 'Not due yet. The tenant can pay it starting a week before its due date.'
                                    : 'You can pay this month starting a week before its due date.'
                                : 'This month was cancelled when the lease ended.'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
