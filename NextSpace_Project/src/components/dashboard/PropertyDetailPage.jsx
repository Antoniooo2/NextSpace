import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { LISTING_STATUS } from '../../lib/propertyTypes'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import { PROPERTY_SERVICES_FULL_EMBED, PROPERTY_SERVICE_NAMES_EMBED, withServiceNames, withServices } from '../../lib/propertyServices'
import { createNotification } from '../../lib/notifications'
import { SERVICE_ICON, areaOf, daysSince, listingChecklist, listingScore, locationOf, typeIcon } from '../../lib/listings'
import { formatDueDate } from '../../lib/rentSchedule'
import { money, personName } from '../../lib/contracts'
import { formatPpm, loadMarketStats, priceInsight } from '../../lib/market'
import { setSaved as persistSaved } from '../../lib/savedProperties'
import PropertyCard from './PropertyCard'
import NewPropertyModal from './NewPropertyModal'
import ConfirmDialog from './ConfirmDialog'
import PropertyGallery from './property/PropertyGallery'
import PriceMarketBar from './property/PriceMarketBar'
import ViewsChart from './property/ViewsChart'
import './listings.css'
import './property/property.css'

const OWNER_EMBED = 'users!add_business_owner_id_fkey(first_name,last_name)'

function toAdvisorPropertyCard(detail) {
    return {
        property_id: detail.property_id,
        property_name: detail.property_name,
        description: detail.description || null,
        monthly_rent: detail.monthly_rent != null ? Number(detail.monthly_rent) : null,
        property_type: detail.property_type,
        department: detail.department,
        municipality: detail.municipality,
        address: detail.address,
        photo_url: detail.photo_url || null,
        services: detail.service_names || [],
    }
}

function listedAgo(ts) {
    const d = daysSince(ts)
    if (d == null) return null
    if (d === 0) return 'Listed today'
    if (d < 30) return `Listed ${d} ${d === 1 ? 'day' : 'days'} ago`
    const months = Math.round(d / 30)
    return `Listed ${months} ${months === 1 ? 'month' : 'months'} ago`
}

