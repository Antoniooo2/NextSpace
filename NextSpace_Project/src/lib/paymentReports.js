// Downloadable rent documents: the lease statement (PDF), the owner's monthly
// report (PDF) and Excel workbooks for both sides. jsPDF and write-excel-file
// are loaded on demand so they stay out of the main bundle.
import { PAYMENT_STATUS_LABEL, formatDueDate, todayInElSalvador } from './rentSchedule'
import { daysLate, leaseStats, monthKeyShift, monthLabel, riskLevel, svDateOf, tenantName } from './leaseInsights'
import { receiptNumber } from './paymentDocuments'
import { moneyExact as usd } from './money'
import { DEFAULT_COMMISSION_RATE, contractRate, formatRate, paymentSplit, sumSplit } from './platformFee'
import i18n from '../i18n'
import { BRAND_NAME, BRAND_VALUES } from './brand'
import { paymentMethodLabel } from './displayValues'
import { formatNumber } from './format'
import { DASH, DOT, EN_DASH } from './symbols'

const t = (key, values) => i18n.t(`docs.reports.${key}`, { ...BRAND_VALUES, ...values })

const NAVY = [15, 42, 82]
const MUTED = [110, 120, 138]
const TEXT = [26, 31, 43]
const LINE = [229, 234, 243]
const SOFT = [244, 247, 255]
const RED = [201, 41, 47]
const GREEN = [26, 138, 74]
// Same ordinal blue pair as the on-screen collections chart.
const EXPECTED = [134, 182, 239]
const COLLECTED = [28, 92, 171]

function fullName(person) {
    return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || DASH
}

function slug(text) {
    return String(text || 'lease').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function paidOnShort(p) {
    return p.paid_at ? formatDueDate(svDateOf(p.paid_at)) : DASH
}

// ---------------------------------------------------------------------------
// PDF helpers
// ---------------------------------------------------------------------------

export async function newDoc() {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    const width = doc.internal.pageSize.getWidth()
    const height = doc.internal.pageSize.getHeight()
    return { doc, width, height, left: 48, right: width - 48, bottom: height - 56 }
}

export function header(ctx, title, subtitle) {
    const { doc, width, left, right } = ctx
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, width, 84, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text(BRAND_NAME, left, 42)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(title, left, 62)
    doc.setFontSize(9.5)
    doc.text(subtitle, right, 42, { align: 'right' })
    doc.text(t('generated', { date: formatDueDate(todayInElSalvador(), { month: 'long', day: 'numeric', year: 'numeric' }) }), right, 58, {
        align: 'right',
    })
    return 116
}

export function sectionTitle(ctx, y, text) {
    const { doc, left } = ctx
    // Room for the title plus a header and a couple of rows, so a title is
    // never left alone at the bottom of a page.
    y = ensureSpace(ctx, y, 96)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...TEXT)
    doc.text(text, left, y)
    return y + 14
}

export function ensureSpace(ctx, y, needed) {
    if (y + needed <= ctx.bottom) return y
    ctx.doc.addPage()
    return 56
}

// Key/value grid, two columns.
export function facts(ctx, y, pairs) {
    const { doc, left, right } = ctx
    const colW = (right - left) / 2
    pairs.forEach(([label, value], i) => {
        const x = left + (i % 2) * colW
        const rowY = y + Math.floor(i / 2) * 30
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...MUTED)
        doc.text(label.toUpperCase(), x, rowY)
        doc.setFontSize(11)
        doc.setTextColor(...TEXT)
        doc.text(String(value ?? DASH), x, rowY + 14, { maxWidth: colW - 12 })
    })
    return y + Math.ceil(pairs.length / 2) * 30 + 6
}

// Row of KPI boxes.
function kpis(ctx, y, items) {
    const { doc, left, right } = ctx
    y = ensureSpace(ctx, y, 64)
    const gap = 10
    const w = (right - left - gap * (items.length - 1)) / items.length
    items.forEach((item, i) => {
        const x = left + i * (w + gap)
        doc.setDrawColor(...LINE)
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(x, y, w, 54, 6, 6, 'FD')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...MUTED)
        doc.text(item.label, x + 10, y + 17)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(15)
        doc.setTextColor(...(item.bad ? RED : item.good ? GREEN : NAVY))
        doc.text(item.value, x + 10, y + 38)
    })
    return y + 70
}

