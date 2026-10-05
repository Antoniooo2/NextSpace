import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../../i18n'
import { BRAND_VALUES } from '../../../lib/brand'
import { DOT } from '../../../lib/symbols'
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
        { id: 'requests', title: 'contractsBoard.sections.owner.requests', icon: 'bi-inbox', empty: 'contractsBoard.sections.owner.requestsEmpty' },
        { id: 'offers', title: 'contractsBoard.sections.owner.offers', icon: 'bi-pen', empty: 'contractsBoard.sections.owner.offersEmpty' },
        { id: 'ending', title: 'contractsBoard.sections.ending', icon: 'bi-arrow-repeat', empty: '' },
        { id: 'active', title: 'contractsBoard.sections.active', icon: 'bi-check-circle', empty: 'contractsBoard.sections.activeEmpty' },
    ],
    tenant: [
        { id: 'offers', title: 'contractsBoard.sections.tenant.offers', icon: 'bi-pen', empty: 'contractsBoard.sections.tenant.offersEmpty' },
        { id: 'requests', title: 'contractsBoard.sections.tenant.requests', icon: 'bi-inbox', empty: 'contractsBoard.sections.tenant.requestsEmpty' },
        { id: 'ending', title: 'contractsBoard.sections.ending', icon: 'bi-arrow-repeat', empty: '' },
        { id: 'active', title: 'contractsBoard.sections.active', icon: 'bi-check-circle', empty: 'contractsBoard.sections.activeEmpty' },
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
    const t = (key, values) => i18n.t(`contractsBoard.insights.${key}`, { ...BRAND_VALUES, ...values })
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
                        ? t('waitingOne', { person: personName(best.users), name, record: bestSummary.short.toLowerCase() })
                        : allNew
                          ? t('manyNew', { count: list.length, name })
                          : t('manyBest', { count: list.length, name, person: personName(best.users), reason: recordReason(records[best.tenant_dui]) }),
                contractId: best.contract_id,
                label: list.length === 1 ? t('reviewRequest') : t('reviewPersonRequest', { person: personName(best.users).split(' ')[0] }),
            })
        }
    }

    for (const c of contracts) {
        const name = c.add_business?.property_name
        const renewal = c.status === 'Active' ? renewalState(c) : null
        if (c.status === 'Offered') {
            const exp = offerExpiresIn(c)
            if (!isOwner && !exp?.expired) {
                items.push({ tone: 'warning', icon: 'bi-pen', text: t('offerReceived', { name, expiry: exp?.text }), contractId: c.contract_id, label: t('reviewAndSign') })
            } else if (isOwner && exp && !exp.expired && exp.withinDay) {
                items.push({
                    tone: 'warning',
                    icon: 'bi-hourglass-split',
                    text: t('offerExpiring', { person: personName(c.users), name, expiry: exp.text.toLowerCase() }),
                    contractId: c.contract_id,
                    label: t('open'),
                })
            }
        }
        if (c.status === 'Active' && c.termination_requested_at && c.termination_requested_by !== viewer) {
            items.push({
                tone: 'danger',
                icon: 'bi-box-arrow-right',
                text: t('endRequested', {
                    side: i18n.t(`contractsBoard.side.${c.termination_requested_by === 'owner' ? 'owner' : 'tenant'}`),
                    name,
                    date: formatDueDate(c.termination_date),
                }),
                contractId: c.contract_id,
                label: i18n.t('notifications.actions.answer'),
            })
        }
        if (renewal === 'requested' && isOwner) {
            items.push({
                tone: 'success',
                icon: 'bi-arrow-repeat',
                text: t('wantsRenew', { person: personName(c.users), name, count: c.renewal_request_months }),
                contractId: c.contract_id,
                label: i18n.t('notifications.actions.answer'),
            })
        }
        if (renewal === 'offered' && !isOwner) {
            items.push({
                tone: 'warning',
                icon: 'bi-arrow-repeat',
                text: t('renewalOffer', { name, rent: money(c.renewal_rent), expiry: renewalExpiresIn(c) }),
                contractId: c.contract_id,
                label: i18n.t('notifications.actions.reviewRenewal'),
            })
        }
        if (!renewal && renewalOpen(c, today)) {
            const left = daysLeft(c, today)
            const summary = recordSummary(records[c.tenant_dui])
            items.push({
                tone: 'warning',
                icon: 'bi-hourglass-split',
                text: isOwner
                    ? t('endsOwner', { name, count: left }) +
                      (summary.pct != null && summary.pct >= 90 ? t('goodCandidate', { person: personName(c.users), record: summary.short }) : '')
                    : t('endsTenant', { name, count: left }),
                contractId: c.contract_id,
                label: isOwner ? i18n.t('notifications.actions.offerRenewal') : i18n.t('notifications.actions.askToRenew'),
            })
        }
    }

    if (items.length === 0) {
        items.push({ tone: 'success', icon: 'bi-check-circle-fill', text: t('nothing') })
    }
    return items.slice(0, 5).map(({ contractId, label, ...item }) =>
        contractId ? { ...item, action: { contractId, label } } : item
    )
}

