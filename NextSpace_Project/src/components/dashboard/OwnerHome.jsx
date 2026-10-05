import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useOwnerProperties } from '../../hooks/useOwnerProperties'
import NewPropertyModal from './NewPropertyModal'
import { LISTING_STATUS } from '../../lib/propertyTypes'
import { formatDueDate } from '../../lib/rentSchedule'
import { areaOf, daysSince, listingScore, locationOf, typeColors, typeIcon } from '../../lib/listings'
import { money, offerExpiresIn, personName } from '../../lib/contracts'
import './listings.css'

const TABS = [
    { id: 'all', label: 'All' },
    { id: 'leased', label: 'Leased' },
    { id: 'available', label: 'Not leased' },
    { id: 'attention', label: 'Needs attention' },
]

// What is going on with one space right now, from its contracts.
function statusOf(property, contracts) {
    const mine = contracts.filter((c) => c.property_id === property.property_id)
    const active = mine.find((c) => c.status === 'Active')
    const offered = mine.find((c) => c.status === 'Offered')
    const pending = mine.filter((c) => c.status === 'Pending')
    const lastClosed = mine
        .filter((c) => c.closed_at)
        .map((c) => c.closed_at)
        .sort()
        .pop()
    return {
        active,
        offered,
        pending,
        hasHistory: mine.length > 0,
        vacantDays: active ? null : daysSince(lastClosed || property.registration_date),
    }
}

// Requests waiting, or a listing that is missing too much to attract any.
function needsAttention(row) {
    return row.status.pending.length > 0 || (!row.status.active && listingScore(row.property) < 80)
}

function StatusLine({ property, status, onOpenContracts }) {
    const { active, offered, pending } = status
    if (active) {
        const flag = active.termination_requested_at
            ? 'Early end requested'
            : active.renewal_requested_at
              ? 'Renewal requested'
              : active.renewal_offered_at
                ? 'Renewal offered'
                : null
        return (
            <button type="button" className="ns-own-status tone-info" onClick={() => onOpenContracts(active.contract_id)}>
                <i className="bi bi-key"></i>
                <span>
                    Leased to <strong>{personName(active.users)}</strong> until {formatDueDate(active.end_date)}
                    {flag && <em> · {flag}</em>}
                </span>
                <i className="bi bi-chevron-right"></i>
            </button>
        )
    }
    if (offered) {
        return (
            <button type="button" className="ns-own-status tone-warning" onClick={() => onOpenContracts(offered.contract_id)}>
                <i className="bi bi-pen"></i>
                <span>
                    Offer awaiting <strong>{personName(offered.users)}</strong>’s signature · {offerExpiresIn(offered)?.text}
                </span>
                <i className="bi bi-chevron-right"></i>
            </button>
        )
    }
    if (pending.length > 0) {
        return (
            <button type="button" className="ns-own-status tone-hot" onClick={() => onOpenContracts(pending.length === 1 ? pending[0].contract_id : null)}>
                <i className="bi bi-inbox"></i>
                <span>
                    <strong>
                        {pending.length} {pending.length === 1 ? 'request' : 'requests'}
                    </strong>{' '}
                    waiting for your answer
                </span>
                <i className="bi bi-chevron-right"></i>
            </button>
        )
    }
    if (property.availability === 'Reserved') {
        return (
            <p className="ns-own-status tone-neutral">
                <i className="bi bi-pause-circle"></i>
                <span>Paused · hidden from the Marketplace</span>
            </p>
        )
    }
        return (
        <p className={`ns-own-status ${status.vacantDays >= 30 ? 'tone-warning' : 'tone-neutral'}`}>
            <i className="bi bi-hourglass"></i>
            <span>Listed · vacant {status.vacantDays === 0 ? 'since today' : `for ${status.vacantDays} ${status.vacantDays === 1 ? 'day' : 'days'}`}</span>
        </p>
    )
}

// The basics at a glance; everything else lives in the space's own page.
function OwnerListingCard({ property, status, views, onOpen, onEdit, onOpenContracts }) {
    const meta = LISTING_STATUS[property.availability] || LISTING_STATUS.Available
    const area = areaOf(property)
    const score = listingScore(property)
    const [bg, fg] = typeColors(property.property_type)

    return (
        <article className="ns-own-card">
            <button type="button" className="ns-own-media" onClick={() => onOpen(property)} aria-label={`Open ${property.property_name}`}>
                {property.photo_url ? (
                    <img src={property.photo_url} alt="" loading="lazy" />
                ) : (
                    <span className="ns-mk-card-placeholder" style={{ background: bg, color: fg }}>
                        <i className={`bi ${typeIcon(property.property_type)}`}></i>
                    </span>
                )}
                <span className={`ns-own-badge tone-${meta.tone}`}>
                    <i className={`bi ${meta.icon}`}></i> {meta.label}
                </span>
            </button>

            <div className="ns-own-body">
                <div className="ns-own-title">
                    <button type="button" onClick={() => onOpen(property)}>
                        {property.property_name}
                    </button>
                    <span className="ns-own-rent">{property.monthly_rent != null ? `${money(property.monthly_rent)}/mo` : 'No rent set'}</span>
                </div>
                <p className="ns-own-meta">
                    <i className="bi bi-geo-alt"></i> {locationOf(property) || 'No location'}
                    {area && (
                        <>
                            <span className="ns-pay-dot">•</span>
                            {area} m²
                        </>
                    )}
                </p>

                <StatusLine property={property} status={status} onOpenContracts={onOpenContracts} />

                <div className="ns-own-foot">
                    <span className="ns-own-foot-stats">
                        <span title="Views in the last 30 days">
                            <i className="bi bi-eye"></i> {views ?? 0}
                        </span>
                        {score < 100 && !status.active && (
                            <span className={`ns-own-chip ${score < 60 ? 'is-bad' : ''}`} title="Listing quality">
                                Listing {score}%
                            </span>
                        )}
                    </span>
                    <span className="ns-own-foot-actions">
                        <button type="button" onClick={() => onEdit(property)}>
                            <i className="bi bi-pencil"></i> Edit
                        </button>
                        <button type="button" className="is-primary" onClick={() => onOpen(property)}>
                            Manage <i className="bi bi-arrow-right"></i>
                        </button>
                    </span>
                </div>
            </div>
        </article>
    )
}