// Table with header row, zebra rows and automatic page breaks.
function table(ctx, y, columns, rows) {
    const { doc, left, right } = ctx
    const totalW = right - left
    const weightSum = columns.reduce((s, c) => s + (c.w || 1), 0)
    const widths = columns.map((c) => ((c.w || 1) / weightSum) * totalW)
    const rowH = 20

    const drawHeader = (yy) => {
        doc.setFillColor(...SOFT)
        doc.rect(left, yy - 13, totalW, rowH, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(...MUTED)
        let x = left
        columns.forEach((c, i) => {
            const tx = c.align === 'right' ? x + widths[i] - 6 : x + 6
            doc.text(c.label.toUpperCase(), tx, yy, { align: c.align === 'right' ? 'right' : 'left' })
            x += widths[i]
        })
        return yy + rowH
    }

    y = ensureSpace(ctx, y, rowH * 3)
    y = drawHeader(y)

    rows.forEach((row, r) => {
        if (y + rowH > ctx.bottom) {
            doc.addPage()
            y = drawHeader(56)
        }
        if (r % 2 === 1) {
            doc.setFillColor(250, 251, 253)
            doc.rect(left, y - 13, totalW, rowH, 'F')
        }
        let x = left
        columns.forEach((c, i) => {
            const cell = row[i]
            const value = cell && typeof cell === 'object' ? cell.text : cell
            const color = cell && typeof cell === 'object' && cell.color ? cell.color : TEXT
            doc.setFont('helvetica', cell && typeof cell === 'object' && cell.bold ? 'bold' : 'normal')
            doc.setFontSize(9)
            doc.setTextColor(...color)
            const text = doc.splitTextToSize(String(value ?? ''), widths[i] - 10)[0] || ''
            const tx = c.align === 'right' ? x + widths[i] - 6 : x + 6
            doc.text(text, tx, y, { align: c.align === 'right' ? 'right' : 'left' })
            x += widths[i]
        })
        y += rowH
    })
    return y + 10
}

export function paragraph(ctx, y, text, { boxed = false } = {}) {
    const { doc, left, right } = ctx
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const lines = doc.splitTextToSize(text, right - left - (boxed ? 24 : 0))
    const h = lines.length * 13 + (boxed ? 20 : 0)
    y = ensureSpace(ctx, y, h + 6)
    if (boxed) {
        doc.setFillColor(...SOFT)
        doc.setDrawColor(215, 221, 251)
        doc.roundedRect(left, y - 12, right - left, h, 6, 6, 'FD')
    }
    doc.setTextColor(...TEXT)
    doc.text(lines, left + (boxed ? 12 : 0), y + (boxed ? 6 : 0))
    return y + h + 8
}

export function footer(ctx, note) {
    const { doc, left, right, height } = ctx
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...MUTED)
        doc.text(note, left, height - 28, { maxWidth: right - left - 60 })
        doc.text(t('page', { page: i, pages }), right, height - 28, { align: 'right' })
    }
}