// The question for Rony carries each applicant's record, so the answer can
// compare them (Rony can't see other businesses' payments on its own).
function ownerRonyQuestion(requests, records) {
    const t = (key, values) => i18n.t(`contractsBoard.ask.${key}`, { ...BRAND_VALUES, ...values })
    if (requests.length === 0) return t('noRequests')
    const lines = requests.map((c) => {
        const r = records[c.tenant_dui]
        return `- ${t('line', {
            person: personName(c.users),
            name: c.add_business?.property_name,
            record:
                r && r.months_due > 0
                    ? t('record', { onTime: r.months_on_time, due: r.months_due, late: r.months_late_now, leases: r.leases })
                    : t('noHistory'),
        })}`
    })
    return `${t('whoToAccept')}\n${lines.join('\n')}`
}

// The lease lifecycle as a strip of steps with how many contracts sit in
// each, so the flow reads at a glance. Tapping a step scrolls to its list.
const FLOW_STEPS = {
    owner: [
        { id: 'requests', label: 'contractsBoard.flow.owner.requests', icon: 'bi-inbox', hint: 'contractsBoard.flow.owner.requestsHint' },
        { id: 'offers', label: 'contractsBoard.flow.owner.offers', icon: 'bi-pen', hint: 'contractsBoard.flow.owner.offersHint' },
        { id: 'active', label: 'contractsBoard.flow.active', icon: 'bi-check-circle', hint: 'contractsBoard.flow.owner.activeHint' },
        { id: 'ending', label: 'contractsBoard.flow.ending', icon: 'bi-arrow-repeat', hint: 'contractsBoard.flow.owner.endingHint' },
        { id: 'closed', label: 'contractsBoard.flow.closed', icon: 'bi-archive', hint: 'contractsBoard.flow.closedHint' },
    ],
    tenant: [
        { id: 'requests', label: 'contractsBoard.flow.tenant.requests', icon: 'bi-inbox', hint: 'contractsBoard.flow.tenant.requestsHint' },
        { id: 'offers', label: 'contractsBoard.flow.tenant.offers', icon: 'bi-pen', hint: 'contractsBoard.flow.tenant.offersHint' },
        { id: 'active', label: 'contractsBoard.flow.active', icon: 'bi-check-circle', hint: 'contractsBoard.flow.tenant.activeHint' },
        { id: 'ending', label: 'contractsBoard.flow.ending', icon: 'bi-arrow-repeat', hint: 'contractsBoard.flow.tenant.endingHint' },
        { id: 'closed', label: 'contractsBoard.flow.closed', icon: 'bi-archive', hint: 'contractsBoard.flow.closedHint' },
    ],
}

function ContractFlow({ viewer, grouped, monthly, onJump }) {
    const { t } = useTranslation()
    return (
        <ol className="ns-contract-flow" aria-label={t('contractsBoard.flow.label')}>
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
                                    {t(step.label)} <em>{count}</em>
                                </strong>
                                <small>{step.id === 'active' && monthly > 0 ? `${money(monthly)}${t('common.perMonth')}` : t(step.hint)}</small>
                            </span>
                        </button>
                    </li>
                )
            })}
        </ol>
    )
}

