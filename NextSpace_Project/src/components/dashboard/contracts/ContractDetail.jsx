import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { currentLocale } from '../../../i18n'
import { BRAND_VALUES } from '../../../lib/brand'
import { DASH, DOT, QUOTE_CLOSE, QUOTE_OPEN } from '../../../lib/symbols'
import { formatDueDate, todayInElSalvador } from '../../../lib/rentSchedule'
import {
    EVENT_META,
    addDays,
    contractActions,
    daysLeft,
    dueDayLabel,
    money,
    offerExpiresIn,
    personName,
    recordSummary,
    renewalExpiresIn,
    renewalOpen,
    renewalState,
    standardClauses,
    statusMeta,
} from '../../../lib/contracts'
import { leaseTimeProgress } from '../../../lib/leaseInsights'
import { downloadContractPdf } from '../../../lib/contractDocuments'
import OfferContractModal from './OfferContractModal'
import ReasonModal from './ReasonModal'
import SignContractModal from './SignContractModal'
import ApplicantRecord from './ApplicantRecord'
import { RenewalOfferModal, RenewalRequestModal, RenewalSignModal } from './RenewalModals'

function stamp(ts) {
    if (!ts) return null
    return new Date(ts).toLocaleString(currentLocale(), {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/El_Salvador',
    })
}

// The contract's path so far: requested → offer → signed → active → end,
// with the date of each step reached and the current one highlighted.
function contractSteps(contract, events, today) {
    const firstOf = (kind) => events.filter((e) => e.kind === kind).map((e) => e.created_at).sort()[0]
    const invited = contract.origin === 'invite' || Boolean(firstOf('invited'))
    const day = (ts) => (ts ? formatDueDate(String(ts).slice(0, 10)) : null)
    const t = (key) => i18n.t(`contractDetail.steps.${key}`)
    const steps = [
        { id: 'requested', label: invited ? t('invited') : t('requested'), date: day(firstOf('invited') || contract.requested_at || firstOf('requested')) },
        { id: 'offer', label: t('offer'), date: day(contract.owner_signed_at || contract.offered_at) },
        { id: 'signed', label: t('signed'), date: day(contract.tenant_signed_at) },
        {
            id: 'active',
            label: contract.start_date && contract.start_date > today ? t('starts') : t('active'),
            date: contract.tenant_signed_at ? day(contract.start_date) : null,
        },
        {
            id: 'end',
            label:
                contract.status === 'Expired' || contract.status === 'Cancelled'
                    ? contract.end_reason === 'terminated'
                        ? t('endedEarly')
                        : t('ended')
                    : contract.renewal_count > 0
                      ? t('renewedEnds')
                      : t('ends'),
            date: contract.tenant_signed_at ? day(contract.end_date) : null,
        },
    ]

    if (contract.status === 'Declined' || contract.status === 'Withdrawn') {
        const reached = contract.offered_at || contract.owner_signed_at ? 2 : 1
        return [
            ...steps.slice(0, reached).map((st) => ({ ...st, state: 'done' })),
            { id: 'stop', label: contract.status === 'Declined' ? t('declined') : t('withdrawn'), date: day(contract.closed_at), state: 'stopped' },
        ]
    }

    const current = {
        Pending: 1,
        Offered: 2,
        Active: contract.start_date && contract.start_date > today ? 3 : 4,
        Expired: 5,
        Cancelled: 5,
    }[contract.status] ?? 0
    return steps.map((st, i) => ({ ...st, state: i < current ? 'done' : i === current ? 'current' : 'todo' }))
}

