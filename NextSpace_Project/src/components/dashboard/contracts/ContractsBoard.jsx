import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { describeSupabaseError } from '../../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../../lib/propertyPhotos'
import { formatDueDate, refreshPaymentStatuses, todayInElSalvador } from '../../../lib/rentSchedule'
import { contractStage, daysLeft, money, offerExpiresIn, personName, statusMeta } from '../../../lib/contracts'
import ContractDetail from './ContractDetail'
import OfferContractModal from './OfferContractModal'
import '../payments/payments.css'
import './contracts.css'

const CONTRACT_EMBED = `*, add_business!contract_property_id_fkey(property_name, property_type, monthly_rent, municipality, department, address, owner_id, ${PROPERTY_PHOTO_EMBED}, users!add_business_owner_id_fkey(first_name,last_name)), users!contract_tenant_dui_fkey(first_name,last_name)`

// Sections of the board, in the order each side needs to act on them.
const SECTIONS = {
    owner: [
        { id: 'requests', title: 'Requests to answer', icon: 'bi-inbox', empty: 'No new requests.' },
        { id: 'offers', title: 'Waiting for the tenant to sign', icon: 'bi-pen', empty: 'No offers waiting.' },
        { id: 'active', title: 'Active leases', icon: 'bi-check-circle', empty: 'No active leases yet.' },
    ],
    tenant: [
        { id: 'offers', title: 'Offers to sign', icon: 'bi-pen', empty: 'No offers waiting for you.' },
        { id: 'requests', title: 'My requests', icon: 'bi-inbox', empty: 'No open requests.' },
        { id: 'active', title: 'Active leases', icon: 'bi-check-circle', empty: 'No active leases yet.' },
    ],
}

function ContractCard({ contract, viewer, onOpen }) {
    const property = contract.add_business || {}
    const meta = statusMeta(contract)
    const expiry = offerExpiresIn(contract)
    const left = daysLeft(contract, todayInElSalvador())
    const other = viewer === 'owner' ? contract.users : property.users
    const needsMe =
        (viewer === 'owner' && contract.status === 'Pending') ||
        (viewer === 'tenant' && contract.status === 'Offered' && !expiry?.expired) ||
        (contract.status === 'Active' && contract.termination_requested_at && contract.termination_requested_by !== viewer)

    let line = null
    if (contract.status === 'Pending') line = `Requested ${formatDueDate((contract.requested_at || '').slice(0, 10))}`
    else if (contract.status === 'Offered') line = expiry?.text
    else if (contract.status === 'Active') {
        line = contract.termination_requested_at
            ? `Early end requested for ${formatDueDate(contract.termination_date)}`
            : left != null && left <= 60
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

    const grouped = useMemo(() => {
        const groups = { requests: [], offers: [], active: [], closed: [] }
        for (const c of contracts) groups[contractStage(c)].push(c)
        groups.active.sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))
        return groups
    }, [contracts])

    const kpis = useMemo(() => {
        const active = grouped.active
        const monthly = active.reduce((sum, c) => sum + Number(c.monthly_rent || 0), 0)
        const endingSoon = active.filter((c) => {
            const d = daysLeft(c)
            return d != null && d <= 60
        }).length
        const waiting = isOwner
            ? grouped.requests.length + active.filter((c) => c.termination_requested_at && c.termination_requested_by !== 'owner').length
            : grouped.offers.filter((c) => !offerExpiresIn(c)?.expired).length +
              active.filter((c) => c.termination_requested_at && c.termination_requested_by !== 'tenant').length
        return { activeCount: active.length, monthly, endingSoon, waiting }
    }, [grouped, isOwner])

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

            <div className="ns-contract-kpis">
                <div className={kpis.waiting > 0 ? 'is-hot' : ''}>
                    <small>Waiting for you</small>
                    <strong>{kpis.waiting}</strong>
                </div>
                <div>
                    <small>Active leases</small>
                    <strong>{kpis.activeCount}</strong>
                </div>
                <div>
                    <small>{isOwner ? 'Monthly rent under contract' : 'Monthly rent you pay'}</small>
                    <strong>{money(kpis.monthly)}</strong>
                </div>
                <div>
                    <small>Ending in 60 days</small>
                    <strong>{kpis.endingSoon}</strong>
                </div>
            </div>

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
                        if (list.length === 0 && section.id !== 'active') return null
                        return (
                            <section key={section.id} className="ns-contract-section">
                                <h2>
                                    <i className={`bi ${section.icon}`}></i> {section.title}
                                    <span className="ns-contract-count">{list.length}</span>
                                </h2>
                                {list.length === 0 ? (
                                    <p className="ns-pay-muted">{section.empty}</p>
                                ) : (
                                    <div className="ns-contract-list">
                                        {list.map((c) => (
                                            <ContractCard key={c.contract_id} contract={c} viewer={viewer} onOpen={setSelectedId} />
                                        ))}
                                    </div>
                                )}
                            </section>
                        )
                    })}

                    {grouped.closed.length > 0 && (
                        <section className="ns-contract-section">
                            <button type="button" className="ns-contract-closed-toggle" onClick={() => setShowClosed((v) => !v)}>
                                <i className={`bi ${showClosed ? 'bi-chevron-down' : 'bi-chevron-right'}`}></i> Closed
                                <span className="ns-contract-count">{grouped.closed.length}</span>
                            </button>
                            {showClosed && (
                                <div className="ns-contract-list">
                                    {grouped.closed.map((c) => (
                                        <ContractCard key={c.contract_id} contract={c} viewer={viewer} onOpen={setSelectedId} />
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
