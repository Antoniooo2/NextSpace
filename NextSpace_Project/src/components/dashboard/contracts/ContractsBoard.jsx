import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { describeSupabaseError } from '../../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../../lib/propertyPhotos'
import { formatDueDate, refreshPaymentStatuses, todayInElSalvador } from '../../../lib/rentSchedule'
import {
    contractStage,
    daysLeft,
    loadApplicantRecords,
    money,
    offerExpiresIn,
    personName,
    recordReason,
    recordScore,
    recordSummary,
    renewalExpiresIn,
    renewalOpen,
    renewalState,
    statusMeta,
} from '../../../lib/contracts'
import ContractDetail from './ContractDetail'
import OfferContractModal from './OfferContractModal'
import RonyInsightCard from '../payments/RonyInsightCard'
import '../payments/payments.css'
import './contracts.css'

const CONTRACT_EMBED = `*, add_business!contract_property_id_fkey(property_name, property_type, monthly_rent, municipality, department, address, owner_id, ${PROPERTY_PHOTO_EMBED}, users!add_business_owner_id_fkey(first_name,last_name)), users!contract_tenant_dui_fkey(first_name,last_name)`

// Sections of the board, in the order each side needs to act on them.
const SECTIONS = {
    owner: [
        { id: 'requests', title: 'Requests to answer', icon: 'bi-inbox', empty: 'No new requests.' },
        { id: 'offers', title: 'Waiting for the tenant to sign', icon: 'bi-pen', empty: 'No offers waiting.' },
        { id: 'ending', title: 'Ending soon · renewals', icon: 'bi-arrow-repeat', empty: '' },
        { id: 'active', title: 'Active leases', icon: 'bi-check-circle', empty: 'No active leases yet.' },
    ],
    tenant: [
        { id: 'offers', title: 'Offers to sign', icon: 'bi-pen', empty: 'No offers waiting for you.' },
        { id: 'requests', title: 'My requests', icon: 'bi-inbox', empty: 'No open requests.' },
        { id: 'ending', title: 'Ending soon · renewals', icon: 'bi-arrow-repeat', empty: '' },
        { id: 'active', title: 'Active leases', icon: 'bi-check-circle', empty: 'No active leases yet.' },
    ],
}

// Board column for a contract: active leases in their last 90 days (or with a
// renewal in progress) get their own "ending soon" group.
function boardStage(contract, today) {
    const stage = contractStage(contract)
    if (stage === 'active' && (renewalOpen(contract, today) || renewalState(contract))) return 'ending'
    return stage
}

function needsAction(contract, viewer) {
    const other = contract.termination_requested_at && contract.termination_requested_by !== viewer
    const renewal = contract.status === 'Active' ? renewalState(contract) : null
    if (viewer === 'owner') return contract.status === 'Pending' || renewal === 'requested' || Boolean(other)
    return (contract.status === 'Offered' && !offerExpiresIn(contract)?.expired) || renewal === 'offered' || Boolean(other)
}

