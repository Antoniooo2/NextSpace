// Downloadable rent documents: the lease statement (PDF), the owner's monthly
// report (PDF) and Excel workbooks for both sides. jsPDF and write-excel-file
// are loaded on demand so they stay out of the main bundle.
import { PAYMENT_STATUS_LABEL, formatDueDate, todayInElSalvador } from './rentSchedule'
import { daysLate, leaseStats, monthKeyShift, monthLabel, riskLevel, svDateOf, tenantName } from './leaseInsights'
import { receiptNumber } from './paymentDocuments'
import { moneyExact as usd } from './money'

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
    return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || '—'
}

function slug(text) {
    return String(text || 'lease').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function paidOnShort(p) {
    return p.paid_at ? formatDueDate(svDateOf(p.paid_at)) : '—'
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
    doc.text('NextSpace', left, 42)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(title, left, 62)
    doc.setFontSize(9.5)
    doc.text(subtitle, right, 42, { align: 'right' })
    doc.text(`Generated ${formatDueDate(todayInElSalvador(), { month: 'long', day: 'numeric', year: 'numeric' })}`, right, 58, {
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
        doc.text(String(value ?? '—'), x, rowY + 14, { maxWidth: colW - 12 })
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
        doc.text(`Page ${i} of ${pages}`, right, height - 28, { align: 'right' })
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
        doc.text(`$${Math.round(v).toLocaleString('en-US')}`, plotLeft - 6, yy + 3, { align: 'right' })
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
    doc.text('Expected', plotLeft + 12, ly)
    doc.setFillColor(...COLLECTED)
    doc.rect(plotLeft + 70, ly - 7, 8, 8, 'F')
    doc.text('Collected', plotLeft + 82, ly)
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
    const periodLabel = period === 'all' ? 'Whole lease' : `Year ${period}`

    let y = header(ctx, `Rent statement · ${property.property_name || 'Lease'}`, periodLabel)

    y = facts(ctx, y, [
        ['Property', property.property_name],
        ['Contract', `#${contract.contract_id}`],
        ['Tenant', `${fullName(tenant)}${tenant?.dui ? ` · DUI ${tenant.dui}` : ''}`],
        ['Owner', ownerName || fullName(property.users)],
        ['Lease', `${formatDueDate(contract.start_date)} – ${formatDueDate(contract.end_date)}`],
        ['Monthly rent', usd(contract.monthly_rent)],
    ])

    y = kpis(ctx, y + 4, [
        { label: 'Total in period', value: usd(stats.leaseTotal) },
        { label: 'Paid', value: usd(stats.collectedTotal), good: stats.collectedTotal > 0 },
        { label: 'Owed now', value: usd(stats.owedNow), bad: stats.lateMonths > 0 },
        {
            label: 'On time',
            value: stats.monthsDue > 0 ? `${stats.paidOnTime}/${stats.monthsDue}` : '—',
        },
    ])

    y = sectionTitle(ctx, y, 'Month by month')
    y = table(
        ctx,
        y + 6,
        [
            { label: 'Period', w: 1.4 },
            { label: 'Due', w: 1.1 },
            { label: 'Status', w: 0.9 },
            { label: 'Paid on', w: 1.1 },
            { label: 'Days late', w: 0.8, align: 'right' },
            { label: 'Amount', w: 1, align: 'right' },
            { label: 'Receipt', w: 1 },
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
                late > 0 ? String(late) : '—',
                usd(p.amount),
                p.status === 'Paid' ? receiptNumber(p) : '—',
            ]
        })
    )

    const paidWithTx = rows.filter((p) => p.status === 'Paid' && p.wompi_transaction_id)
    if (paidWithTx.length > 0) {
        y = sectionTitle(ctx, y, 'Wompi transactions')
        table(
            ctx,
            y + 6,
            [
                { label: 'Receipt', w: 1 },
                { label: 'Period', w: 1.2 },
                { label: 'Transaction ID', w: 3 },
            ],
            paidWithTx.map((p) => [receiptNumber(p), formatDueDate(p.payment_date, { month: 'short', year: 'numeric' }), p.wompi_transaction_id])
        )
    }

    footer(ctx, 'Generated by NextSpace from the rent schedule and payments confirmed through Wompi.')
    doc.save(`NextSpace-statement-${slug(property.property_name)}-${period}.pdf`)
}

// ---------------------------------------------------------------------------
// Owner monthly report
// ---------------------------------------------------------------------------

// leases: [{ contract, installments, stats, risk }] (active); allRows: every
// installment with `.contract`; monthKey: 'YYYY-MM'; summary: optional text.
export async function downloadOwnerMonthlyReportPdf({ monthKey, leases, allRows, ownerName, summary }) {
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

    let y = header(ctx, `Monthly rent report · ${monthLabel(monthKey, 'long')}`, ownerName || '')

    if (summary) {
        y = sectionTitle(ctx, y, "Rony's analysis")
        y = paragraph(ctx, y + 8, summary, { boxed: true })
    }

    y = kpis(ctx, y + 4, [
        { label: 'Expected', value: usd(expected) },
        { label: 'Collected', value: usd(collected), good: collected > 0 },
        { label: 'Collection rate', value: rate == null ? '—' : `${rate}%`, bad: rate != null && rate < 80 },
        { label: 'Overdue today', value: usd(lateTotal), bad: lateTotal > 0 },
    ])

    y = sectionTitle(ctx, y, 'Expected vs collected, last 6 months')
    const months = Array.from({ length: 6 }, (_, i) => monthKeyShift(monthKey, i - 5)).map((key) => ({
        label: monthLabel(key),
        expected: expectedIn(key),
        collected: collectedIn(key),
    }))
    y = barChart(ctx, y + 8, months)

    y = sectionTitle(ctx, y, 'By property')
    y = table(
        ctx,
        y + 6,
        [
            { label: 'Property', w: 1.5 },
            { label: 'Tenant', w: 1.4 },
            { label: 'Due in month', w: 1, align: 'right' },
            { label: 'Collected', w: 1, align: 'right' },
            { label: 'Owed now', w: 1, align: 'right' },
            { label: 'Risk', w: 0.9 },
        ],
        leases.map(({ contract, installments, stats, risk }) => {
            const due = installments.filter((p) => p.payment_date.slice(0, 7) === monthKey).reduce((s, p) => s + Number(p.amount), 0)
            const got = installments
                .filter((p) => p.status === 'Paid' && paidMonth(p) === monthKey)
                .reduce((s, p) => s + Number(p.amount), 0)
            return [
                contract.add_business?.property_name || '—',
                tenantName(contract.users),
                usd(due),
                usd(got),
                { text: usd(stats.owedNow), color: stats.lateMonths > 0 ? RED : TEXT, bold: stats.lateMonths > 0 },
                (risk || riskLevel(stats)).label,
            ]
        })
    )

    if (late.length > 0) {
        y = sectionTitle(ctx, y, 'Late rent (as of today)')
        y = table(
            ctx,
            y + 6,
            [
                { label: 'Tenant', w: 1.4 },
                { label: 'Property', w: 1.5 },
                { label: 'Month', w: 1.1 },
                { label: 'Days late', w: 0.8, align: 'right' },
                { label: 'Amount', w: 1, align: 'right' },
            ],
            late
                .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
                .map((p) => [
                    tenantName(p.contract?.users),
                    p.contract?.add_business?.property_name || '—',
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
        y = sectionTitle(ctx, y, 'Coming up')
        y = table(
            ctx,
            y + 6,
            [
                { label: 'Due', w: 1 },
                { label: 'Tenant', w: 1.4 },
                { label: 'Property', w: 1.5 },
                { label: 'Amount', w: 1, align: 'right' },
            ],
            coming.map((p) => [
                formatDueDate(p.payment_date),
                tenantName(p.contract?.users),
                p.contract?.add_business?.property_name || '—',
                usd(p.amount),
            ])
        )
    }

    const endings = leases.filter(
        ({ contract }) => contract.end_date && contract.end_date >= today && contract.end_date <= monthKeyShift(today.slice(0, 7), 3) + '-31'
    )
    if (endings.length > 0) {
        y = sectionTitle(ctx, y, 'Leases ending in the next 3 months')
        table(
            ctx,
            y + 6,
            [
                { label: 'Property', w: 1.5 },
                { label: 'Tenant', w: 1.4 },
                { label: 'Ends', w: 1 },
                { label: 'Monthly rent', w: 1, align: 'right' },
            ],
            endings.map(({ contract }) => [
                contract.add_business?.property_name || '—',
                tenantName(contract.users),
                formatDueDate(contract.end_date),
                usd(contract.monthly_rent),
            ])
        )
    }

    footer(ctx, 'Generated by NextSpace. Rent is paid by tenants online through Wompi; amounts reflect confirmed payments.')
    doc.save(`NextSpace-rent-report-${monthKey}.pdf`)
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

function paymentRowsSheet(rows, today, { withLease }) {
    const header = head([
        ...(withLease ? ['Property', 'Tenant', 'Contract'] : []),
        'Rent period',
        'Due date',
        'Status',
        'Paid on',
        'Days late',
        'Amount (USD)',
        'Method',
        'Wompi transaction',
        'Receipt',
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
            { value: p.payment_method || '' },
            { value: p.wompi_transaction_id || '' },
            { value: p.status === 'Paid' ? receiptNumber(p) : '' },
        ])
    return [header, ...data]
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
export async function downloadOwnerWorkbook({ leases, allRows, projection }) {
    const today = todayInElSalvador()

    const summary = [
        head([
            'Property',
            'Tenant',
            'Monthly rent',
            'Lease start',
            'Lease end',
            'Months paid',
            'Months in lease',
            'On-time %',
            'Avg. days late',
            'Collected',
            'Owed now',
            'Left on lease',
            'Risk',
        ]),
        ...leases.map(({ contract, stats, risk }) => [
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
            num(stats.owedNow),
            num(stats.remainingTotal),
            { value: (risk || riskLevel(stats)).label },
        ]),
    ]

    const proj = [
        head(['Month', 'Expected rent (USD)', 'Leases paying', 'Lease ends this month']),
        ...projection.months.map((m) => [
            { value: m.fullLabel },
            num(m.total),
            { type: Number, value: m.parts.length },
            {
                value: projection.endings
                    .filter((e) => e.endDate.slice(0, 7) === m.key)
                    .map((e) => `${e.name} (${e.endDate})`)
                    .join(', '),
            },
        ]),
    ]

    await writeWorkbook(
        [
            { name: 'Summary', data: summary, columns: [22, 20, 13, 12, 12, 12, 14, 11, 13, 13, 12, 13, 12].map((width) => ({ width })) },
            {
                name: 'Payments',
                data: paymentRowsSheet(allRows, today, { withLease: true }),
                columns: [22, 20, 10, 18, 12, 11, 12, 10, 13, 13, 38, 12].map((width) => ({ width })),
            },
            { name: 'Projection', data: proj, columns: [20, 18, 14, 40].map((width) => ({ width })) },
        ],
        `NextSpace-rent-${today}.xlsx`
    )
}

// Tenant (or owner for one lease): lease facts + every month.
export async function downloadLeaseWorkbook({ contract, installments, tenant, ownerName }) {
    const today = todayInElSalvador()
    const stats = leaseStats(installments, today)
    const property = contract.add_business || {}

    const summary = [
        head(['Item', 'Value']),
        [{ value: 'Property' }, { value: property.property_name || '' }],
        [{ value: 'Contract' }, { type: Number, value: contract.contract_id }],
        [{ value: 'Tenant' }, { value: fullName(tenant) }],
        [{ value: 'Owner' }, { value: ownerName || fullName(property.users) }],
        [{ value: 'Lease start' }, dateCell(contract.start_date)],
        [{ value: 'Lease end' }, dateCell(contract.end_date)],
        [{ value: 'Monthly rent' }, num(contract.monthly_rent)],
        [{ value: 'Months paid' }, { type: Number, value: stats.monthsPaid }],
        [{ value: 'Months in lease' }, { type: Number, value: stats.monthsTotal }],
        [{ value: 'Paid on time' }, stats.onTimeRate == null ? { value: '—' } : { type: Number, value: stats.onTimeRate, format: '0%' }],
        [{ value: 'Paid so far' }, num(stats.collectedTotal)],
        [{ value: 'Owed now' }, num(stats.owedNow)],
        [{ value: 'Left on lease' }, num(stats.remainingTotal)],
    ]

    await writeWorkbook(
        [
            { name: 'Lease', data: summary, columns: [{ width: 18 }, { width: 32 }] },
            {
                name: 'Payments',
                data: paymentRowsSheet(installments, today, { withLease: false }),
                columns: [18, 12, 11, 12, 10, 13, 13, 38, 12].map((width) => ({ width })),
            },
        ],
        `NextSpace-${slug(property.property_name)}-contract-${contract.contract_id}.xlsx`
    )
}
