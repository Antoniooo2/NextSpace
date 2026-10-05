import { formatDueDate } from './rentSchedule'
import { moneyExact as money } from './money'
import i18n, { currentLocale } from '../i18n'
import { BRAND_NAME, BRAND_VALUES } from './brand'
import { paymentMethodLabel } from './displayValues'
import { DASH, DOT, EN_DASH } from './symbols'

const NAVY = [15, 42, 82]
const MUTED = [110, 120, 138]
const TEXT = [26, 31, 43]
const GREEN = [26, 138, 74]

const t = (key, values) => i18n.t(`docs.receipt.${key}`, { ...BRAND_VALUES, ...values })

function paidOn(payment) {
    if (!payment.paid_at) return DASH
    return new Date(payment.paid_at).toLocaleDateString(currentLocale(), {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/El_Salvador',
    })
}

export function receiptNumber(payment) {
    return `NS-${String(payment.payment_id).padStart(6, '0')}`
}

function fullName(person) {
    return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || DASH
}

// Builds and downloads a one-page PDF receipt for a Paid installment.
// jsPDF is loaded on demand so it isn't part of the main bundle.
export async function downloadReceiptPdf({ payment, contract, tenant }) {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const left = 56
    const right = pageWidth - 56
    const property = contract.add_business || {}

    // Header band
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, pageWidth, 96, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.text(BRAND_NAME, left, 52)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(t('title'), left, 72)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(receiptNumber(payment), right, 52, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(t('issued', { date: paidOn(payment) }), right, 72, { align: 'right' })

    // Amount block
    let y = 150
    doc.setTextColor(...MUTED)
    doc.setFontSize(10)
    doc.text(t('amountPaid'), left, y)
    doc.setTextColor(...TEXT)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(30)
    doc.text(money(payment.amount), left, y + 34)
    doc.setFontSize(11)
    doc.setTextColor(...GREEN)
    doc.text(t('paidStamp'), right, y + 30, { align: 'right' })

    // Detail rows
    const rows = [
        [t('rentPeriod'), formatDueDate(payment.payment_date, { month: 'long', year: 'numeric' })],
        [t('dueDate'), formatDueDate(payment.payment_date, { month: 'long', day: 'numeric', year: 'numeric' })],
        [t('paidOn'), paidOn(payment)],
        [t('paymentMethod'), payment.payment_method ? paymentMethodLabel(payment.payment_method) : DASH],
        [t('transactionId'), payment.wompi_transaction_id || DASH],
        [t('property'), property.property_name || DASH],
        [t('contract'), `#${contract.contract_id}  (${formatDueDate(contract.start_date)} ${EN_DASH} ${formatDueDate(contract.end_date)})`],
        [t('tenant'), `${fullName(tenant)}${tenant?.dui ? `  ${DOT}  DUI ${tenant.dui}` : ''}`],
        [t('propertyOwner'), fullName(property.users)],
    ]

    y += 80
    doc.setDrawColor(229, 234, 243)
    doc.setLineWidth(1)
    doc.line(left, y - 22, right, y - 22)

    for (const [label, value] of rows) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(...MUTED)
        doc.text(label, left, y)
        doc.setTextColor(...TEXT)
        doc.setFontSize(11)
        doc.text(String(value), left + 150, y, { maxWidth: right - left - 150 })
        y += 28
    }

    doc.line(left, y - 8, right, y - 8)

    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(t('footer'), left, y + 20, { maxWidth: right - left })

    doc.save(`${BRAND_NAME}-${t('fileName')}-${receiptNumber(payment)}.pdf`)
}