// Grouped bars (expected vs collected) drawn with plain rectangles.
function barChart(ctx, y, months) {
    const { doc, left, right } = ctx
    const h = 120
    y = ensureSpace(ctx, y, h + 50)
    const plotLeft = left + 44
    const plotW = right - plotLeft
    const max = Math.max(1, ...months.flatMap((m) => [m.expected, m.collected]))
    const step = Math.pow(10, Math.floor(Math.log10(max)))
    const top = Math.ceil(max / step) * step
    const groupW = plotW / months.length
    const barW = Math.min(18, (groupW - 16) / 2)

    doc.setFontSize(8)
    for (let t = 0; t <= 2; t++) {
        const v = (top / 2) * t
        const yy = y + h - (v / top) * h
        doc.setDrawColor(...LINE)
        doc.line(plotLeft, yy, right, yy)
        doc.setTextColor(...MUTED)
        doc.text(`$${formatNumber(Math.round(v))}`, plotLeft - 6, yy + 3, { align: 'right' })
    }

    months.forEach((m, i) => {
        const cx = plotLeft + groupW * i + groupW / 2
        const eh = (m.expected / top) * h
        const ch = (m.collected / top) * h
        doc.setFillColor(...EXPECTED)
        if (eh > 0) doc.rect(cx - barW - 1, y + h - eh, barW, eh, 'F')
        doc.setFillColor(...COLLECTED)
        if (ch > 0) doc.rect(cx + 1, y + h - ch, barW, ch, 'F')
        doc.setTextColor(...MUTED)
        doc.text(m.label, cx, y + h + 12, { align: 'center' })
    })

    const ly = y + h + 28
    doc.setFillColor(...EXPECTED)
    doc.rect(plotLeft, ly - 7, 8, 8, 'F')
    doc.setTextColor(...TEXT)
    doc.text(t('expected'), plotLeft + 12, ly)
    doc.setFillColor(...COLLECTED)
    doc.rect(plotLeft + 70, ly - 7, 8, 8, 'F')
    doc.text(t('collected'), plotLeft + 82, ly)
    return ly + 20
}

// ---------------------------------------------------------------------------
// Lease statement (tenant, or owner for one lease)
// ---------------------------------------------------------------------------

// period: 'all' for the whole lease, or a year like '2026'.
export async function downloadLeaseStatementPdf({ contract, installments, tenant, ownerName, period = 'all' }) {
    const ctx = await newDoc()
    const { doc } = ctx
    const today = todayInElSalvador()
    const property = contract.add_business || {}
    const rows = installments
        .filter((p) => period === 'all' || p.payment_date.startsWith(period))
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    const stats = leaseStats(rows, today)
    const periodLabel = period === 'all' ? t('wholeLease') : t('year', { year: period })

    let y = header(ctx, t('statementTitle', { name: property.property_name || t('lease') }), periodLabel)

    y = facts(ctx, y, [
        [t('property'), property.property_name],
        [t('contract'), `#${contract.contract_id}`],
        [t('tenant'), `${fullName(tenant)}${tenant?.dui ? ` ${DOT} DUI ${tenant.dui}` : ''}`],
        [t('owner'), ownerName || fullName(property.users)],
        [t('lease'), `${formatDueDate(contract.start_date)} ${EN_DASH} ${formatDueDate(contract.end_date)}`],
        [t('monthlyRent'), usd(contract.monthly_rent)],
    ])

    y = kpis(ctx, y + 4, [
        { label: t('totalInPeriod'), value: usd(stats.leaseTotal) },
        { label: t('paid'), value: usd(stats.collectedTotal), good: stats.collectedTotal > 0 },
        { label: t('owedNow'), value: usd(stats.owedNow), bad: stats.lateMonths > 0 },
        {
            label: t('onTime'),
            value: stats.monthsDue > 0 ? `${stats.paidOnTime}/${stats.monthsDue}` : DASH,
        },
    ])

    y = sectionTitle(ctx, y, t('monthByMonth'))
    y = table(
        ctx,
        y + 6,
        [
            { label: t('period'), w: 1.4 },
            { label: t('due'), w: 1.1 },
            { label: t('status'), w: 0.9 },
            { label: t('paidOn'), w: 1.1 },
            { label: t('daysLate'), w: 0.8, align: 'right' },
            { label: t('amount'), w: 1, align: 'right' },
            { label: t('receipt'), w: 1 },
        ],
        rows.map((p) => {
            const late = daysLate(p, today)
            return [
                formatDueDate(p.payment_date, { month: 'long', year: 'numeric' }),
                formatDueDate(p.payment_date),
                {
                    text: PAYMENT_STATUS_LABEL[p.status] || p.status,
                    color: p.status === 'Late' ? RED : p.status === 'Paid' ? GREEN : TEXT,
                    bold: p.status === 'Late',
                },
                paidOnShort(p),
                late > 0 ? String(late) : DASH,
                usd(p.amount),
                p.status === 'Paid' ? receiptNumber(p) : DASH,
            ]
        })
    )

    const paidWithTx = rows.filter((p) => p.status === 'Paid' && p.wompi_transaction_id)
    if (paidWithTx.length > 0) {
        y = sectionTitle(ctx, y, t('providerTransactions'))
        table(
            ctx,
            y + 6,
            [
                { label: t('receipt'), w: 1 },
                { label: t('period'), w: 1.2 },
                { label: t('transactionId'), w: 3 },
            ],
            paidWithTx.map((p) => [receiptNumber(p), formatDueDate(p.payment_date, { month: 'short', year: 'numeric' }), p.wompi_transaction_id])
        )
    }

    footer(ctx, t('statementFooter'))
    doc.save(`${BRAND_NAME}-${t('statementFile')}-${slug(property.property_name)}-${period}.pdf`)
}

