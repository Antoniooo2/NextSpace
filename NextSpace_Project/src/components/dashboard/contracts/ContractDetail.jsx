import { useEffect, useState } from 'react'
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
    return new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/El_Salvador',
    })
}

// One lease, shown as the actual contract: status and next step at the top,
// then parties, key terms, clauses, signatures and history. The buttons shown
// depend on the status and on who is looking.
export default function ContractDetail({ contract, events, viewer, myName, ownerName, record, onBack, onChanged, onAskRony, onOpenPayments }) {
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
    if (isOwner && contract.status === 'Pending') {
        actions.push({ id: 'offer', label: 'Make an offer', icon: 'bi-pen', primary: true })
        actions.push({ id: 'decline', label: 'Decline', icon: 'bi-x-lg' })
    }
    if (isOwner && contract.status === 'Offered') {
        actions.push({ id: 'offer', label: 'Update offer', icon: 'bi-pencil' })
        actions.push({ id: 'decline', label: 'Cancel offer', icon: 'bi-x-lg' })
    }
    if (!isOwner && contract.status === 'Pending') {
        actions.push({ id: 'withdraw', label: 'Withdraw request', icon: 'bi-arrow-counterclockwise' })
    }
    if (!isOwner && contract.status === 'Offered' && !expiry?.expired) {
        actions.push({ id: 'sign', label: 'Review and sign', icon: 'bi-pen', primary: true })
        actions.push({ id: 'withdraw', label: 'Turn down', icon: 'bi-x-lg' })
    }
    if (canRenew && isOwner) {
        if (renewal === 'offered') {
            actions.push({ id: 'renew-offer', label: 'Update renewal offer', icon: 'bi-pencil' })
            actions.push({ id: 'renew-decline', label: 'Withdraw renewal', icon: 'bi-x-lg' })
        } else {
            actions.push({
                id: 'renew-offer',
                label: renewal === 'requested' ? 'Answer with a renewal offer' : 'Offer renewal',
                icon: 'bi-arrow-repeat',
                primary: true,
            })
            if (renewal === 'requested') actions.push({ id: 'renew-decline', label: 'Decline renewal', icon: 'bi-x-lg' })
        }
    }
    if (canRenew && !isOwner) {
        if (renewal === 'offered') {
            actions.push({ id: 'renew-sign', label: 'Review and sign renewal', icon: 'bi-pen', primary: true })
            actions.push({ id: 'renew-decline', label: 'Turn down renewal', icon: 'bi-x-lg' })
        } else if (renewal === 'requested') {
            actions.push({ id: 'renew-decline', label: 'Cancel renewal request', icon: 'bi-x-lg' })
        } else {
            actions.push({ id: 'renew-request', label: 'Ask to renew', icon: 'bi-arrow-repeat', primary: true })
        }
    }
    if (contract.status === 'Active' && !terminationPending && !renewal) {
        actions.push({ id: 'terminate', label: 'Ask to end early', icon: 'bi-box-arrow-right' })
    }
    if (terminationPending && !iAskedTermination) {
        actions.push({ id: 'accept-end', label: 'Accept early end', icon: 'bi-check2', primary: true })
        actions.push({ id: 'decline-end', label: 'Decline early end', icon: 'bi-x-lg' })
    }

    const runAction = async (id) => {
        if (id === 'accept-end' || id === 'decline-end') {
            try {
                await contractActions.respondTermination({ contractId: contract.contract_id, accept: id === 'accept-end' })
                done(id === 'accept-end' ? 'Early end accepted. The rent schedule was updated.' : 'Early end declined. The lease continues.')
            } catch (err) {
                setNotice(err.message)
            }
            return
        }
        setModal(id)
    }

    // The "next step" banner at the top.
    let banner = null
    if (contract.status === 'Pending') {
        banner = isOwner
            ? { tone: 'info', text: `${personName(tenant)} wants to lease this space. Answer with an offer (you sign it by sending it) or decline.` }
            : { tone: 'info', text: 'Your request was sent. The owner will answer with an offer to sign, or decline it.' }
    } else if (contract.status === 'Offered') {
        banner = isOwner
            ? { tone: 'warning', text: `Waiting for ${personName(tenant)} to sign. ${expiry?.text || ''}.` }
            : expiry?.expired
              ? { tone: 'danger', text: 'This offer expired. Ask the owner to send it again.' }
              : { tone: 'warning', text: `The owner sent you an offer and signed it. Review it below and sign. ${expiry?.text || ''}.` }
    } else if (terminationPending) {
        banner = {
            tone: 'warning',
            text: iAskedTermination
                ? `You asked to end the lease on ${formatDueDate(contract.termination_date)}. Waiting for the other side to answer.`
                : `The ${contract.termination_requested_by} asked to end the lease on ${formatDueDate(contract.termination_date)}: “${contract.termination_reason}”`,
        }
    } else if (renewal === 'offered') {
        banner = {
            tone: 'warning',
            text: isOwner
                ? `Renewal offer sent: ${contract.renewal_months} more months at ${money(contract.renewal_rent)}/month. Waiting for ${personName(tenant)} to sign. ${renewalExpiresIn(contract) || ''}.`
                : `The owner offers to renew for ${contract.renewal_months} more months at ${money(contract.renewal_rent)}/month. ${renewalExpiresIn(contract) || ''}.`,
        }
    } else if (renewal === 'requested') {
        banner = {
            tone: isOwner ? 'info' : 'neutral',
            text: isOwner
                ? `${personName(tenant)} asked to renew for ${contract.renewal_request_months} more months${contract.renewal_request_note ? `: “${contract.renewal_request_note}”` : '.'} Answer with a renewal offer.`
                : `You asked to renew for ${contract.renewal_request_months} more months. The owner will answer with an offer to sign.`,
        }
    } else if (canRenew) {
        banner = {
            tone: 'info',
            text: isOwner
                ? `This lease ends in ${left} days. ${summary.pct != null ? `${personName(tenant)} is ${summary.short} on NextSpace. ` : ''}Offer a renewal or plan to re-list the space.`
                : `Your lease ends in ${left} days. If you want to stay, ask the owner to renew.`,
        }
    } else if (contract.status === 'Declined' || contract.status === 'Withdrawn') {
        banner = {
            tone: 'neutral',
            text: `${contract.status === 'Declined' ? 'Declined' : 'Withdrawn'}${contract.decline_reason ? `: “${contract.decline_reason}”` : '.'}`,
        }
    }

    const history = [...events].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

    return (
        <>
            <button type="button" className="ns-detail-back" onClick={onBack}>
                <i className="bi bi-arrow-left"></i> All contracts
            </button>

            <section className="ns-contract-hero">
                <div className="ns-contract-hero-photo">
                    {property.photo_url ? <img src={property.photo_url} alt="" /> : <i className="bi bi-shop"></i>}
                </div>
                <div className="ns-contract-hero-info">
                    <div className="ns-contract-hero-title">
                        <h1>{property.property_name || 'Property'}</h1>
                        <span className={`ns-contract-status tone-${meta.tone}`}>
                            <i className={`bi ${meta.icon}`}></i> {meta.label}
                        </span>
                    </div>
                    <p>
                        Contract #{contract.contract_id}
                        <span className="ns-pay-dot">•</span>
                        {isOwner ? `Tenant: ${personName(tenant)}` : `Owner: ${personName(owner)}`}
                        {hasTerms && (
                            <>
                                <span className="ns-pay-dot">•</span>
                                {money(contract.monthly_rent)}/month
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
                            <span>{left != null && left >= 0 ? `${left} days left` : 'Ending'}</span>
                        </div>
                    )}
                </div>
                <div className="ns-contract-hero-actions">
                    {actions.map((a) => (
                        <button
                            type="button"
                            key={a.id}
                            className={a.primary ? 'ns-filled-btn' : 'ns-outline-btn'}
                            onClick={() => runAction(a.id)}
                        >
                            <i className={`bi ${a.icon}`}></i> {a.label}
                        </button>
                    ))}
                    {contract.status === 'Active' && onOpenPayments && (
                        <button type="button" className="ns-outline-btn" onClick={() => onOpenPayments(contract.contract_id)}>
                            <i className="bi bi-credit-card"></i> Rent in Payments
                        </button>
                    )}
                    {(signed || contract.status === 'Offered') && hasTerms && (
                        <button type="button" className="ns-outline-btn" onClick={downloadPdf} disabled={pdfBusy}>
                            <i className="bi bi-file-earmark-pdf"></i> {pdfBusy ? 'Preparing...' : 'Download PDF'}
                        </button>
                    )}
                </div>
            </section>

            {banner && (
                <div className={`ns-contract-banner tone-${banner.tone}`} role="status">
                    <i className={`bi ${banner.tone === 'danger' ? 'bi-exclamation-octagon' : banner.tone === 'warning' ? 'bi-hourglass-split' : 'bi-info-circle'}`}></i>
                    <span>{banner.text}</span>
                </div>
            )}
            {notice && (
                <div className="alert alert-success d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>{notice}</span>
                    <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setNotice('')} />
                </div>
            )}

            <div className="ns-contract-grid">
                <article className="ns-contract-doc">
                    <header className="ns-contract-doc-head">
                        <span>Commercial lease agreement</span>
                        <strong>{property.property_name}</strong>
                        {contract.verification_code && <small>Verification code {contract.verification_code}</small>}
                    </header>

                    <section>
                        <h4>Parties</h4>
                        <dl className="ns-contract-terms">
                            <div>
                                <dt>Owner</dt>
                                <dd>{personName(owner)}</dd>
                            </div>
                            <div>
                                <dt>Tenant</dt>
                                <dd>
                                    {personName(tenant)}
                                    {contract.tenant_dui ? ` · DUI ${contract.tenant_dui}` : ''}
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section>
                        <h4>Key terms</h4>
                        {hasTerms ? (
                            <dl className="ns-contract-terms ns-contract-terms-3">
                                <div>
                                    <dt>Monthly rent</dt>
                                    <dd>
                                        {money(contract.monthly_rent)}
                                        {contract.previous_rent != null && contract.rent_changes_from && (
                                            <small className="ns-contract-term-note">
                                                from {formatDueDate(contract.rent_changes_from)} (was {money(contract.previous_rent)})
                                            </small>
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Rent due</dt>
                                    <dd>The {dueDayLabel(contract.start_date)} of each month</dd>
                                </div>
                                <div>
                                    <dt>Deposit</dt>
                                    <dd>{Number(contract.deposit || 0) > 0 ? money(contract.deposit) : 'None'}</dd>
                                </div>
                                <div>
                                    <dt>Start</dt>
                                    <dd>{formatDueDate(contract.start_date)}</dd>
                                </div>
                                <div>
                                    <dt>End</dt>
                                    <dd>{formatDueDate(contract.end_date)}</dd>
                                </div>
                                <div>
                                    <dt>Length</dt>
                                    <dd>{contract.duration_months ? `${contract.duration_months} months` : '—'}</dd>
                                </div>
                            </dl>
                        ) : (
                            <p className="ns-pay-muted mb-0">
                                Requested at {money(contract.monthly_rent)}/month (the listing price). The terms appear here when the owner
                                sends an offer.
                            </p>
                        )}
                    </section>

                    {hasTerms && (
                        <section>
                            <h4>Clauses</h4>
                            <ol className="ns-contract-clauses">
                                {standardClauses(contract).map((c) => (
                                    <li key={c.title}>
                                        <strong>{c.title}.</strong> {c.body}
                                    </li>
                                ))}
                            </ol>
                            {contract.special_clauses && (
                                <div className="ns-contract-special">
                                    <strong>Special clauses</strong>
                                    <p>{contract.special_clauses}</p>
                                </div>
                            )}
                        </section>
                    )}

                    {hasTerms && (
                        <section>
                            <h4>Signatures</h4>
                            <div className="ns-contract-signatures">
                                {[
                                    ['Owner', contract.owner_signed_name, contract.owner_signed_at],
                                    ['Tenant', contract.tenant_signed_name, contract.tenant_signed_at],
                                ].map(([role, name, at]) => (
                                    <div key={role} className={at ? 'is-signed' : ''}>
                                        <span className="ns-contract-sig-name">{name || 'Waiting for signature'}</span>
                                        <small>
                                            {role}
                                            {at ? ` · signed ${stamp(at)}` : ''}
                                        </small>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {contract.renewal_count > 0 && (
                        <section>
                            <h4>Renewals</h4>
                            <p className="ns-contract-renewal-line">
                                Renewed {contract.renewal_count} {contract.renewal_count === 1 ? 'time' : 'times'}. Last renewal signed{' '}
                                {stamp(contract.last_renewed_at)} by {contract.last_renewal_owner_name} (owner) and{' '}
                                {contract.last_renewal_tenant_name} (tenant). The lease now ends on{' '}
                                {formatDueDate(contract.end_date)}.
                            </p>
                        </section>
                    )}
                </article>

                <aside className="ns-contract-side">
                    {isOwner && contract.tenant_dui && <ApplicantRecord record={record} name={personName(tenant)} />}

                    {onAskRony && (
                        <section className="ns-panel ns-contract-rony">
                            <h3>
                                <i className="bi bi-stars"></i> Ask Rony
                            </h3>
                            {(isOwner
                                ? [
                                      `Is ${money(contract.monthly_rent)}/month a fair rent for "${property.property_name}" compared with similar listings on NextSpace?`,
                                      `Suggest special clauses for this lease of "${property.property_name}".`,
                                      contract.status === 'Pending' || contract.status === 'Offered'
                                          ? `${personName(tenant)} wants to lease "${property.property_name}". Their NextSpace record: ${summary.short}${record ? ` (${record.months_on_time}/${record.months_due} months on time, ${record.leases} leases)` : ''}. Should I accept, and on what terms?`
                                          : `How is ${personName(tenant)} doing with rent, and should I renew this lease? Their record: ${summary.short}.`,
                                  ]
                                : [
                                      `Explain my lease for "${property.property_name}" in simple words: rent ${money(contract.monthly_rent)}/month, ${contract.duration_months || ''} months, deposit ${money(contract.deposit)}.`,
                                      `What should I check before signing a commercial lease for "${property.property_name}"?`,
                                      `Is ${money(contract.monthly_rent)}/month a good price for "${property.property_name}" compared with similar spaces on NextSpace?`,
                                  ]
                            ).map((q) => (
                                <button type="button" key={q} onClick={() => onAskRony({ text: q })}>
                                    {q}
                                </button>
                            ))}
                        </section>
                    )}

                    <section className="ns-panel">
                        <div className="ns-panel-head">
                            <h3>History</h3>
                        </div>
                        {history.length === 0 ? (
                            <p className="ns-pay-muted mb-0">
                                {contract.requested_at ? `Requested ${stamp(contract.requested_at)}.` : 'No history yet.'}
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
                    onDone={() => done(`Offer sent to ${personName(tenant)}. They have 7 days to sign.`)}
                />
            )}
            {modal === 'sign' && (
                <SignContractModal
                    contract={contract}
                    tenantName={myName}
                    onClose={() => setModal(null)}
                    onSigned={(code) => done(`Lease signed. Verification code ${code}. Your rent schedule is ready in Payments.`)}
                />
            )}
            {modal === 'renew-offer' && (
                <RenewalOfferModal
                    contract={contract}
                    ownerName={ownerName}
                    record={record}
                    onAskRony={onAskRony}
                    onClose={() => setModal(null)}
                    onDone={() => done(`Renewal offer sent to ${personName(tenant)}. They have 7 days to sign.`)}
                />
            )}
            {modal === 'renew-request' && (
                <RenewalRequestModal
                    contract={contract}
                    onAskRony={onAskRony}
                    onClose={() => setModal(null)}
                    onSent={() => done('Renewal request sent. The owner will answer with an offer to sign.')}
                />
            )}
            {modal === 'renew-sign' && (
                <RenewalSignModal
                    contract={contract}
                    tenantName={myName}
                    onClose={() => setModal(null)}
                    onSigned={(code) => done(`Renewal signed. New verification code ${code}. The new months are in Payments.`)}
                />
            )}
            {modal === 'renew-decline' && (
                <ReasonModal
                    title={
                        renewal === 'offered'
                            ? isOwner
                                ? 'Withdraw the renewal offer'
                                : 'Turn down the renewal'
                            : isOwner
                              ? 'Decline the renewal request'
                              : 'Cancel your renewal request'
                    }
                    subtitle={`The lease still ends on ${formatDueDate(contract.end_date)}. The other side is notified.`}
                    placeholder="E.g. I plan to use the space for something else"
                    confirmLabel="Confirm"
                    danger
                    onClose={() => setModal(null)}
                    onConfirm={async ({ reason }) => {
                        await contractActions.declineRenewal({ contractId: contract.contract_id, reason })
                        done('Done. The other side was notified.')
                    }}
                />
            )}
            {modal === 'decline' && (
                <ReasonModal
                    title={contract.status === 'Offered' ? 'Cancel your offer' : 'Decline this request'}
                    subtitle={`${personName(tenant)} will be notified with your reason.`}
                    placeholder="E.g. the space is no longer available for this kind of business"
                    confirmLabel={contract.status === 'Offered' ? 'Cancel offer' : 'Decline request'}
                    danger
                    onClose={() => setModal(null)}
                    onConfirm={async ({ reason }) => {
                        await contractActions.decline({ contractId: contract.contract_id, reason })
                        done('Done. The business was notified.')
                    }}
                />
            )}
            {modal === 'withdraw' && (
                <ReasonModal
                    title={contract.status === 'Offered' ? 'Turn down this offer' : 'Withdraw your request'}
                    subtitle="The owner will be notified."
                    placeholder="E.g. I found another space"
                    confirmLabel={contract.status === 'Offered' ? 'Turn down offer' : 'Withdraw request'}
                    danger
                    onClose={() => setModal(null)}
                    onConfirm={async ({ reason }) => {
                        await contractActions.withdraw({ contractId: contract.contract_id, reason })
                        done('Done. The owner was notified.')
                    }}
                />
            )}
            {modal === 'terminate' && (
                <ReasonModal
                    title="Ask to end the lease early"
                    subtitle="The other side has to accept it. Rent after the new end date is then removed; anything already late stays owed."
                    reasonRequired
                    placeholder="Explain why"
                    withDate
                    minDate={[today, addDays(contract.start_date, 1)].sort().pop()}
                    maxDate={addDays(contract.end_date, -1)}
                    confirmLabel="Send request"
                    onClose={() => setModal(null)}
                    onConfirm={async ({ reason, date }) => {
                        await contractActions.requestTermination({ contractId: contract.contract_id, date, reason })
                        done('Request sent. You will be notified of the answer.')
                    }}
                />
            )}
        </>
    )
}