// Rony's summary of the board: computed here, no AI call. Each line can open
// the contract it is about or hand the question to Rony.
function boardInsights({ contracts, records, viewer, today }) {
    const items = []
    const isOwner = viewer === 'owner'

    if (isOwner) {
        const byProperty = {}
        for (const c of contracts.filter((k) => k.status === 'Pending')) {
            const key = c.property_id
            byProperty[key] = byProperty[key] || { name: c.add_business?.property_name, list: [] }
            byProperty[key].list.push(c)
        }
        for (const { name, list } of Object.values(byProperty)) {
            const ranked = [...list].sort(
                (a, b) => recordScore(records[b.tenant_dui]) - recordScore(records[a.tenant_dui])
            )
            const best = ranked[0]
            const bestSummary = recordSummary(records[best.tenant_dui])
            const allNew = ranked.every((c) => recordSummary(records[c.tenant_dui]).pct == null)
            items.push({
                tone: 'info',
                icon: 'bi-inbox',
                text:
                    list.length === 1
                        ? `${personName(best.users)} is waiting for your answer on ${name} (${bestSummary.short.toLowerCase()}).`
                        : allNew
                          ? `${list.length} businesses want ${name}. None of them has a payment record on NextSpace yet, so compare their requests and ask Rony.`
                          : `${list.length} businesses want ${name}. I'd go with ${personName(best.users)}: ${recordReason(records[best.tenant_dui])}.`,
                contractId: best.contract_id,
                label: list.length === 1 ? 'Review request' : `Review ${personName(best.users).split(' ')[0]}’s request`,
            })
        }
    }

    for (const c of contracts) {
        const name = c.add_business?.property_name
        const renewal = c.status === 'Active' ? renewalState(c) : null
        if (c.status === 'Offered') {
            const exp = offerExpiresIn(c)
            if (!isOwner && !exp?.expired) {
                items.push({ tone: 'warning', icon: 'bi-pen', text: `The owner of ${name} sent you a lease offer. ${exp?.text}.`, contractId: c.contract_id, label: 'Review and sign' })
            } else if (isOwner && exp && !exp.expired && exp.text.includes('hours')) {
                items.push({ tone: 'warning', icon: 'bi-hourglass-split', text: `Your offer to ${personName(c.users)} for ${name} ${exp.text.toLowerCase()}.`, contractId: c.contract_id, label: 'Open' })
            }
        }
        if (c.status === 'Active' && c.termination_requested_at && c.termination_requested_by !== viewer) {
            items.push({
                tone: 'danger',
                icon: 'bi-box-arrow-right',
                text: `The ${c.termination_requested_by} of ${name} asked to end the lease on ${formatDueDate(c.termination_date)}.`,
                contractId: c.contract_id,
                label: 'Answer',
            })
        }
        if (renewal === 'requested' && isOwner) {
            items.push({ tone: 'success', icon: 'bi-arrow-repeat', text: `${personName(c.users)} wants to renew ${name} for ${c.renewal_request_months} more months.`, contractId: c.contract_id, label: 'Answer' })
        }
        if (renewal === 'offered' && !isOwner) {
            items.push({ tone: 'warning', icon: 'bi-arrow-repeat', text: `Renewal offer for ${name}: ${money(c.renewal_rent)}/month. ${renewalExpiresIn(c)}.`, contractId: c.contract_id, label: 'Review renewal' })
        }
        if (!renewal && renewalOpen(c, today)) {
            const left = daysLeft(c, today)
            const summary = recordSummary(records[c.tenant_dui])
            items.push({
                tone: 'warning',
                icon: 'bi-hourglass-split',
                text: isOwner
                    ? `${name} ends in ${left} days.${summary.pct != null && summary.pct >= 90 ? ` ${personName(c.users)} is ${summary.short}, a good candidate to renew.` : ''}`
                    : `Your lease for ${name} ends in ${left} days.`,
                contractId: c.contract_id,
                label: isOwner ? 'Offer renewal' : 'Ask to renew',
            })
        }
    }

    if (items.length === 0) {
        items.push({ tone: 'success', icon: 'bi-check-circle-fill', text: 'Nothing needs your attention in Contracts right now.' })
    }
    return items.slice(0, 5).map(({ contractId, label, ...item }) =>
        contractId ? { ...item, action: { contractId, label } } : item
    )
}

// The question for Rony carries each applicant's record, so the answer can
// compare them (Rony can't see other businesses' payments on its own).
function ownerRonyQuestion(requests, records) {
    if (requests.length === 0) return 'Look at my contracts: which leases should I renew, and what should I do next?'
    const lines = requests.map((c) => {
        const r = records[c.tenant_dui]
        return `- ${personName(c.users)} for "${c.add_business?.property_name}": ${
            r && r.months_due > 0
                ? `${r.months_on_time}/${r.months_due} months paid on time, ${r.months_late_now} late now, ${r.leases} leases signed`
                : 'no payment history on NextSpace'
        }`
    })
    return `These businesses requested my spaces. Who should I accept for each space, and why?\n${lines.join('\n')}`
}