// ---------------------------------------------------------------------------
// Owner monthly report
// ---------------------------------------------------------------------------

// leases: [{ contract, installments, stats, risk }] (active); allRows: every
// installment with `.contract`; monthKey: 'YYYY-MM'; summary: optional text.
export async function downloadOwnerMonthlyReportPdf({
    monthKey,
    leases,
    allRows,
    ownerName,
    summary,
    feeRate = DEFAULT_COMMISSION_RATE,
}) {
    const ctx = await newDoc()
    const { doc } = ctx
    const today = todayInElSalvador()
    const paidMonth = (p) => (p.paid_at ? svDateOf(p.paid_at).slice(0, 7) : p.payment_date.slice(0, 7))
    const inMonth = (key) => allRows.filter((p) => p.payment_date.slice(0, 7) === key)
    const expectedIn = (key) => inMonth(key).reduce((s, p) => s + Number(p.amount), 0)
    const collectedIn = (key) =>
        allRows.filter((p) => p.status === 'Paid' && paidMonth(p) === key).reduce((s, p) => s + Number(p.amount), 0)

    const expected = expectedIn(monthKey)
    const collected = collectedIn(monthKey)
    const rate = expected > 0 ? Math.round((collected / expected) * 100) : null
    const late = allRows.filter((p) => p.status === 'Late')
    const lateTotal = late.reduce((s, p) => s + Number(p.amount), 0)
    const splitOf = (rows) => sumSplit(rows.map((p) => ({ ...p, commission_rate: p.commission_rate ?? contractRate(p.contract, feeRate) })), feeRate)
    const collectedSplit = splitOf(allRows.filter((p) => p.status === 'Paid' && paidMonth(p) === monthKey))

    let y = header(ctx, t('monthlyTitle', { month: monthLabel(monthKey, 'long') }), ownerName || '')

    if (summary) {
        y = sectionTitle(ctx, y, t('ronyAnalysis'))
        y = paragraph(ctx, y + 8, summary, { boxed: true })
    }

    y = kpis(ctx, y + 4, [
        { label: t('expected'), value: usd(expected) },
        { label: t('collected'), value: usd(collected), good: collected > 0 },
        { label: t('collectionRate'), value: rate == null ? DASH : `${rate}%`, bad: rate != null && rate < 80 },
        { label: t('overdueToday'), value: usd(lateTotal), bad: lateTotal > 0 },
    ])
    y = kpis(ctx, y - 6, [
        { label: t('collectedFromTenants'), value: usd(collectedSplit.gross) },
        { label: t('feeLabel', { rate: formatRate(feeRate) }), value: `-${usd(collectedSplit.fee)}` },
        { label: t('youReceive'), value: usd(collectedSplit.net), good: collectedSplit.net > 0 },
    ])

    y = sectionTitle(ctx, y, t('expectedVsCollected'))
    const months = Array.from({ length: 6 }, (_, i) => monthKeyShift(monthKey, i - 5)).map((key) => ({
        label: monthLabel(key),
        expected: expectedIn(key),
        collected: collectedIn(key),
    }))
    y = barChart(ctx, y + 8, months)

    y = sectionTitle(ctx, y, t('byProperty'))
    y = table(
        ctx,
        y + 6,
        [
            { label: t('property'), w: 1.5 },
            { label: t('tenant'), w: 1.4 },
            { label: t('dueInMonth'), w: 1, align: 'right' },
            { label: t('collected'), w: 1, align: 'right' },
            { label: t('toYou'), w: 0.9, align: 'right' },
            { label: t('owedNow'), w: 1, align: 'right' },
            { label: t('risk'), w: 0.9 },
        ],
        leases.map(({ contract, installments, stats, risk }) => {
            const due = installments.filter((p) => p.payment_date.slice(0, 7) === monthKey).reduce((s, p) => s + Number(p.amount), 0)
            const gotRows = installments.filter((p) => p.status === 'Paid' && paidMonth(p) === monthKey)
            const got = sumSplit(gotRows, contractRate(contract, feeRate))
            return [
                contract.add_business?.property_name || DASH,
                tenantName(contract.users),
                usd(due),
                usd(got.gross),
                { text: usd(got.net), color: got.net > 0 ? GREEN : TEXT },
                { text: usd(stats.owedNow), color: stats.lateMonths > 0 ? RED : TEXT, bold: stats.lateMonths > 0 },
                (risk || riskLevel(stats)).label,
            ]
        })
    )

    if (late.length > 0) {
        y = sectionTitle(ctx, y, t('lateRent'))
        y = table(
            ctx,
            y + 6,
            [
                { label: t('tenant'), w: 1.4 },
                { label: t('property'), w: 1.5 },
                { label: t('month'), w: 1.1 },
                { label: t('daysLate'), w: 0.8, align: 'right' },
                { label: t('amount'), w: 1, align: 'right' },
            ],
            late
                .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
                .map((p) => [
                    tenantName(p.contract?.users),
                    p.contract?.add_business?.property_name || DASH,
                    formatDueDate(p.payment_date, { month: 'short', year: 'numeric' }),
                    String(daysLate(p, today)),
                    { text: usd(p.amount), color: RED, bold: true },
                ])
        )
    }

    const nextMonth = monthKeyShift(today.slice(0, 7), 1)
    const coming = allRows
        .filter((p) => p.status !== 'Paid' && p.status !== 'Late')
        .filter((p) => p.payment_date >= today && p.payment_date.slice(0, 7) <= nextMonth)
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    if (coming.length > 0) {
        y = sectionTitle(ctx, y, t('comingUp'))
        y = table(
            ctx,
            y + 6,
            [
                { label: t('due'), w: 1 },
                { label: t('tenant'), w: 1.4 },
                { label: t('property'), w: 1.5 },
                { label: t('amount'), w: 1, align: 'right' },
            ],
            coming.map((p) => [
                formatDueDate(p.payment_date),
                tenantName(p.contract?.users),
                p.contract?.add_business?.property_name || DASH,
                usd(p.amount),
            ])
        )
    }

    const endings = leases.filter(
        ({ contract }) => contract.end_date && contract.end_date >= today && contract.end_date <= monthKeyShift(today.slice(0, 7), 3) + '-31'
    )
    if (endings.length > 0) {
        y = sectionTitle(ctx, y, t('leasesEnding'))
        table(
            ctx,
            y + 6,
            [
                { label: t('property'), w: 1.5 },
                { label: t('tenant'), w: 1.4 },
                { label: t('ends'), w: 1 },
                { label: t('monthlyRent'), w: 1, align: 'right' },
            ],
            endings.map(({ contract }) => [
                contract.add_business?.property_name || DASH,
                tenantName(contract.users),
                formatDueDate(contract.end_date),
                usd(contract.monthly_rent),
            ])
        )
    }

    footer(ctx, t('monthlyFooter', { rate: formatRate(feeRate) }))
    doc.save(`${BRAND_NAME}-${t('monthlyFile')}-${monthKey}.pdf`)
}