export default function OwnerHome({ user, firstName, search, onViewProperty, onNavigate }) {
    const { ownerDui, properties, loading, error: loadError, reload } = useOwnerProperties(user)
    const [contracts, setContracts] = useState([])
    const [views, setViews] = useState(() => new Map())
    const [tab, setTab] = useState('all')
    const [showFormModal, setShowFormModal] = useState(false)
    const [editingProperty, setEditingProperty] = useState(null)

    const loadContracts = useCallback(async () => {
        const { data } = await supabase
            .from('contract')
            .select(
                'contract_id, property_id, status, end_date, closed_at, offer_expires_at, termination_requested_at, renewal_requested_at, renewal_offered_at, monthly_rent, users!contract_tenant_dui_fkey(first_name,last_name)'
            )
        setContracts(data || [])
    }, [])

    useEffect(() => {
        loadContracts()
        supabase.rpc('owner_listing_stats').then(({ data }) => {
            setViews(new Map((data || []).map((r) => [r.property_id, r.views_30d])))
        })
    }, [loadContracts])

    const rows = useMemo(() => properties.map((p) => ({ property: p, status: statusOf(p, contracts) })), [properties, contracts])

    const counts = {
        all: rows.length,
        leased: rows.filter((r) => r.status.active).length,
        available: rows.filter((r) => !r.status.active).length,
        attention: rows.filter(needsAttention).length,
    }

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase()
        return rows
            .filter((r) =>
                tab === 'leased' ? r.status.active : tab === 'available' ? !r.status.active : tab === 'attention' ? needsAttention(r) : true
            )
            .filter(
                ({ property: p }) =>
                    !query ||
                    [p.property_name, p.property_type, p.municipality, p.department].filter(Boolean).some((v) => v.toLowerCase().includes(query))
            )
    }, [rows, tab, search])

    const openCreateModal = () => {
        setEditingProperty(null)
        setShowFormModal(true)
    }

    const handleSaved = async () => {
        setShowFormModal(false)
        setEditingProperty(null)
        await reload()
    }

    const openContracts = (contractId) => onNavigate?.('contracts', { contractId: contractId || null })

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading your properties...</p>
            </div>
        )
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>My Properties</h1>
                    <p>Your spaces and what each one needs, {firstName}. Open one to manage it.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button type="button" className="ns-filled-btn" onClick={openCreateModal}>
                        <i className="bi bi-plus-lg"></i> Publish new space
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            {properties.length > 0 && (
                <div className="ns-own-tabs" role="tablist" aria-label="Filter properties">
                    {TABS.map((t) => (
                        <button
                            type="button"
                            key={t.id}
                            role="tab"
                            aria-selected={tab === t.id}
                            className={`${tab === t.id ? 'active' : ''} ${t.id === 'attention' && counts.attention > 0 ? 'is-hot' : ''}`}
                            onClick={() => setTab(t.id)}
                        >
                            {t.label} <em>{counts[t.id]}</em>
                        </button>
                    ))}
                </div>
            )}

            {filtered.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-buildings"></i>
                    <h3>
                        {properties.length === 0
                            ? "You haven't published any spaces yet"
                            : tab === 'attention'
                              ? 'Nothing needs your attention'
                              : 'No properties here'}
                    </h3>
                    <p>
                        {properties.length === 0
                            ? 'List your first commercial space and start reaching entrepreneurs across El Salvador.'
                            : tab === 'attention'
                              ? 'Every listing is complete and no requests are waiting.'
                              : 'Try another tab or a different keyword.'}
                    </p>
                    {properties.length === 0 && (
                        <button type="button" className="ns-filled-btn" onClick={openCreateModal}>
                            <i className="bi bi-plus-lg"></i> Publish new space
                        </button>
                    )}
                </div>
            ) : (
                <div className="ns-own-grid">
                    {filtered.map(({ property, status }) => (
                        <OwnerListingCard
                            key={property.property_id}
                            property={property}
                            status={status}
                            views={views.get(property.property_id)}
                            onOpen={onViewProperty}
                            onEdit={(p) => {
                                setEditingProperty(p)
                                setShowFormModal(true)
                            }}
                            onOpenContracts={openContracts}
                        />
                    ))}
                </div>
            )}

            {showFormModal && (
                <NewPropertyModal
                    property={editingProperty}
                    ownerDui={ownerDui}
                    onClose={() => {
                        setShowFormModal(false)
                        setEditingProperty(null)
                    }}
                    onSaved={handleSaved}
                />
            )}
        </>
    )
}