// What businesses read about the space: description, amenities, location.
function ListingContent({ detail }) {
    return (
        <>
            <section className="ns-pd-section">
                <h3>About this space</h3>
                <p className="ns-pd-desc">
                    {detail.description || 'The owner has not added a description yet. Ask Rony whether it fits your business, or request the lease to talk terms.'}
                </p>
            </section>

            <section className="ns-pd-section">
                <h3>Amenities</h3>
                {detail.service_names?.length > 0 ? (
                    <ul className="ns-amenity-list">
                        {detail.service_names.map((name) => (
                            <li key={name}>
                                <i className={`bi ${SERVICE_ICON[name] || 'bi-check2'}`}></i> {name}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="ns-pay-muted mb-0">No amenities listed.</p>
                )}
            </section>

            <section className="ns-pd-section">
                <h3>Location</h3>
                <p className="ns-pd-location">
                    <i className="bi bi-geo-alt-fill"></i>
                    <span>
                        <strong>{locationOf(detail) || 'Location on request'}</strong>
                        {detail.address && <small>{detail.address}</small>}
                    </span>
                </p>
            </section>
        </>
    )
}

export default function PropertyDetailPage({ property, user, accountType, onBack, onAskRony, onViewProperty, onNavigate, backLabel = 'Back' }) {
    const isBusiness = accountType === 'business'
    const isOwnerView = accountType === 'property-owner'

    const [detail, setDetail] = useState(property || null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [marketStats, setMarketStats] = useState(null)

    // Business
    const [tenantDui, setTenantDui] = useState(null)
    const [openRequest, setOpenRequest] = useState(null) // 'Pending' | 'Offered' | 'Active' | null
    const [requesting, setRequesting] = useState(false)
    const [requestError, setRequestError] = useState('')
    const [requestSuccess, setRequestSuccess] = useState(false)
    const [saved, setSaved] = useState(false)
    const [similar, setSimilar] = useState([])

    // Owner
    const [tab, setTab] = useState('overview')
    const [ownerDui, setOwnerDui] = useState(null)
    const [ownerContracts, setOwnerContracts] = useState([])
    const [stats, setStats] = useState(null)
    const [viewDays, setViewDays] = useState([])
    const [modal, setModal] = useState(null) // 'edit' | 'duplicate' | 'delete'
    const [busy, setBusy] = useState(false)
    const [actionError, setActionError] = useState('')

    const load = useCallback(async () => {
        if (!property?.property_id) {
            setLoading(false)
            return
        }
        const embed = isOwnerView ? PROPERTY_SERVICES_FULL_EMBED : PROPERTY_SERVICE_NAMES_EMBED
        const { data, error } = await supabase
            .from('add_business')
            .select(`*, ${PROPERTY_PHOTO_EMBED}, ${embed}, ${OWNER_EMBED}`)
            .eq('property_id', property.property_id)
            .single()
        if (error || !data) {
            setLoadError("We couldn't load this property. It may have been removed.")
            setLoading(false)
            return
        }
        setDetail(isOwnerView ? withServices(withCoverPhoto(data)) : withServiceNames(withCoverPhoto(data)))
        setLoading(false)
    }, [property?.property_id, isOwnerView])

    useEffect(() => {
        setLoading(true)
        setLoadError('')
        setTab('overview')
        load()
        window.scrollTo({ top: 0 })
    }, [load])

    useEffect(() => {
        let cancelled = false
        loadMarketStats().then((m) => !cancelled && setMarketStats(m))
        return () => {
            cancelled = true
        }
    }, [])

    // ---------- Business data ----------
    useEffect(() => {
        let cancelled = false
        if (!isBusiness || !user?.id || !detail?.property_id) return undefined

        const run = async () => {
            supabase.rpc('record_property_view', { p_property_id: detail.property_id }).then(() => {})

            const [{ data: userRow }, { data: savedRow }] = await Promise.all([
                supabase.from('users').select('dui').eq('id_supabase_auth', user.id).single(),
                supabase.from('saved_properties').select('id').eq('user_auth_id', user.id).eq('property_id', detail.property_id).maybeSingle(),
            ])
            if (cancelled) return
            setSaved(Boolean(savedRow))
            if (!userRow?.dui) {
                setRequestError("We couldn't find your account record (DUI), so you can't request a contract yet. Please contact support.")
                return
            }
            setTenantDui(userRow.dui)
            const { data: existing } = await supabase
                .from('contract')
                .select('status')
                .eq('property_id', detail.property_id)
                .eq('tenant_dui', userRow.dui)
                .in('status', ['Pending', 'Offered', 'Active'])
            if (cancelled) return
            const statuses = (existing || []).map((c) => c.status)
            setOpenRequest(['Active', 'Offered', 'Pending'].find((s) => statuses.includes(s)) || null)
        }
        run()
        return () => {
            cancelled = true
        }
    }, [isBusiness, user?.id, detail?.property_id])

    // Other listed spaces of the same type or in the same municipality.
    useEffect(() => {
        let cancelled = false
        if (!isBusiness || !detail?.property_id) return undefined
        const filters = [`property_type.eq.${JSON.stringify(detail.property_type)}`]
        if (detail.municipality) filters.push(`municipality.eq.${JSON.stringify(detail.municipality)}`)
        supabase
            .from('add_business')
            .select(`*, ${PROPERTY_PHOTO_EMBED}, ${PROPERTY_SERVICE_NAMES_EMBED}`)
            .eq('availability', 'Available')
            .neq('property_id', detail.property_id)
            .or(filters.join(','))
            .order('registration_date', { ascending: false })
            .limit(12)
            .then(({ data }) => {
                if (cancelled) return
                const rows = (data || []).map((r) => withServiceNames(withCoverPhoto(r)))
                const score = (r) => (r.property_type === detail.property_type ? 2 : 0) + (r.municipality === detail.municipality ? 1 : 0)
                setSimilar(rows.sort((a, b) => score(b) - score(a)).slice(0, 3))
            })
        return () => {
            cancelled = true
        }
    }, [isBusiness, detail?.property_id, detail?.property_type, detail?.municipality])

    // ---------- Owner data ----------
    const loadOwnerData = useCallback(async () => {
        if (!isOwnerView || !property?.property_id) return
        const [{ data: contracts }, { data: statRows }, { data: days }, { data: me }] = await Promise.all([
            supabase
                .from('contract')
                .select('contract_id, status, end_date, closed_at, users!contract_tenant_dui_fkey(first_name,last_name)')
                .eq('property_id', property.property_id),
            supabase.rpc('owner_listing_stats'),
            supabase.rpc('owner_property_views', { p_property_id: property.property_id }),
            user?.id ? supabase.from('users').select('dui').eq('id_supabase_auth', user.id).single() : Promise.resolve({ data: null }),
        ])
        setOwnerContracts(contracts || [])
        setStats((statRows || []).find((r) => r.property_id === property.property_id) || null)
        setViewDays(days || [])
        if (me?.dui) setOwnerDui(me.dui)
    }, [isOwnerView, property?.property_id, user?.id])

    useEffect(() => {
        loadOwnerData()
    }, [loadOwnerData])

    // ---------- Actions ----------
    const handleRequestContract = async () => {
        if (!tenantDui || !detail || detail.availability !== 'Available') return
        setRequesting(true)
        setRequestError('')
        setRequestSuccess(false)
        const { data, error } = await supabase
            .from('contract')
            .insert({
                property_id: detail.property_id,
                business_id: detail.business_id,
                tenant_dui: tenantDui,
                monthly_rent: detail.monthly_rent,
                status: 'Pending',
                start_date: null,
                end_date: null,
            })
            .select()
        setRequesting(false)
        if (error || !data?.length) {
            setRequestError(error ? describeSupabaseError(error) : 'The request could not be sent.')
            return
        }
        createNotification({
            recipientDui: detail.owner_id,
            senderDui: tenantDui,
            process: 'Contracts',
            title: `New contract request: ${detail.property_name}`,
            description: 'A business requested to lease this property.',
            contractId: data[0].contract_id,
        })
        setRequestSuccess(true)
        setOpenRequest('Pending')
    }

    const toggleSave = async () => {
        if (!user?.id || !detail) return
        const next = !saved
        setSaved(next)
        if (!(await persistSaved(user.id, detail.property_id, next))) setSaved(!next)
    }

    const askRony = (text) => onAskRony?.(text ? { text } : { text: `Is "${detail.property_name}" a good fit for my business?`, property: toAdvisorPropertyCard(detail) })

    const togglePause = async () => {
        setBusy(true)
        setActionError('')
        const next = detail.availability === 'Reserved' ? 'Available' : 'Reserved'
        const { data, error } = await supabase.from('add_business').update({ availability: next }).eq('property_id', detail.property_id).select('availability')
        setBusy(false)
        if (error || !data?.length) {
            setActionError(error ? describeSupabaseError(error) : 'The listing could not be updated.')
            return
        }
        setDetail((d) => ({ ...d, availability: next }))
    }

    const handleDelete = async () => {
        setBusy(true)
        setActionError('')
        const { data, error } = await supabase.from('add_business').delete().eq('property_id', detail.property_id).select()
        setBusy(false)
        setModal(null)
        if (error || !data?.length) {
            setActionError(error ? describeSupabaseError(error) : 'The property could not be deleted.')
            return
        }
        onBack()
    }

    if (!property) return null

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading property...</p>
            </div>
        )
    }

    if (loadError || !detail) {
        return (
            <div className="ns-detail-page">
                <button type="button" className="ns-detail-back" onClick={onBack}>
                    <i className="bi bi-arrow-left"></i> {backLabel}
                </button>
                <div className="alert alert-danger py-2 mt-3" role="alert">
                    {loadError || 'Property not found.'}
                </div>
            </div>
        )
    }

    const area = areaOf(detail)
    const insight = priceInsight(detail, marketStats)
    const ownerName = personName(detail.users)
    const status = LISTING_STATUS[detail.availability] || LISTING_STATUS.Available

    const header = (
        <>
            <button type="button" className="ns-detail-back" onClick={onBack}>
                <i className="bi bi-arrow-left"></i> {backLabel}
            </button>

            <PropertyGallery
                property={detail}
                badge={
                    isOwnerView ? (
                        <span className={`ns-own-badge tone-${status.tone} ns-pg-badge`}>
                            <i className={`bi ${status.icon}`}></i> {status.label}
                        </span>
                    ) : null
                }
            />

            <div className="ns-pd-head">
                <div className="ns-pd-title">
                    <span className="ns-pd-type">
                        <i className={`bi ${typeIcon(detail.property_type)}`}></i> {detail.property_type}
                    </span>
                    <h1>{detail.property_name}</h1>
                    <p>
                        <i className="bi bi-geo-alt"></i> {locationOf(detail) || 'Location on request'}
                    </p>
                </div>
                <div className="ns-pd-facts">
                    <div>
                        <strong>{detail.monthly_rent != null ? money(detail.monthly_rent) : '—'}</strong>
                        <small>per month</small>
                    </div>
                    <div>
                        <strong>{area ? `${area} m²` : '—'}</strong>
                        <small>
                            {detail.business_size_width} × {detail.business_size_length} m
                        </small>
                    </div>
                    <div>
                        <strong>{insight ? formatPpm(insight.ppm) : '—'}</strong>
                        <small>per m²</small>
                    </div>
                    <div>
                        <strong>{detail.service_names?.length || 0}</strong>
                        <small>amenities</small>
                    </div>
                </div>
            </div>
        </>
    )

    // ===================== Business view =====================
    if (!isOwnerView) {
        return (
            <div className="ns-detail-page">
                {header}
                <div className="ns-pd-grid">
                    <div className="ns-pd-main">
                        <ListingContent detail={detail} />
                        <section className="ns-pd-section">
                            <h3>Owner</h3>
                            <div className="ns-detail-owner">
                                <span className="ns-detail-owner-avatar">{(ownerName[0] || 'O').toUpperCase()}</span>
                                <div>
                                    <div className="ns-detail-owner-name">{ownerName}</div>
                                    <div className="ns-detail-owner-label">
                                        {listedAgo(detail.registration_date) || 'On NextSpace'} · answers requests in Contracts
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <aside className="ns-pd-side">
                        <div className="ns-pd-card">
                            <div className="ns-pd-price">
                                {detail.monthly_rent != null ? (
                                    <>
                                        {money(detail.monthly_rent)}
                                        <small>/month</small>
                                    </>
                                ) : (
                                    'Price on request'
                                )}
                            </div>
                            <PriceMarketBar insight={insight} />

                            {requestError && (
                                <div className="alert alert-danger py-2 mt-2 mb-0" role="alert">
                                    {requestError}
                                </div>
                            )}
                            {requestSuccess && (
                                <div className="alert alert-success py-2 mt-2 mb-0" role="status">
                                    Request sent. The owner answers in Contracts.
                                </div>
                            )}

                            {openRequest === 'Active' ? (
                                <button type="button" className="ns-submit-btn mt-3" onClick={() => onNavigate?.('contracts')}>
                                    <i className="bi bi-key"></i> You lease this space
                                </button>
                            ) : openRequest === 'Offered' ? (
                                <button type="button" className="ns-submit-btn mt-3" onClick={() => onNavigate?.('contracts')}>
                                    <i className="bi bi-pen"></i> Review the owner's offer
                                </button>
                            ) : openRequest === 'Pending' ? (
                                <button type="button" className="ns-submit-btn mt-3" disabled>
                                    <i className="bi bi-hourglass-split"></i> Request sent · waiting for the owner
                                </button>
                            ) : detail.availability !== 'Available' ? (
                                <p className="ns-pay-muted mt-3 mb-0">This space isn't taking requests right now.</p>
                            ) : detail.monthly_rent == null ? (
                                <p className="ns-pay-muted mt-3 mb-0">This space has no rent set yet, so it can't be requested.</p>
                            ) : (
                                <button type="button" className="ns-submit-btn mt-3" onClick={handleRequestContract} disabled={requesting || !tenantDui}>
                                    <i className="bi bi-file-earmark-text"></i> {requesting ? 'Sending...' : 'Request lease'}
                                </button>
                            )}

                            <div className="ns-pd-card-actions">
                                <button type="button" className={saved ? 'is-on' : ''} onClick={toggleSave} aria-pressed={saved}>
                                    <i className={`bi ${saved ? 'bi-heart-fill' : 'bi-heart'}`}></i> {saved ? 'Saved' : 'Save'}
                                </button>
                                {onAskRony && (
                                    <button type="button" onClick={() => askRony()}>
                                        <i className="bi bi-stars"></i> Is it a fit? Ask Rony
                                    </button>
                                )}
                            </div>
                            <p className="ns-pd-note">
                                <i className="bi bi-shield-check"></i> You sign the lease digitally and pay rent in NextSpace.
                            </p>
                        </div>
                    </aside>
                </div>

                {similar.length > 0 && (
                    <section className="ns-similar">
                        <h2>Similar spaces</h2>
                        <div className="ns-mk-grid">
                            {similar.map((p) => (
                                <PropertyCard key={p.property_id} property={p} onOpen={onViewProperty} insight={priceInsight(p, marketStats)} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        )
    }

    // ===================== Owner view =====================
    const active = ownerContracts.find((c) => c.status === 'Active')
    const offer = ownerContracts.find((c) => c.status === 'Offered')
    const requests = ownerContracts.filter((c) => c.status === 'Pending')
    const hasHistory = ownerContracts.length > 0
    const lastClosed = ownerContracts.map((c) => c.closed_at).filter(Boolean).sort().pop()
    const vacantDays = active ? null : daysSince(lastClosed || detail.registration_date)
    const missed = !active && detail.monthly_rent != null && vacantDays > 0 ? Math.round((Number(detail.monthly_rent) / 30) * vacantDays) : 0
    const checklist = listingChecklist(detail)
    const score = listingScore(detail)

    return (
        <div className="ns-detail-page">
            {header}

            {actionError && (
                <div className="alert alert-danger d-flex justify-content-between align-items-center gap-2 py-2" role="alert">
                    <span>{actionError}</span>
                    <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setActionError('')} />
                </div>
            )}

            <div className="ns-pd-owner-bar">
                <div className="ns-pd-tabs" role="tablist" aria-label="Manage this space">
                    {[
                        { id: 'overview', label: 'Overview', icon: 'bi-house' },
                        { id: 'performance', label: 'Performance', icon: 'bi-graph-up' },
                        { id: 'listing', label: 'Listing', icon: 'bi-card-text', badge: score < 100 ? `${score}%` : null },
                    ].map((t) => (
                        <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                            <i className={`bi ${t.icon}`}></i> {t.label}
                            {t.badge && <em>{t.badge}</em>}
                        </button>
                    ))}
                </div>
                <div className="ns-pd-owner-actions">
                    <button type="button" className="ns-filled-btn" onClick={() => setModal('edit')} disabled={!ownerDui}>
                        <i className="bi bi-pencil"></i> Edit
                    </button>
                    <button type="button" className="ns-outline-btn" onClick={() => setModal('duplicate')} disabled={!ownerDui}>
                        <i className="bi bi-copy"></i> Duplicate
                    </button>
                    {!active && (
                        <button type="button" className="ns-outline-btn" onClick={togglePause} disabled={busy}>
                            <i className={`bi ${detail.availability === 'Reserved' ? 'bi-play-circle' : 'bi-pause-circle'}`}></i>{' '}
                            {detail.availability === 'Reserved' ? 'Resume' : 'Pause'}
                        </button>
                    )}
                    {!hasHistory && (
                        <button type="button" className="ns-outline-btn is-danger" onClick={() => setModal('delete')} aria-label="Delete listing" title="Delete listing">
                            <i className="bi bi-trash"></i>
                        </button>
                    )}
                </div>
            </div>

            {tab === 'overview' && (
                <div className="ns-pd-panels">
                    <section className="ns-pd-section">
                        <h3>Right now</h3>
                        {active ? (
                            <div className="ns-pd-now tone-info">
                                <i className="bi bi-key-fill"></i>
                                <div>
                                    <strong>Leased to {personName(active.users)}</strong>
                                    <span>Until {formatDueDate(active.end_date)}</span>
                                </div>
                                <div className="ns-pd-now-actions">
                                    <button type="button" className="ns-outline-btn" onClick={() => onNavigate?.('contracts', { contractId: active.contract_id })}>
                                        Contract
                                    </button>
                                    <button type="button" className="ns-outline-btn" onClick={() => onNavigate?.('payments', { contractId: active.contract_id })}>
                                        Rent
                                    </button>
                                </div>
                            </div>
                        ) : offer ? (
                            <div className="ns-pd-now tone-warning">
                                <i className="bi bi-pen-fill"></i>
                                <div>
                                    <strong>Offer sent to {personName(offer.users)}</strong>
                                    <span>Waiting for their signature</span>
                                </div>
                                <div className="ns-pd-now-actions">
                                    <button type="button" className="ns-outline-btn" onClick={() => onNavigate?.('contracts', { contractId: offer.contract_id })}>
                                        Open offer
                                    </button>
                                </div>
                            </div>
                        ) : requests.length > 0 ? (
                            <div className="ns-pd-now tone-hot">
                                <i className="bi bi-inbox-fill"></i>
                                <div>
                                    <strong>
                                        {requests.length} {requests.length === 1 ? 'business wants' : 'businesses want'} this space
                                    </strong>
                                    <span>{requests.map((r) => personName(r.users)).join(', ')}</span>
                                </div>
                                <div className="ns-pd-now-actions">
                                    <button
                                        type="button"
                                        className="ns-filled-btn"
                                        onClick={() => onNavigate?.('contracts', { contractId: requests.length === 1 ? requests[0].contract_id : null })}
                                    >
                                        Answer
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="ns-pd-now tone-neutral">
                                <i className={`bi ${detail.availability === 'Reserved' ? 'bi-pause-circle-fill' : 'bi-broadcast'}`}></i>
                                <div>
                                    <strong>{detail.availability === 'Reserved' ? 'Paused' : 'Listed, waiting for requests'}</strong>
                                    <span>
                                        {detail.availability === 'Reserved'
                                            ? 'Hidden from the Marketplace. Resume it to get requests.'
                                            : `Vacant ${vacantDays === 0 ? 'since today' : `for ${vacantDays} days`}${missed ? ` · ${money(missed)} in rent missed` : ''}`}
                                    </span>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="ns-pd-section">
                        <h3>Interest</h3>
                        <div className="ns-pd-mini">
                            <div>
                                <strong>{stats?.views_30d ?? 0}</strong>
                                <small>views, last 30 days</small>
                            </div>
                            <div>
                                <strong>{stats?.saves ?? 0}</strong>
                                <small>saved it</small>
                            </div>
                            <div>
                                <strong>{stats?.requests_total ?? 0}</strong>
                                <small>requests, all time</small>
                            </div>
                        </div>
                        <button type="button" className="ns-link-btn mt-2" onClick={() => setTab('performance')}>
                            See performance <i className="bi bi-arrow-right"></i>
                        </button>
                    </section>
                </div>
            )}

            {tab === 'performance' && (
                <div className="ns-pd-panels">
                    <section className="ns-pd-section">
                        <h3>Views</h3>
                        <ViewsChart days={viewDays} />
                        <div className="ns-pd-mini mt-3">
                            <div>
                                <strong>{stats?.saves ?? 0}</strong>
                                <small>businesses saved it</small>
                            </div>
                            <div>
                                <strong>{stats?.requests_total ?? 0}</strong>
                                <small>lease requests</small>
                            </div>
                            <div>
                                <strong>{stats?.views_total ?? 0}</strong>
                                <small>views, all time</small>
                            </div>
                        </div>
                        <p className="ns-pd-hint">
                            {(stats?.views_30d || 0) >= 10 && (stats?.requests_total || 0) === 0
                                ? 'Businesses look but don’t request: check the price and add photos.'
                                : (stats?.views_30d || 0) === 0 && !active
                                  ? 'No views this month. Complete the listing so it shows up in more searches.'
                                  : 'Each business counts once per day; who viewed stays private.'}
                        </p>
                    </section>

                    <section className="ns-pd-section">
                        <h3>Your price</h3>
                        {insight ? (
                            <PriceMarketBar insight={insight} />
                        ) : (
                            <p className="ns-pay-muted">Not enough similar spaces on NextSpace to compare yet.</p>
                        )}
                        {!active && missed > 0 && (
                            <p className="ns-pd-missed">
                                <i className="bi bi-hourglass-split"></i> Vacant {vacantDays} days: {money(missed)} in rent missed.
                            </p>
                        )}
                        {onAskRony && detail.monthly_rent != null && (
                            <button
                                type="button"
                                className="ns-rony-write mt-2"
                                onClick={() =>
                                    askRony(
                                        `What rent should I ask for "${detail.property_name}" (${detail.property_type}, ${area || '?'} m² in ${locationOf(detail) || 'El Salvador'})? It's listed at ${money(detail.monthly_rent)}/month${insight ? ` (${formatPpm(insight.ppm)}; similar spaces go for about ${formatPpm(insight.median)})` : ''}. It had ${stats?.views_30d ?? 0} views this month and ${stats?.requests_total ?? 0} requests in total.`
                                    )
                                }
                            >
                                <i className="bi bi-stars"></i> Ask Rony for a price
                            </button>
                        )}
                    </section>
                </div>
            )}

            {tab === 'listing' && (
                <div className="ns-pd-grid">
                    <div className="ns-pd-main">
                        <p className="ns-pd-preview-note">
                            <i className="bi bi-eye"></i> This is what businesses read about your space.
                        </p>
                        <ListingContent detail={detail} />
                    </div>
                    <aside className="ns-pd-side">
                        <div className="ns-pd-card">
                            <div className="ns-own-quality-head">
                                <span>Listing quality</span>
                                <strong className={score === 100 ? 'is-good' : score < 60 ? 'is-bad' : ''}>{score}%</strong>
                            </div>
                            <div className="ns-own-quality-track">
                                <div style={{ width: `${score}%` }} className={score === 100 ? 'is-good' : score < 60 ? 'is-bad' : ''} />
                            </div>
                            <ul className="ns-pd-checklist">
                                {checklist.map((item) => (
                                    <li key={item.id} className={item.done ? 'is-done' : ''}>
                                        <i className={`bi ${item.done ? 'bi-check-circle-fill' : 'bi-circle'}`}></i> {item.label}
                                    </li>
                                ))}
                            </ul>
                            {score < 100 && (
                                <button type="button" className="ns-submit-btn" onClick={() => setModal('edit')} disabled={!ownerDui}>
                                    Complete the listing
                                </button>
                            )}
                        </div>
                    </aside>
                </div>
            )}

            {(modal === 'edit' || modal === 'duplicate') && ownerDui && (
                <NewPropertyModal
                    property={modal === 'edit' ? detail : null}
                    template={modal === 'duplicate' ? detail : null}
                    ownerDui={ownerDui}
                    onClose={() => setModal(null)}
                    onSaved={async (savedProperty) => {
                        setModal(null)
                        if (modal === 'duplicate' && savedProperty?.property_id) {
                            onViewProperty?.({ property_id: savedProperty.property_id })
                            return
                        }
                        await load()
                        await loadOwnerData()
                    }}
                />
            )}

            {modal === 'delete' && (
                <ConfirmDialog
                    icon="bi-trash"
                    title="Delete this property?"
                    description={`"${detail.property_name}" will be permanently removed from your listings. This can't be undone.`}
                    confirmLabel={busy ? 'Deleting...' : 'Delete'}
                    cancelLabel="Cancel"
                    onConfirm={handleDelete}
                    onCancel={() => setModal(null)}
                />
            )}
        </div>
    )
}