// ---------------------------------------------------------------------------
// Excel workbooks
// ---------------------------------------------------------------------------

function dateCell(ymd) {
    if (!ymd) return null
    const [y, m, d] = ymd.split('-').map(Number)
    return { type: Date, value: new Date(Date.UTC(y, m - 1, d)), format: 'yyyy-mm-dd' }
}

function num(value, format = '#,##0.00') {
    return { type: Number, value: Number(value || 0), format }
}

function head(labels) {
    return labels.map((value) => ({ value, fontWeight: 'bold', backgroundColor: '#EEF3FD' }))
}

function paymentRowsSheet(rows, today, { withLease, feeRate = null }) {
    const withFee = feeRate != null
    const header = head([
        ...(withLease ? [t('property'), t('tenant'), t('contract')] : []),
        t('rentPeriod'),
        t('dueDate'),
        t('status'),
        t('paidOn'),
        t('daysLate'),
        t('amountUsd'),
        ...(withFee ? [t('feeUsd'), t('toYouUsd'), t('transfer')] : []),
        t('method'),
        t('providerTransaction'),
        t('receipt'),
    ])
    const data = rows
        .slice()
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
        .map((p) => [
            ...(withLease
                ? [
                      { value: p.contract?.add_business?.property_name || '' },
                      { value: tenantName(p.contract?.users) },
                      { type: Number, value: p.contract?.contract_id ?? 0 },
                  ]
                : []),
            { value: formatDueDate(p.payment_date, { month: 'long', year: 'numeric' }) },
            dateCell(p.payment_date),
            { value: PAYMENT_STATUS_LABEL[p.status] || p.status },
            p.paid_at ? dateCell(svDateOf(p.paid_at)) : null,
            { type: Number, value: daysLate(p, today) },
            num(p.amount),
            ...(withFee ? feeCells(p, feeRate) : []),
            { value: p.payment_method ? paymentMethodLabel(p.payment_method) : '' },
            { value: p.wompi_transaction_id || '' },
            { value: p.status === 'Paid' ? receiptNumber(p) : '' },
        ])
    return [header, ...data]
}