// One lease, shown as the actual contract: status and next step at the top,
// then parties, key terms, clauses, signatures and history. The buttons shown
// depend on the status and on who is looking.
export default function ContractDetail({ contract, events, viewer, myName, ownerName, record, onBack, onChanged, onAskRony, onOpenPayments }) {
    const { t } = useTranslation()
    const q = (text) => `${QUOTE_OPEN}${text}${QUOTE_CLOSE}`
    const today = todayInElSalvador()
    const [modal, setModal] = useState(null)
    const [notice, setNotice] = useState('')
    const [pdfBusy, setPdfBusy] = useState(false)
    const property = contract.add_business || {}
    const owner = property.users
    const tenant = contract.users
    const meta = statusMeta(contract)
    const isOwner = viewer === 'owner'
    const expiry = offerExpiresIn(contract)
    const left = daysLeft(contract, today)
    const hasTerms = Boolean(contract.start_date && contract.end_date)
    const signed = Boolean(contract.tenant_signed_at && contract.owner_signed_at)
    const terminationPending = contract.status === 'Active' && contract.termination_requested_at
    const iAskedTermination = terminationPending && contract.termination_requested_by === viewer
    const canRenew = renewalOpen(contract, today)
    const renewal = contract.status === 'Active' ? renewalState(contract) : null
    const summary = recordSummary(record)

    useEffect(() => {
        window.scrollTo({ top: 0 })
    }, [contract.contract_id])

    const done = (message) => {
        setModal(null)
        setNotice(message)
        onChanged()
    }

    const downloadPdf = async () => {
        setPdfBusy(true)
        try {
            await downloadContractPdf(contract)
        } finally {
            setPdfBusy(false)
        }
    }

    // What this person can do right now.
    const actions = []
    const a = (key) => t(`contractDetail.actions.${key}`)
    if (isOwner && contract.status === 'Pending') {
        actions.push({ id: 'offer', label: a('makeOffer'), icon: 'bi-pen', primary: true })
        actions.push({ id: 'decline', label: a('decline'), icon: 'bi-x-lg' })
    }
    if (isOwner && contract.status === 'Offered') {
        actions.push({ id: 'offer', label: a('updateOffer'), icon: 'bi-pencil' })
        actions.push({ id: 'decline', label: a('cancelOffer'), icon: 'bi-x-lg' })
    }
    if (!isOwner && contract.status === 'Pending') {
        actions.push({ id: 'withdraw', label: a('withdrawRequest'), icon: 'bi-arrow-counterclockwise' })
    }
    if (!isOwner && contract.status === 'Offered' && !expiry?.expired) {
        actions.push({ id: 'sign', label: a('reviewSign'), icon: 'bi-pen', primary: true })
        actions.push({ id: 'withdraw', label: a('turnDown'), icon: 'bi-x-lg' })
    }
    if (canRenew && isOwner) {
        if (renewal === 'offered') {
            actions.push({ id: 'renew-offer', label: a('updateRenewal'), icon: 'bi-pencil' })
            actions.push({ id: 'renew-decline', label: a('withdrawRenewal'), icon: 'bi-x-lg' })
        } else {
            actions.push({
                id: 'renew-offer',
                label: renewal === 'requested' ? a('answerRenewal') : a('offerRenewal'),
                icon: 'bi-arrow-repeat',
                primary: true,
            })
            if (renewal === 'requested') actions.push({ id: 'renew-decline', label: a('declineRenewal'), icon: 'bi-x-lg' })
        }
    }
    if (canRenew && !isOwner) {
        if (renewal === 'offered') {
            actions.push({ id: 'renew-sign', label: a('reviewSignRenewal'), icon: 'bi-pen', primary: true })
            actions.push({ id: 'renew-decline', label: a('turnDownRenewal'), icon: 'bi-x-lg' })
        } else if (renewal === 'requested') {
            actions.push({ id: 'renew-decline', label: a('cancelRenewalRequest'), icon: 'bi-x-lg' })
        } else {
            actions.push({ id: 'renew-request', label: a('askRenew'), icon: 'bi-arrow-repeat', primary: true })
        }
    }
    if (contract.status === 'Active' && !terminationPending && !renewal) {
        actions.push({ id: 'terminate', label: a('askEndEarly'), icon: 'bi-box-arrow-right' })
    }
    if (terminationPending && !iAskedTermination) {
        actions.push({ id: 'accept-end', label: a('acceptEnd'), icon: 'bi-check2', primary: true })
        actions.push({ id: 'decline-end', label: a('declineEnd'), icon: 'bi-x-lg' })
    }

    const runAction = async (id) => {
        if (id === 'accept-end' || id === 'decline-end') {
            try {
                await contractActions.respondTermination({ contractId: contract.contract_id, accept: id === 'accept-end' })
                done(id === 'accept-end' ? t('contractDetail.done.endAccepted') : t('contractDetail.done.endDeclined'))
            } catch (err) {
                setNotice(err.message)
            }
            return
        }
        setModal(id)
    }

    // The "next step" banner at the top.
    let banner = null
    const b = (key, values) => t(`contractDetail.banner.${key}`, { ...BRAND_VALUES, ...values })
    if (contract.status === 'Pending') {
        banner = isOwner
            ? { tone: 'info', text: b('pendingOwner', { person: personName(tenant) }) }
            : { tone: 'info', text: b('pendingTenant') }
    } else if (contract.status === 'Offered') {
        banner = isOwner
            ? { tone: 'warning', text: b('offeredOwner', { person: personName(tenant), expiry: expiry?.text || '' }) }
            : expiry?.expired
              ? { tone: 'danger', text: b('offerExpired') }
              : { tone: 'warning', text: b('offeredTenant', { expiry: expiry?.text || '' }) }
    } else if (terminationPending) {
        banner = {
            tone: 'warning',
            text: iAskedTermination
                ? b('youAskedEnd', { date: formatDueDate(contract.termination_date) })
                : b('otherAskedEnd', {
                      side: t(`contractsBoard.side.${contract.termination_requested_by === 'owner' ? 'owner' : 'tenant'}`),
                      date: formatDueDate(contract.termination_date),
                      reason: q(contract.termination_reason),
                  }),
        }
    } else if (renewal === 'offered') {
        banner = {
            tone: 'warning',
            text: isOwner
                ? b('renewalOfferedOwner', {
                      count: contract.renewal_months,
                      rent: money(contract.renewal_rent),
                      person: personName(tenant),
                      expiry: renewalExpiresIn(contract) || '',
                  })
                : b('renewalOfferedTenant', { count: contract.renewal_months, rent: money(contract.renewal_rent), expiry: renewalExpiresIn(contract) || '' }),
        }
    } else if (renewal === 'requested') {
        banner = {
            tone: isOwner ? 'info' : 'neutral',
            text: isOwner
                ? b('renewalRequestedOwner', {
                      person: personName(tenant),
                      count: contract.renewal_request_months,
                      note: contract.renewal_request_note ? `: ${q(contract.renewal_request_note)}` : '.',
                  })
                : b('renewalRequestedTenant', { count: contract.renewal_request_months }),
        }
    } else if (canRenew) {
        banner = {
            tone: 'info',
            text: isOwner
                ? b('canRenewOwner', {
                      count: left,
                      record: summary.pct != null ? b('canRenewRecord', { person: personName(tenant), record: summary.short }) : '',
                  })
                : b('canRenewTenant', { count: left }),
        }
    } else if (contract.status === 'Declined' || contract.status === 'Withdrawn') {
        banner = {
            tone: 'neutral',
            text: `${contract.status === 'Declined' ? t('contractDetail.steps.declined') : t('contractDetail.steps.withdrawn')}${contract.decline_reason ? `: ${q(contract.decline_reason)}` : '.'}`,
        }
    }

    const [openClauses, setOpenClauses] = useState(() => new Set())
    const steps = contractSteps(contract, events, today)
    const clauses = hasTerms ? standardClauses(contract) : []
    // The decision(s) this person has to make are buttons; everything else is a
    // quiet link next to the "next step" note.
    const decisions = actions.filter((a) => a.id !== 'terminate')
    const quiet = [
        ...(contract.status === 'Active' && onOpenPayments
            ? [{ id: 'payments', label: t('contractDetail.quiet.payments'), icon: 'bi-credit-card', onClick: () => onOpenPayments(contract.contract_id) }]
            : []),
        ...((signed || contract.status === 'Offered') && hasTerms
            ? [{ id: 'pdf', label: pdfBusy ? t('contractDetail.quiet.preparing') : t('contractDetail.quiet.pdf'), icon: 'bi-file-earmark-pdf', onClick: downloadPdf, disabled: pdfBusy }]
            : []),
        ...(actions.some((a) => a.id === 'terminate')
            ? [{ id: 'terminate', label: a('askEndEarly'), icon: 'bi-box-arrow-right', onClick: () => runAction('terminate') }]
            : []),
    ]
    const history = [...events].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

    return (
        <>
            <nav className="ns-breadcrumb" aria-label={t('contractDetail.breadcrumb')}>
                <button type="button" onClick={onBack}>
                    <i className="bi bi-arrow-left"></i> {t('dashboard.nav.contracts')}
                </button>
                <i className="bi bi-chevron-right"></i>
                <strong>{property.property_name || t('common.property')}</strong>
            </nav>

            <section className="ns-contract-hero ns-contract-hero-v2">
                <div className="ns-contract-hero-main">
                    <div className="ns-contract-hero-photo">
                        {property.photo_url ? <img src={property.photo_url} alt="" /> : <i className="bi bi-shop"></i>}
                    </div>
                    <div className="ns-contract-hero-info">
                        <div className="ns-contract-hero-title">
                            <h1>{property.property_name || t('common.property')}</h1>
                            <span className={`ns-contract-status tone-${meta.tone}`}>
                                <i className={`bi ${meta.icon}`}></i> {meta.label}
                            </span>
                        </div>
                        <p>
                            {t('contractDetail.contractNumber', { id: contract.contract_id })}
                            <span className="ns-pay-dot">{DOT}</span>
                            {isOwner ? `${t('common.tenant')}: ${personName(tenant)}` : `${t('common.owner')}: ${personName(owner)}`}
                            {hasTerms && (
                                <>
                                    <span className="ns-pay-dot">{DOT}</span>
                                    {money(contract.monthly_rent)}
                                    {t('common.perMonth')}
                                </>
                            )}
                        </p>
                        {contract.status === 'Active' && hasTerms && (
                            <div className="ns-lease-time">
                                <div className="ns-pay-progress-track">
                                    <div
                                        className="ns-pay-progress-fill ns-fill-navy"
                                        style={{ width: `${Math.round(leaseTimeProgress(contract, today) * 100)}%` }}
                                    />
                                </div>
                                <span>{left != null && left >= 0 ? t('contractDetail.daysLeft', { count: left }) : t('contractDetail.ending')}</span>
                            </div>
                        )}
                    </div>
                    {decisions.length > 0 && (
                        <div className="ns-contract-hero-actions">
                            {decisions.map((a) => (
                                <button
                                    type="button"
                                    key={a.id}
                                    className={a.primary ? 'ns-filled-btn' : 'ns-outline-btn'}
                                    onClick={() => runAction(a.id)}
                                >
                                    <i className={`bi ${a.icon}`}></i> {a.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <ol className="ns-contract-steps" aria-label={t('contractDetail.progress')}>
                    {steps.map((st) => (
                        <li key={st.id} className={`is-${st.state}`} aria-current={st.state === 'current' ? 'step' : undefined}>
                            <span className="ns-contract-step-dot">
                                {st.state === 'done' ? (
                                    <i className="bi bi-check-lg"></i>
                                ) : st.state === 'stopped' ? (
                                    <i className="bi bi-x-lg"></i>
                                ) : null}
                            </span>
                            <strong>{st.label}</strong>
                            <small>{st.date || (st.state === 'current' ? t('contractDetail.nextStep') : DASH)}</small>
                        </li>
                    ))}
                </ol>

                {(banner || quiet.length > 0) && (
                    <div className="ns-contract-hero-foot">
                        {banner ? (
                            <div className={`ns-contract-banner tone-${banner.tone}`} role="status">
                                <i
                                    className={`bi ${banner.tone === 'danger' ? 'bi-exclamation-octagon' : banner.tone === 'warning' ? 'bi-hourglass-split' : 'bi-info-circle'}`}
                                ></i>
                                <span>{banner.text}</span>
                            </div>
                        ) : (
                            <span />
                        )}
                        {quiet.length > 0 && (
                            <div className="ns-quiet-actions">
                                {quiet.map((q) => (
                                    <button type="button" key={q.id} onClick={q.onClick} disabled={q.disabled}>
                                        <i className={`bi ${q.icon}`}></i> {q.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>

            {notice && (
                <div className="alert alert-success d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>{notice}</span>
                    <button type="button" className="btn-close" aria-label={t('common.dismiss')} onClick={() => setNotice('')} />
                </div>
            )}

            <div className="ns-contract-grid">
                <article className="ns-contract-doc">
                    <header className="ns-contract-doc-head">
                        <span>{t('contractDetail.doc.title')}</span>
                        <strong>{property.property_name}</strong>
                        {contract.verification_code && <small>{t('contractDetail.doc.verification', { code: contract.verification_code })}</small>}
                    </header>

                    <section>
                        <h4>{t('docs.lease.parties')}</h4>
                        <dl className="ns-contract-terms">
                            <div>
                                <dt>{t('common.owner')}</dt>
                                <dd>{personName(owner)}</dd>
                            </div>
                            <div>
                                <dt>{t('common.tenant')}</dt>
                                <dd>
                                    {personName(tenant)}
                                    {contract.tenant_dui ? ` ${DOT} DUI ${contract.tenant_dui}` : ''}
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section>
                        <h4>{t('docs.lease.keyTerms')}</h4>
                        {hasTerms ? (
                            <dl className="ns-contract-terms ns-contract-terms-3">
                                <div>
                                    <dt>{t('docs.lease.monthlyRent')}</dt>
                                    <dd>
                                        {money(contract.monthly_rent)}
                                        {contract.previous_rent != null && contract.rent_changes_from && (
                                            <small className="ns-contract-term-note">
                                                {t('contractDetail.terms.rentChange', {
                                                    date: formatDueDate(contract.rent_changes_from),
                                                    previous: money(contract.previous_rent),
                                                })}
                                            </small>
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt>{t('docs.lease.rentDue')}</dt>
                                    <dd>{t('docs.lease.rentDueValue', { day: dueDayLabel(contract.start_date) })}</dd>
                                </div>
                                <div>
                                    <dt>{t('docs.lease.deposit')}</dt>
                                    <dd>{Number(contract.deposit || 0) > 0 ? money(contract.deposit) : t('common.none')}</dd>
                                </div>
                                <div>
                                    <dt>{t('docs.lease.start')}</dt>
                                    <dd>{formatDueDate(contract.start_date)}</dd>
                                </div>
                                <div>
                                    <dt>{t('docs.lease.end')}</dt>
                                    <dd>{formatDueDate(contract.end_date)}</dd>
                                </div>
                                <div>
                                    <dt>{t('docs.lease.length')}</dt>
                                    <dd>{contract.duration_months ? t('common.month', { count: contract.duration_months }) : DASH}</dd>
                                </div>
                            </dl>
                        ) : (
                            <p className="ns-pay-muted mb-0">
                                {t('contractDetail.terms.requestedAt', { rent: money(contract.monthly_rent) })}
                            </p>
                        )}
                    </section>

                    {hasTerms && (
                        <section>
                            <div className="ns-contract-clauses-head">
                                <h4>{t('docs.lease.clauses')}</h4>
                                <button
                                    type="button"
                                    className="ns-link-btn"
                                    onClick={() =>
                                        setOpenClauses((prev) =>
                                            prev.size === clauses.length ? new Set() : new Set(clauses.map((_, i) => i))
                                        )
                                    }
                                >
                                    {openClauses.size === clauses.length ? t('contractDetail.collapseAll') : t('contractDetail.expandAll')}
                                </button>
                            </div>
                            <ol className="ns-contract-clauses ns-contract-clauses-accordion">
                                {clauses.map((c, i) => {
                                    const open = openClauses.has(i)
                                    return (
                                        <li key={c.title} className={open ? 'is-open' : ''}>
                                            <button
                                                type="button"
                                                aria-expanded={open}
                                                onClick={() =>
                                                    setOpenClauses((prev) => {
                                                        const next = new Set(prev)
                                                        if (next.has(i)) next.delete(i)
                                                        else next.add(i)
                                                        return next
                                                    })
                                                }
                                            >
                                                <span>
                                                    {i + 1}. {c.title}
                                                </span>
                                                <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
                                            </button>
                                            {open && <p>{c.body}</p>}
                                        </li>
                                    )
                                })}
                            </ol>
                            {contract.special_clauses && (
                                <div className="ns-contract-special">
                                    <strong>{t('docs.lease.specialClauses')}</strong>
                                    <p>{contract.special_clauses}</p>
                                </div>
                            )}
                        </section>
                    )}

                    {hasTerms && (
                        <section>
                            <h4>{t('docs.lease.signatures')}</h4>
                            <div className="ns-contract-signatures">
                                {[
                                    [t('common.owner'), contract.owner_signed_name, contract.owner_signed_at],
                                    [t('common.tenant'), contract.tenant_signed_name, contract.tenant_signed_at],
                                ].map(([role, name, at]) => (
                                    <div key={role} className={at ? 'is-signed' : ''}>
                                        <span className="ns-contract-sig-name">{name || t('contractDetail.waitingSignature')}</span>
                                        <small>
                                            {role}
                                            {at ? ` ${DOT} ${t('contractDetail.signedAt', { date: stamp(at) })}` : ''}
                                        </small>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {contract.renewal_count > 0 && (
                        <section>
                            <h4>{t('contractDetail.renewals')}</h4>
                            <p className="ns-contract-renewal-line">
                                {t('contractDetail.renewedLine', {
                                    count: contract.renewal_count,
                                    date: stamp(contract.last_renewed_at),
                                    owner: contract.last_renewal_owner_name,
                                    tenant: contract.last_renewal_tenant_name,
                                    end: formatDueDate(contract.end_date),
                                })}
                            </p>
                        </section>
                    )}
                </article>

                <aside className="ns-contract-side">
                    {isOwner && contract.tenant_dui && <ApplicantRecord record={record} name={personName(tenant)} />}

                    {onAskRony && (
                        <section className="ns-panel ns-contract-rony">
                            <h3>
                                <i className="bi bi-stars"></i> {t('insights.owner.askRony', BRAND_VALUES)}
                            </h3>
                            {(isOwner
                                ? [
                                      t('contractDetail.ask.fairRent', { ...BRAND_VALUES, rent: money(contract.monthly_rent), name: property.property_name }),
                                      t('contractDetail.ask.clauses', { name: property.property_name }),
                                      contract.status === 'Pending' || contract.status === 'Offered'
                                          ? t('contractDetail.ask.accept', {
                                                ...BRAND_VALUES,
                                                person: personName(tenant),
                                                name: property.property_name,
                                                record: summary.short,
                                                detail: record
                                                    ? t('contractDetail.ask.acceptDetail', { onTime: record.months_on_time, due: record.months_due, leases: record.leases })
                                                    : '',
                                            })
                                          : t('contractDetail.ask.renew', { person: personName(tenant), record: summary.short }),
                                  ]
                                : [
                                      t('contractDetail.ask.explain', {
                                          name: property.property_name,
                                          rent: money(contract.monthly_rent),
                                          months: contract.duration_months || '',
                                          deposit: money(contract.deposit),
                                      }),
                                      t('contractDetail.ask.check', { name: property.property_name }),
                                      t('contractDetail.ask.goodPrice', { ...BRAND_VALUES, rent: money(contract.monthly_rent), name: property.property_name }),
                                  ]
                            ).map((question) => (
                                <button type="button" key={question} onClick={() => onAskRony({ text: question })}>
                                    {question}
                                </button>
                            ))}
                        </section>
                    )}

                    <section className="ns-panel">
                        <div className="ns-panel-head">
                            <h3>{t('contractDetail.history')}</h3>
                        </div>
                        {history.length === 0 ? (
                            <p className="ns-pay-muted mb-0">
                                {contract.requested_at ? t('contractDetail.requestedOn', { date: stamp(contract.requested_at) }) : t('contractDetail.noHistory')}
                            </p>
                        ) : (
                            <ol className="ns-contract-history">
                                {history.map((e) => {
                                    const m = EVENT_META[e.kind] || { icon: 'bi-dot', label: e.kind }
                                    return (
                                        <li key={e.event_id}>
                                            <i className={`bi ${m.icon}`}></i>
                                            <div>
                                                <strong>{m.label}</strong>
                                                <span>{e.message}</span>
                                                <time>{stamp(e.created_at)}</time>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ol>
                        )}
                    </section>
                </aside>
            </div>

            {modal === 'offer' && (
                <OfferContractModal
                    contract={contract}
                    ownerName={ownerName}
                    onAskRony={onAskRony}
                    onClose={() => setModal(null)}
                    onDone={() => done(t('contractDetail.done.offerSent', { person: personName(tenant) }))}
                />
            )}
            {modal === 'sign' && (
                <SignContractModal
                    contract={contract}
                    tenantName={myName}
                    onClose={() => setModal(null)}
                    onSigned={(code) => done(t('contractDetail.done.leaseSigned', { code }))}
                />
            )}
            {modal === 'renew-offer' && (
                <RenewalOfferModal
                    contract={contract}
                    ownerName={ownerName}
                    record={record}
                    onAskRony={onAskRony}
                    onClose={() => setModal(null)}
                    onDone={() => done(t('contractDetail.done.renewalOfferSent', { person: personName(tenant) }))}
                />
            )}
            {modal === 'renew-request' && (
                <RenewalRequestModal
                    contract={contract}
                    onAskRony={onAskRony}
                    onClose={() => setModal(null)}
                    onSent={() => done(t('contractDetail.done.renewalRequestSent'))}
                />
            )}
            {modal === 'renew-sign' && (
                <RenewalSignModal
                    contract={contract}
                    tenantName={myName}
                    onClose={() => setModal(null)}
                    onSigned={(code) => done(t('contractDetail.done.renewalSigned', { code }))}
                />
            )}
            {modal === 'renew-decline' && (
                <ReasonModal
                    title={
                        renewal === 'offered'
                            ? isOwner
                                ? t('contractDetail.reason.withdrawRenewal')
                                : t('contractDetail.reason.turnDownRenewal')
                            : isOwner
                              ? t('contractDetail.reason.declineRenewal')
                              : t('contractDetail.reason.cancelRenewal')
                    }
                    subtitle={t('contractDetail.reason.renewalSubtitle', { date: formatDueDate(contract.end_date) })}
                    placeholder={t('contractDetail.reason.renewalPlaceholder')}
                    confirmLabel={t('common.confirm')}
                    danger
                    onClose={() => setModal(null)}
                    onConfirm={async ({ reason }) => {
                        await contractActions.declineRenewal({ contractId: contract.contract_id, reason })
                        done(t('contractDetail.done.otherNotified'))
                    }}
                />
            )}
            {modal === 'decline' && (
                <ReasonModal
                    title={contract.status === 'Offered' ? t('contractDetail.reason.cancelOffer') : t('contractDetail.reason.declineRequest')}
                    subtitle={t('contractDetail.reason.declineSubtitle', { person: personName(tenant) })}
                    placeholder={t('contractDetail.reason.declinePlaceholder')}
                    confirmLabel={contract.status === 'Offered' ? t('contractDetail.actions.cancelOffer') : t('contractDetail.reason.declineRequestButton')}
                    danger
                    onClose={() => setModal(null)}
                    onConfirm={async ({ reason }) => {
                        await contractActions.decline({ contractId: contract.contract_id, reason })
                        done(t('contractDetail.done.businessNotified'))
                    }}
                />
            )}
            {modal === 'withdraw' && (
                <ReasonModal
                    title={contract.status === 'Offered' ? t('contractDetail.reason.turnDownOffer') : t('contractDetail.reason.withdrawRequest')}
                    subtitle={t('contractDetail.reason.ownerNotified')}
                    placeholder={t('contractDetail.reason.withdrawPlaceholder')}
                    confirmLabel={contract.status === 'Offered' ? t('contractDetail.reason.turnDownOfferButton') : t('contractDetail.actions.withdrawRequest')}
                    danger
                    onClose={() => setModal(null)}
                    onConfirm={async ({ reason }) => {
                        await contractActions.withdraw({ contractId: contract.contract_id, reason })
                        done(t('contractDetail.done.ownerNotified'))
                    }}
                />
            )}
            {modal === 'terminate' && (
                <ReasonModal
                    title={t('contractDetail.reason.endTitle')}
                    subtitle={t('contractDetail.reason.endSubtitle')}
                    reasonRequired
                    placeholder={t('contractDetail.reason.endPlaceholder')}
                    withDate
                    minDate={[today, addDays(contract.start_date, 1)].sort().pop()}
                    maxDate={addDays(contract.end_date, -1)}
                    confirmLabel={t('contractDetail.reason.sendRequest')}
                    onClose={() => setModal(null)}
                    onConfirm={async ({ reason, date }) => {
                        await contractActions.requestTermination({ contractId: contract.contract_id, date, reason })
                        done(t('contractDetail.done.endRequestSent'))
                    }}
                />
            )}
        </>
    )
}
