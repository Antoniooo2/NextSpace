// The signed lease as a PDF: parties, terms, the standard and special
// clauses, both signatures with their timestamps, and the verification code.
import { formatDueDate } from './rentSchedule'
import { dueDayLabel, money, personName, standardClauses, statusMeta } from './contracts'
import { ensureSpace, facts, footer, header, newDoc, paragraph, sectionTitle } from './paymentReports'

const TEXT = [26, 31, 43]
const MUTED = [110, 120, 138]
const LINE = [229, 234, 243]

function stamp(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/El_Salvador',
    })
}

export async function downloadContractPdf(contract) {
    const ctx = await newDoc()
    const { doc, left, right } = ctx
    const property = contract.add_business || {}
    const owner = property.users
    const tenant = contract.users

    let y = header(ctx, `Commercial lease · ${property.property_name || 'Property'}`, `Contract #${contract.contract_id} · ${statusMeta(contract).label}`)

    y = sectionTitle(ctx, y, 'Parties')
    y = facts(ctx, y + 8, [
        ['Owner', `${contract.owner_signed_name || personName(owner)}`],
        ['Tenant', `${contract.tenant_signed_name || personName(tenant)}${contract.tenant_dui ? ` · DUI ${contract.tenant_dui}` : ''}`],
        ['Space', property.property_name],
        ['Location', [property.address, property.municipality, property.department].filter(Boolean).join(', ') || '—'],
    ])

    y = sectionTitle(ctx, y, 'Key terms')
    y = facts(ctx, y + 8, [
        ['Monthly rent', money(contract.monthly_rent)],
        ['Rent due', `The ${dueDayLabel(contract.start_date)} of each month`],
        ['Start', formatDueDate(contract.start_date, { month: 'long', day: 'numeric', year: 'numeric' })],
        ['End', formatDueDate(contract.end_date, { month: 'long', day: 'numeric', year: 'numeric' })],
        ['Length', contract.duration_months ? `${contract.duration_months} months` : '—'],
        ['Deposit', Number(contract.deposit || 0) > 0 ? money(contract.deposit) : 'None'],
    ])

    y = sectionTitle(ctx, y, 'Clauses')
    standardClauses(contract).forEach((clause, i) => {
        y = ensureSpace(ctx, y, 40)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...TEXT)
        doc.text(`${i + 1}. ${clause.title}`, left, y + 6)
        y = paragraph(ctx, y + 20, clause.body)
    })

    if (contract.special_clauses) {
        y = sectionTitle(ctx, y, 'Special clauses')
        y = paragraph(ctx, y + 8, contract.special_clauses, { boxed: true })
    }

    y = sectionTitle(ctx, y, 'Signatures')
    y = ensureSpace(ctx, y, 90)
    const colW = (right - left) / 2
    ;[
        ['Owner', contract.owner_signed_name, contract.owner_signed_at],
        ['Tenant', contract.tenant_signed_name, contract.tenant_signed_at],
    ].forEach(([role, name, at], i) => {
        const x = left + i * colW
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(15)
        doc.setTextColor(...TEXT)
        doc.text(name || 'Not signed yet', x, y + 26)
        doc.setDrawColor(...LINE)
        doc.line(x, y + 34, x + colW - 24, y + 34)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...MUTED)
        doc.text(`${role} · signed electronically ${at ? stamp(at) : '—'}`, x, y + 48)
    })
    y += 70

    if (contract.verification_code) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...TEXT)
        doc.text(`Verification code: ${contract.verification_code}`, left, y)
        y += 14
    }
    if (contract.end_reason === 'terminated' || contract.status === 'Expired') {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...MUTED)
        doc.text(
            contract.end_reason === 'terminated'
                ? `Ended early by mutual agreement on ${formatDueDate(contract.end_date)}.`
                : `The lease ended on ${formatDueDate(contract.end_date)}.`,
            left,
            y
        )
    }

    footer(ctx, 'Signed electronically through NextSpace. The verification code identifies this exact version of the lease.')
    doc.save(`NextSpace-lease-${contract.contract_id}.pdf`)
}