// Fee, owner's part and transfer state of one row (owner workbook only).
function feeCells(p, feeRate) {
    if (p.status !== 'Paid') return [null, null, { value: '' }]
    const split = paymentSplit(p, contractRate(p.contract, feeRate))
    return [num(split.fee), num(split.net), { value: p.payout_id ? t('transferSent') : t('transferPending') }]
}

async function writeWorkbook(sheets, fileName) {
    const { default: writeXlsxFile } = await import('write-excel-file')
    await writeXlsxFile(
        sheets.map((s) => s.data),
        {
            sheets: sheets.map((s) => s.name),
            columns: sheets.map((s) => s.columns),
            stickyRowsCount: 1,
            fileName,
        }
    )
}

// Owner: summary per property, every payment, and 6-month projection.
export async function downloadOwnerWorkbook({ leases, allRows, projection, feeRate = DEFAULT_COMMISSION_RATE }) {
    const today = todayInElSalvador()

    const summary = [
        head([
            t('property'),
            t('tenant'),
            t('monthlyRent'),
            t('leaseStart'),
            t('leaseEnd'),
            t('monthsPaid'),
            t('monthsInLease'),
            t('onTimePct'),
            t('avgDaysLate'),
            t('collected'),
            t('fee'),
            t('toYou'),
            t('owedNow'),
            t('leftOnLease'),
            t('risk'),
        ]),
        ...leases.map(({ contract, installments, stats, risk }) => {
            const paid = sumSplit(
                installments.filter((p) => p.status === 'Paid'),
                contractRate(contract, feeRate)
            )
            return [
            { value: contract.add_business?.property_name || '' },
            { value: tenantName(contract.users) },
            num(contract.monthly_rent),
            dateCell(contract.start_date),
            dateCell(contract.end_date),
            { type: Number, value: stats.monthsPaid },
            { type: Number, value: stats.monthsTotal },
            stats.onTimeRate == null ? null : { type: Number, value: stats.onTimeRate, format: '0%' },
            num(stats.avgDaysLate, '0.0'),
            num(stats.collectedTotal),
            num(paid.fee),
            num(paid.net),
            num(stats.owedNow),
            num(stats.remainingTotal),
            { value: (risk || riskLevel(stats)).label },
            ]
        }),
    ]

    const proj = [
        head([t('month'), t('expectedRentUsd'), t('toYouAfterFee', { rate: formatRate(feeRate) }), t('leasesPaying'), t('leaseEndsThisMonth')]),
        ...projection.months.map((m) => [
            { value: m.fullLabel },
            num(m.total),
            num(
                leases.reduce(
                    (s, { contract, installments }) =>
                        s +
                        sumSplit(
                            installments.filter((p) => p.payment_date.slice(0, 7) === m.key),
                            contractRate(contract, feeRate)
                        ).net,
                    0
                )
            ),
            { type: Number, value: m.parts.length },
            {
                value: projection.endings
                    .filter((e) => e.endDate.slice(0, 7) === m.key)
                    .map((e) => `${e.name} (${formatDueDate(e.endDate)})`)
                    .join(', '),
            },
        ]),
    ]

    await writeWorkbook(
        [
            {
                name: t('sheetSummary'),
                data: summary,
                columns: [22, 20, 13, 12, 12, 12, 14, 11, 13, 13, 14, 12, 12, 13, 12].map((width) => ({ width })),
            },
            {
                name: t('sheetPayments'),
                data: paymentRowsSheet(allRows, today, { withLease: true, feeRate }),
                columns: [22, 20, 10, 18, 12, 11, 12, 10, 13, 17, 13, 10, 13, 38, 12].map((width) => ({ width })),
            },
            { name: t('sheetProjection'), data: proj, columns: [20, 18, 24, 14, 40].map((width) => ({ width })) },
        ],
        `${BRAND_NAME}-${t('rentFile')}-${today}.xlsx`
    )
}