// The lease lifecycle as a strip of steps with how many contracts sit in
// each, so the flow reads at a glance. Tapping a step scrolls to its list.
const FLOW_STEPS = {
    owner: [
        { id: 'requests', label: 'Requests', icon: 'bi-inbox', hint: 'Answer with an offer' },
        { id: 'offers', label: 'Awaiting signature', icon: 'bi-pen', hint: 'The business signs' },
        { id: 'active', label: 'Active', icon: 'bi-check-circle', hint: 'Rent in Payments' },
        { id: 'ending', label: 'Ending soon', icon: 'bi-arrow-repeat', hint: 'Renew or let it end' },
        { id: 'closed', label: 'Closed', icon: 'bi-archive', hint: 'History' },
    ],
    tenant: [
        { id: 'requests', label: 'My requests', icon: 'bi-inbox', hint: 'The owner answers' },
        { id: 'offers', label: 'Offers to sign', icon: 'bi-pen', hint: 'Review and sign' },
        { id: 'active', label: 'Active', icon: 'bi-check-circle', hint: 'Pay in Payments' },
        { id: 'ending', label: 'Ending soon', icon: 'bi-arrow-repeat', hint: 'Ask to renew' },
        { id: 'closed', label: 'Closed', icon: 'bi-archive', hint: 'History' },
    ],
}

function ContractFlow({ viewer, grouped, monthly, onJump }) {
    return (
        <ol className="ns-contract-flow" aria-label="Lease steps">
            {FLOW_STEPS[viewer].map((step) => {
                const count = grouped[step.id].length
                const hot = count > 0 && (step.id === (viewer === 'owner' ? 'requests' : 'offers') || step.id === 'ending')
                return (
                    <li key={step.id}>
                        <button
                            type="button"
                            className={`${count === 0 ? 'is-empty' : ''} ${hot ? 'is-hot' : ''}`}
                            onClick={() => count > 0 && onJump(step.id)}
                            disabled={count === 0}
                        >
                            <span className="ns-contract-flow-icon">
                                <i className={`bi ${step.icon}`}></i>
                            </span>
                            <span className="ns-contract-flow-text">
                                <strong>
                                    {step.label} <em>{count}</em>
                                </strong>
                                <small>{step.id === 'active' && monthly > 0 ? `${money(monthly)}/month` : step.hint}</small>
                            </span>
                        </button>
                    </li>
                )
            })}
        </ol>
    )
}

function ContractCard({ contract, viewer, record, onOpen }) {
    const property = contract.add_business || {}
    const meta = statusMeta(contract)
    const expiry = offerExpiresIn(contract)
    const left = daysLeft(contract, todayInElSalvador())
    const other = viewer === 'owner' ? contract.users : property.users
    const needsMe = needsAction(contract, viewer)
    const renewal = contract.status === 'Active' ? renewalState(contract) : null
    const summary = viewer === 'owner' && (contract.status === 'Pending' || contract.status === 'Offered') ? recordSummary(record) : null

    let line = null
    if (contract.status === 'Pending') line = `Requested ${formatDueDate((contract.requested_at || '').slice(0, 10))}`
    else if (contract.status === 'Offered') line = expiry?.text
    else if (contract.status === 'Active') {
        line = contract.termination_requested_at
            ? `Early end requested for ${formatDueDate(contract.termination_date)}`
            : renewal === 'offered'
              ? `Renewal offered · ${renewalExpiresIn(contract)}`
              : renewal === 'requested'
                ? `Renewal requested · ${contract.renewal_request_months} months`
                : left != null && left <= 90
              ? `Ends in ${left} days`
              : `Until ${formatDueDate(contract.end_date)}`
    } else line = contract.closed_at ? `Closed ${formatDueDate(contract.closed_at.slice(0, 10))}` : null

    return (
        <button type="button" className={`ns-contract-card ${needsMe ? 'needs-me' : ''}`} onClick={() => onOpen(contract.contract_id)}>
            <div className="ns-contract-card-photo">
                {property.photo_url ? <img src={property.photo_url} alt="" /> : <i className="bi bi-shop"></i>}
            </div>
            <div className="ns-contract-card-body">
                <div className="ns-contract-card-top">
                    <strong>{property.property_name || 'Property'}</strong>
                    <span className={`ns-contract-status tone-${meta.tone}`}>
                        <i className={`bi ${meta.icon}`}></i> {meta.label}
                    </span>
                </div>
                <span className="ns-contract-card-who">
                    {viewer === 'owner' ? 'Tenant' : 'Owner'}: {personName(other)}
                </span>
                <div className="ns-contract-card-meta">
                    <span>{money(contract.monthly_rent)}/mo</span>
                    {line && <span>{line}</span>}
                    {summary && <span className={`ns-record-chip tone-${summary.tone}`}>{summary.short}</span>}
                </div>
            </div>
            {needsMe && <span className="ns-contract-card-flag">Your turn</span>}
            <i className="bi bi-chevron-right ns-contract-card-chevron"></i>
        </button>
    )
}

