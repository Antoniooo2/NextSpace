// The signed lease as a PDF: parties, terms, the standard and special
// clauses, both signatures with their timestamps, and the verification code.
import { formatDueDate } from './rentSchedule'
import { dueDayLabel, money, personName, standardClauses, statusMeta } from './contracts'
import { contractRate, formatRate } from './platformFee'
import { ensureSpace, facts, footer, header, newDoc, paragraph, sectionTitle } from './paymentReports'
import i18n, { currentLocale } from '../i18n'
import { BRAND_NAME, BRAND_VALUES } from './brand'
import { DASH, DOT } from './symbols'

const TEXT = [26, 31, 43]
const MUTED = [110, 120, 138]
const LINE = [229, 234, 243]

const LONG_DATE = { month: 'long', day: 'numeric', year: 'numeric' }

const t = (key, values) => i18n.t(`docs.lease.${key}`, { ...BRAND_VALUES, ...values })

function stamp(ts) {
    if (!ts) return DASH
    return new Date(ts).toLocaleString(currentLocale(), {
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

    let y = header(
        ctx,
        t('title', { name: property.property_name || i18n.t('common.property') }),
        t('subtitle', { id: contract.contract_id, status: statusMeta(contract).label })
    )

    y = sectionTitle(ctx, y, t('parties'))
    y = facts(ctx, y + 8, [
        [t('owner'), `${contract.owner_signed_name || personName(owner)}`],
        [t('tenant'), `${contract.tenant_signed_name || personName(tenant)}${contract.tenant_dui ? ` ${DOT} DUI ${contract.tenant_dui}` : ''}`],
        [t('space'), property.property_name],
        [t('location'), [property.address, property.municipality, property.department].filter(Boolean).join(', ') || DASH],
    ])

    y = sectionTitle(ctx, y, t('keyTerms'))
    y = facts(ctx, y + 8, [
        [
            t('monthlyRent'),
            contract.previous_rent != null && contract.rent_changes_from
                ? t('rentChange', {
                      rent: money(contract.monthly_rent),
                      date: formatDueDate(contract.rent_changes_from),
                      previous: money(contract.previous_rent),
                  })
                : money(contract.monthly_rent),
        ],
        [t('rentDue'), t('rentDueValue', { day: dueDayLabel(contract.start_date) })],
        [t('start'), formatDueDate(contract.start_date, LONG_DATE)],
        [t('end'), formatDueDate(contract.end_date, LONG_DATE)],
        [t('length'), contract.duration_months ? i18n.t('common.month', { count: contract.duration_months }) : DASH],
        [t('deposit'), Number(contract.deposit || 0) > 0 ? money(contract.deposit) : i18n.t('common.none')],
        [t('fee'), t('feeValue', { rate: formatRate(contractRate(contract)) })],
    ])

    y = sectionTitle(ctx, y, t('clauses'))
    standardClauses(contract).forEach((clause, i) => {
        y = ensureSpace(ctx, y, 40)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...TEXT)
        doc.text(`${i + 1}. ${clause.title}`, left, y + 6)
        y = paragraph(ctx, y + 20, clause.body)
    })

    if (contract.special_clauses) {
        y = sectionTitle(ctx, y, t('specialClauses'))
        y = paragraph(ctx, y + 8, contract.special_clauses, { boxed: true })
    }

    y = sectionTitle(ctx, y, t('signatures'))
    y = ensureSpace(ctx, y, 90)
    const colW = (right - left) / 2
    ;[
        [t('owner'), contract.owner_signed_name, contract.owner_signed_at],
        [t('tenant'), contract.tenant_signed_name, contract.tenant_signed_at],
    ].forEach(([role, name, at], i) => {
        const x = left + i * colW
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(15)
        doc.setTextColor(...TEXT)
        doc.text(name || t('notSigned'), x, y + 26)
        doc.setDrawColor(...LINE)
        doc.line(x, y + 34, x + colW - 24, y + 34)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...MUTED)
        doc.text(t('signedElectronically', { role, date: at ? stamp(at) : DASH }), x, y + 48)
    })
    y += 70

    if (contract.renewal_count > 0) {
        y = ensureSpace(ctx, y, 40)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...MUTED)
        y = paragraph(
            ctx,
            y,
            t('renewed', {
                count: contract.renewal_count,
                date: stamp(contract.last_renewed_at),
                owner: contract.last_renewal_owner_name,
                tenant: contract.last_renewal_tenant_name,
                end: formatDueDate(contract.end_date, LONG_DATE),
            })
        )
        y += 6
    }

    if (contract.verification_code) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...TEXT)
        doc.text(t('verificationCode', { code: contract.verification_code }), left, y)
        y += 14
    }
    if (contract.end_reason === 'terminated' || contract.status === 'Expired') {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...MUTED)
        doc.text(
            contract.end_reason === 'terminated'
                ? t('endedEarly', { date: formatDueDate(contract.end_date) })
                : t('ended', { date: formatDueDate(contract.end_date) }),
            left,
            y
        )
    }

    footer(ctx, t('footer'))
    doc.save(`${BRAND_NAME}-${t('fileName')}-${contract.contract_id}.pdf`)
}