// Tenant (or owner for one lease): lease facts + every month.
export async function downloadLeaseWorkbook({ contract, installments, tenant, ownerName }) {
    const today = todayInElSalvador()
    const stats = leaseStats(installments, today)
    const property = contract.add_business || {}

    const summary = [
        head([t('item'), t('value')]),
        [{ value: t('property') }, { value: property.property_name || '' }],
        [{ value: t('contract') }, { type: Number, value: contract.contract_id }],
        [{ value: t('tenant') }, { value: fullName(tenant) }],
        [{ value: t('owner') }, { value: ownerName || fullName(property.users) }],
        [{ value: t('leaseStart') }, dateCell(contract.start_date)],
        [{ value: t('leaseEnd') }, dateCell(contract.end_date)],
        [{ value: t('monthlyRent') }, num(contract.monthly_rent)],
        [{ value: t('monthsPaid') }, { type: Number, value: stats.monthsPaid }],
        [{ value: t('monthsInLease') }, { type: Number, value: stats.monthsTotal }],
        [{ value: t('paidOnTime') }, stats.onTimeRate == null ? { value: DASH } : { type: Number, value: stats.onTimeRate, format: '0%' }],
        [{ value: t('paidSoFar') }, num(stats.collectedTotal)],
        [{ value: t('owedNow') }, num(stats.owedNow)],
        [{ value: t('leftOnLease') }, num(stats.remainingTotal)],
    ]

    await writeWorkbook(
        [
            { name: t('sheetLease'), data: summary, columns: [{ width: 18 }, { width: 32 }] },
            {
                name: t('sheetPayments'),
                data: paymentRowsSheet(installments, today, { withLease: false }),
                columns: [18, 12, 11, 12, 10, 13, 13, 38, 12].map((width) => ({ width })),
            },
        ],
        `${BRAND_NAME}-${slug(property.property_name)}-${t('contractFile')}-${contract.contract_id}.xlsx`
    )
}