function ContractCard({ contract, viewer, record, onOpen }) {
    const { t } = useTranslation()
    const property = contract.add_business || {}
    const meta = statusMeta(contract)
    const expiry = offerExpiresIn(contract)
    const left = daysLeft(contract, todayInElSalvador())
    const other = viewer === 'owner' ? contract.users : property.users
    const needsMe = needsAction(contract, viewer)
    const renewal = contract.status === 'Active' ? renewalState(contract) : null
    const summary = viewer === 'owner' && (contract.status === 'Pending' || contract.status === 'Offered') ? recordSummary(record) : null

    let line = null
    if (contract.status === 'Pending') line = t('contractsBoard.card.requested', { date: formatDueDate((contract.requested_at || '').slice(0, 10)) })
    else if (contract.status === 'Offered') line = expiry?.text
    else if (contract.status === 'Active') {
        line = contract.termination_requested_at
            ? t('contractsBoard.card.earlyEnd', { date: formatDueDate(contract.termination_date) })
            : renewal === 'offered'
              ? `${t('ownerHome.flags.renewalOffered')} ${DOT} ${renewalExpiresIn(contract)}`
              : renewal === 'requested'
                ? `${t('ownerHome.flags.renewalRequested')} ${DOT} ${t('common.month', { count: contract.renewal_request_months })}`
                : left != null && left <= 90
              ? t('contractsBoard.card.endsIn', { count: left })
              : t('propertyDetail.now.until', { date: formatDueDate(contract.end_date) })
    } else line = contract.closed_at ? t('contractsBoard.card.closed', { date: formatDueDate(contract.closed_at.slice(0, 10)) }) : null

    return (
        <button type="button" className={`ns-contract-card ${needsMe ? 'needs-me' : ''}`} onClick={() => onOpen(contract.contract_id)}>
            <div className="ns-contract-card-photo">
                {property.photo_url ? <img src={property.photo_url} alt="" /> : <i className="bi bi-shop"></i>}
            </div>
            <div className="ns-contract-card-body">
                <div className="ns-contract-card-top">
                    <strong>{property.property_name || t('common.property')}</strong>
                    <span className={`ns-contract-status tone-${meta.tone}`}>
                        <i className={`bi ${meta.icon}`}></i> {meta.label}
                    </span>
                </div>
                <span className="ns-contract-card-who">
                    {viewer === 'owner' ? t('common.tenant') : t('common.owner')}: {personName(other)}
                </span>
                <div className="ns-contract-card-meta">
                    <span>{t('ownerHome.rentPerMonth', { rent: money(contract.monthly_rent) })}</span>
                    {line && <span>{line}</span>}
                    {summary && <span className={`ns-record-chip tone-${summary.tone}`}>{summary.short}</span>}
                </div>
            </div>
            {needsMe && <span className="ns-contract-card-flag">{t('contractsBoard.card.yourTurn')}</span>}
            <i className="bi bi-chevron-right ns-contract-card-chevron"></i>
        </button>
    )
}

// Both Contracts screens: a board grouped by what needs doing, and the
// contract itself when one is opened.
export default function ContractsBoard({ user, viewer, initialContractId, onAskRony, onOpenPayments }) {
    const { t } = useTranslation()
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
                setLoadError(i18n.t('errors.noAccountRecord'))
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

    const insights = boardInsights({ contracts, records, viewer, today })

    const myName = personName(me)
    const selected = contracts.find((c) => c.contract_id === selectedId)
    const invitable = properties.filter((p) => p.availability !== 'Occupied')

    if (loading) {
        return (
            <div className="text-center py-5">
                <div className="spinner-border" role="status" aria-label={t('contractsBoard.loading')}></div>
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
                    <h1>{t('dashboard.nav.contracts')}</h1>
                    <p>
                        {isOwner
                            ? t('contractsBoard.subtitleOwner')
                            : t('contractsBoard.subtitleTenant')}
                    </p>
                </div>
                {isOwner && (
                    <button
                        type="button"
                        className="ns-filled-btn"
                        onClick={() => setInviteOpen(true)}
                        disabled={invitable.length === 0}
                        title={invitable.length === 0 ? t('contractsBoard.allOccupied') : undefined}
                    >
                        <i className="bi bi-envelope-paper"></i> {t('contractsBoard.invite')}
                    </button>
                )}
            </div>

            {notice && (
                <div className="alert alert-success d-flex align-items-center justify-content-between gap-2 py-2" role="status">
                    <span>{notice}</span>
                    <button type="button" className="btn-close" aria-label={t('common.dismiss')} onClick={() => setNotice('')} />
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
                    title={t('contractsBoard.ronyTitle', BRAND_VALUES)}
                    insights={insights}
                    onAction={(action) => setSelectedId(action.contractId)}
                    onAskRony={
                        onAskRony
                            ? () =>
                                  onAskRony({
                                      text: isOwner
                                          ? ownerRonyQuestion(grouped.requests, records)
                                          : t('contractsBoard.ask.tenant'),
                                  })
                            : undefined
                    }
                />
            )}

            {contracts.length === 0 ? (
                <div className="ns-panel ns-contract-empty">
                    <i className="bi bi-file-earmark-text"></i>
                    <h3>{t('contractsBoard.empty.title')}</h3>
                    <p>
                        {isOwner
                            ? t('contractsBoard.empty.owner')
                            : t('contractsBoard.empty.tenant')}
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
                                    <i className={`bi ${section.icon}`}></i> {t(section.title)}
                                    <span className="ns-contract-count">{list.length}</span>
                                </h2>
                                {list.length === 0 ? (
                                    <p className="ns-pay-muted">{section.empty ? t(section.empty) : ''}</p>
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
                                <i className={`bi ${showClosed ? 'bi-chevron-down' : 'bi-chevron-right'}`}></i> {t('contractsBoard.flow.closed')}
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
                        setNotice(t('contractsBoard.invitationSent'))
                        reload()
                    }}
                />
            )}
        </>
    )
}