// Both Contracts screens: a board grouped by what needs doing, and the
// contract itself when one is opened.
export default function ContractsBoard({ user, viewer, initialContractId, onAskRony, onOpenPayments }) {
    const [me, setMe] = useState(null)
    const [contracts, setContracts] = useState([])
    const [events, setEvents] = useState([])
    const [properties, setProperties] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [selectedId, setSelectedId] = useState(initialContractId ? Number(initialContractId) : null)
    const [showClosed, setShowClosed] = useState(false)
    const [inviteOpen, setInviteOpen] = useState(false)
    const [notice, setNotice] = useState('')
    const [records, setRecords] = useState({})
    const isOwner = viewer === 'owner'

    const loadData = useCallback(
        async (dui) => {
            const [{ data: rows, error }, { data: propertyRows }] = await Promise.all([
                supabase.from('contract').select(CONTRACT_EMBED).order('contract_id', { ascending: false }),
                isOwner
                    ? supabase
                          .from('add_business')
                          .select('property_id, property_name, property_type, monthly_rent, availability')
                          .eq('owner_id', dui)
                    : Promise.resolve({ data: [] }),
            ])
            if (error) {
                setLoadError(describeSupabaseError(error))
                return
            }
            const mine = (rows || [])
                .filter((c) => (isOwner ? c.add_business?.owner_id === dui : c.tenant_dui === dui))
                .map((c) => ({ ...c, add_business: c.add_business ? withCoverPhoto(c.add_business) : null }))
            setContracts(mine)
            setProperties(propertyRows || [])
            if (isOwner) setRecords(await loadApplicantRecords(mine.map((c) => c.tenant_dui)))

            const ids = mine.map((c) => c.contract_id)
            if (ids.length > 0) {
                const { data: eventRows } = await supabase.from('lease_events').select('*').in('contract_id', ids)
                setEvents(eventRows || [])
            } else {
                setEvents([])
            }
        },
        [isOwner]
    )

    useEffect(() => {
        let cancelled = false
        const init = async () => {
            setLoading(true)
            setLoadError('')
            const { data: userRow, error } = await supabase
                .from('users')
                .select('dui, first_name, last_name')
                .eq('id_supabase_auth', user.id)
                .single()
            if (cancelled) return
            if (error || !userRow) {
                setLoadError("We couldn't find your account record. Please contact support.")
                setLoading(false)
                return
            }
            setMe(userRow)
            await refreshPaymentStatuses()
            await loadData(userRow.dui)
            if (!cancelled) setLoading(false)
        }
        init()
        return () => {
            cancelled = true
        }
    }, [user.id, loadData])

    useEffect(() => {
        if (initialContractId) setSelectedId(Number(initialContractId))
    }, [initialContractId])

    const reload = () => me && loadData(me.dui)

    const today = todayInElSalvador()

    const grouped = useMemo(() => {
        const groups = { requests: [], offers: [], ending: [], active: [], closed: [] }
        for (const c of contracts) groups[boardStage(c, today)].push(c)
        const byEnd = (a, b) => String(a.end_date).localeCompare(String(b.end_date))
        groups.ending.sort(byEnd)
        groups.active.sort(byEnd)
        groups.requests.sort(
            (a, b) => recordScore(records[b.tenant_dui]) - recordScore(records[a.tenant_dui])
        )
        return groups
    }, [contracts, records, today])

    // Rent under active leases, shown on the "Active" step of the flow.
    const kpis = useMemo(() => {
        const active = [...grouped.active, ...grouped.ending]
        return { monthly: active.reduce((sum, c) => sum + Number(c.monthly_rent || 0), 0) }
    }, [grouped])

    const insights = useMemo(() => boardInsights({ contracts, records, viewer, today }), [contracts, records, viewer, today])

    const myName = personName(me)
    const selected = contracts.find((c) => c.contract_id === selectedId)
    const invitable = properties.filter((p) => p.availability !== 'Occupied')

    if (loading) {
        return (
            <div className="text-center py-5">
                <div className="spinner-border" role="status" aria-label="Loading contracts"></div>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="alert alert-danger" role="alert">
                {loadError}
            </div>
        )
    }

    if (selected) {
        return (
            <ContractDetail
                contract={selected}
                events={events.filter((e) => e.contract_id === selected.contract_id)}
                viewer={viewer}
                myName={myName}
                ownerName={myName}
                record={records[selected.tenant_dui]}
                onBack={() => setSelectedId(null)}
                onChanged={reload}
                onAskRony={onAskRony}
                onOpenPayments={onOpenPayments}
            />
        )
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Contracts</h1>
                    <p>
                        {isOwner
                            ? 'Answer requests with an offer, follow signatures and manage your leases.'
                            : 'Review and sign offers, follow your requests and manage your leases.'}
                    </p>
                </div>
                {isOwner && (
                    <button
                        type="button"
                        className="ns-filled-btn"
                        onClick={() => setInviteOpen(true)}
                        disabled={invitable.length === 0}
                        title={invitable.length === 0 ? 'All your spaces are occupied' : undefined}
                    >
                        <i className="bi bi-envelope-paper"></i> Invite a business
                    </button>
                )}
            </div>

            {notice && (
                <div className="alert alert-success d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>{notice}</span>
                    <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setNotice('')} />
                </div>
            )}

            {contracts.length > 0 && (
                <ContractFlow
                    viewer={viewer}
                    grouped={grouped}
                    monthly={kpis.monthly}
                    onJump={(id) => {
                        if (id === 'closed') setShowClosed(true)
                        document.getElementById(`ct-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                />
            )}

            {contracts.length > 0 && (
                <RonyInsightCard
                    title="Rony’s take on your contracts"
                    insights={insights}
                    onAction={(action) => setSelectedId(action.contractId)}
                    onAskRony={
                        onAskRony
                            ? () =>
                                  onAskRony({
                                      text: isOwner
                                          ? ownerRonyQuestion(grouped.requests, records)
                                          : 'Look at my leases and offers: what should I do next?',
                                  })
                            : undefined
                    }
                />
            )}

            {contracts.length === 0 ? (
                <div className="ns-panel ns-contract-empty">
                    <i className="bi bi-file-earmark-text"></i>
                    <h3>No contracts yet</h3>
                    <p>
                        {isOwner
                            ? 'When a business requests one of your spaces it shows up here. You can also invite a business directly.'
                            : 'Find a space in the marketplace and request a lease. The owner answers here with an offer to sign.'}
                    </p>
                </div>
            ) : (
                <>
                    {SECTIONS[viewer].map((section) => {
                        const list = grouped[section.id]
                        if (list.length === 0 && (section.id !== 'active' || grouped.ending.length > 0)) return null
                        return (
                            <section key={section.id} id={`ct-${section.id}`} className="ns-contract-section">
                                <h2>
                                    <i className={`bi ${section.icon}`}></i> {section.title}
                                    <span className="ns-contract-count">{list.length}</span>
                                </h2>
                                {list.length === 0 ? (
                                    <p className="ns-pay-muted">{section.empty}</p>
                                ) : (
                                    <div className="ns-contract-list">
                                        {list.map((c) => (
                                            <ContractCard
                                                key={c.contract_id}
                                                contract={c}
                                                viewer={viewer}
                                                record={records[c.tenant_dui]}
                                                onOpen={setSelectedId}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        )
                    })}

                    {grouped.closed.length > 0 && (
                        <section id="ct-closed" className="ns-contract-section">
                            <button type="button" className="ns-contract-closed-toggle" onClick={() => setShowClosed((v) => !v)}>
                                <i className={`bi ${showClosed ? 'bi-chevron-down' : 'bi-chevron-right'}`}></i> Closed
                                <span className="ns-contract-count">{grouped.closed.length}</span>
                            </button>
                            {showClosed && (
                                <div className="ns-contract-list">
                                    {grouped.closed.map((c) => (
                                        <ContractCard
                                                key={c.contract_id}
                                                contract={c}
                                                viewer={viewer}
                                                record={records[c.tenant_dui]}
                                                onOpen={setSelectedId}
                                            />
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </>
            )}

            {inviteOpen && (
                <OfferContractModal
                    mode="invite"
                    properties={invitable}
                    ownerName={myName}
                    onAskRony={onAskRony}
                    onClose={() => setInviteOpen(false)}
                    onDone={() => {
                        setInviteOpen(false)
                        setNotice('Invitation sent. The business has 7 days to review and sign it.')
                        reload()
                    }}
                />
            )}
        </>
    )
}
