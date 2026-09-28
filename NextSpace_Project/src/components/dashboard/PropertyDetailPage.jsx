import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { TYPE_ICON } from '../../lib/propertyTypes'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import { PROPERTY_SERVICE_NAMES_EMBED, withServiceNames } from '../../lib/propertyServices'
import { createNotification } from '../../lib/notifications'
import { LISTING_STATUS } from '../../lib/propertyTypes'
import { SERVICE_ICON, areaOf } from '../../lib/listings'
import { formatDueDate } from '../../lib/rentSchedule'
import { money, personName } from '../../lib/contracts'
import PropertyCard from './PropertyCard'
import { formatPpm, loadMarketStats, priceInsight } from '../../lib/market'
import './listings.css'

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

const AVAILABILITY_CLASS = {
    Available: 'available',
    Occupied: 'occupied',
    Reserved: 'reserved',
}

const OWNER_EMBED = 'users!add_business_owner_id_fkey(first_name,last_name)'

export default function PropertyDetailPage({ property, user, accountType, onBack, onAskRony, onViewProperty, onNavigate, backLabel = 'Back' }) {
    const [detail, setDetail] = useState(property || null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [tenantDui, setTenantDui] = useState(null)
    // Status of this business's open request on the space: 'Pending', 'Offered' or null.
    const [openRequest, setOpenRequest] = useState(null)
    const [requesting, setRequesting] = useState(false)
    const [requestError, setRequestError] = useState('')
    const [requestSuccess, setRequestSuccess] = useState(false)

    const [saved, setSaved] = useState(false)
    const [savingFavorite, setSavingFavorite] = useState(false)

    const isBusiness = accountType === 'business'
    const isOwnerView = accountType === 'property-owner'
    const [photoIndex, setPhotoIndex] = useState(0)
    const [similar, setSimilar] = useState([])
    const [ownerContracts, setOwnerContracts] = useState([])
    const [marketStats, setMarketStats] = useState(null)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            if (!property?.property_id) {
                setLoading(false)
                return
            }

            setLoading(true)
            setLoadError('')

            const { data, error } = await supabase
                .from('add_business')
                .select(`*, ${PROPERTY_PHOTO_EMBED}, ${PROPERTY_SERVICE_NAMES_EMBED}, ${OWNER_EMBED}`)
                .eq('property_id', property.property_id)
                .single()

            if (cancelled) return

            if (error || !data) {
                setLoadError("We couldn't load this property. It may have been removed.")
                setLoading(false)
                return
            }

            setDetail(withServiceNames(withCoverPhoto(data)))
            setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [property?.property_id])

    useEffect(() => {
        let cancelled = false

        const checkExistingRequest = async () => {
            if (!isBusiness || !user?.id || !detail?.property_id) return

            const { data: userRow, error: userError } = await supabase
                .from('users')
                .select('dui')
                .eq('id_supabase_auth', user.id)
                .single()

            if (cancelled) return
            if (userError || !userRow?.dui) {
                setRequestError(
                    "We couldn't find your account record (DUI), so you can't request a contract yet. Please contact support."
                )
                return
            }

            setTenantDui(userRow.dui)

            const { data: existing, error: existingError } = await supabase
                .from('contract')
                .select('contract_id, status')
                .eq('property_id', detail.property_id)
                .eq('tenant_dui', userRow.dui)
                .in('status', ['Pending', 'Offered'])

            if (cancelled || existingError) return

            setOpenRequest(existing?.some((c) => c.status === 'Offered') ? 'Offered' : existing?.length ? 'Pending' : null)
        }

        checkExistingRequest()

        return () => {
            cancelled = true
        }
    }, [isBusiness, user?.id, detail?.property_id])

    useEffect(() => {
        let cancelled = false

        const checkSaved = async () => {
            if (!isBusiness || !user?.id || !detail?.property_id) return

            const { data } = await supabase
                .from('saved_properties')
                .select('id')
                .eq('user_auth_id', user.id)
                .eq('property_id', detail.property_id)
                .maybeSingle()

            if (!cancelled) setSaved(Boolean(data))
        }

        checkSaved()

        return () => {
            cancelled = true
        }
    }, [isBusiness, user?.id, detail?.property_id])

    useEffect(() => {
        setPhotoIndex(0)
        window.scrollTo({ top: 0 })
    }, [detail?.property_id])

    // Count a business's visit (once a day; owners see only totals) and load
    // the price comparison.
    useEffect(() => {
        if (!isBusiness || !detail?.property_id) return
        supabase.rpc('record_property_view', { p_property_id: detail.property_id }).then(() => {})
    }, [isBusiness, detail?.property_id])

    useEffect(() => {
        let cancelled = false
        loadMarketStats().then((stats) => {
            if (!cancelled) setMarketStats(stats)
        })
        return () => {
            cancelled = true
        }
    }, [])

    // Other listed spaces of the same type or in the same municipality.
    useEffect(() => {
        let cancelled = false
        if (!isBusiness || !detail?.property_id) return undefined
        const load = async () => {
            const filters = [`property_type.eq.${JSON.stringify(detail.property_type)}`]
            if (detail.municipality) filters.push(`municipality.eq.${JSON.stringify(detail.municipality)}`)
            const { data } = await supabase
                .from('add_business')
                .select(`*, ${PROPERTY_PHOTO_EMBED}, ${PROPERTY_SERVICE_NAMES_EMBED}`)
                .eq('availability', 'Available')
                .neq('property_id', detail.property_id)
                .or(filters.join(','))
                .order('registration_date', { ascending: false })
                .limit(12)
            if (cancelled) return
            const rows = (data || []).map((r) => withServiceNames(withCoverPhoto(r)))
            // Same type and same municipality first.
            const score = (r) => (r.property_type === detail.property_type ? 2 : 0) + (r.municipality === detail.municipality ? 1 : 0)
            setSimilar(rows.sort((a, b) => score(b) - score(a)).slice(0, 3))
        }
        load()
        return () => {
            cancelled = true
        }
    }, [isBusiness, detail?.property_id, detail?.property_type, detail?.municipality])

    // Owner looking at their own space: who leases it or who asked for it.
    useEffect(() => {
        let cancelled = false
        if (!isOwnerView || !detail?.property_id) return undefined
        supabase
            .from('contract')
            .select('contract_id, status, end_date, requested_at, users!contract_tenant_dui_fkey(first_name,last_name)')
            .eq('property_id', detail.property_id)
            .in('status', ['Active', 'Offered', 'Pending'])
            .then(({ data }) => {
                if (!cancelled) setOwnerContracts(data || [])
            })
        return () => {
            cancelled = true
        }
    }, [isOwnerView, detail?.property_id])

    const handleRequestContract = async () => {
        if (!tenantDui || !detail) return
        if (detail.availability && detail.availability !== 'Available') return

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

        if (error) {
            setRequestError(describeSupabaseError(error))
            return
        }
        if (!data || data.length === 0) {
            setRequestError(
                "The request could not be sent. This is usually caused by a permissions (row-level security) rule blocking it."
            )
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

    const handleToggleSave = async () => {
        if (!user?.id || !detail?.property_id || savingFavorite) return

        setSavingFavorite(true)

        if (saved) {
            const { error } = await supabase
                .from('saved_properties')
                .delete()
                .eq('user_auth_id', user.id)
                .eq('property_id', detail.property_id)
            if (!error) setSaved(false)
        } else {
            const { error } = await supabase
                .from('saved_properties')
                .insert({ user_auth_id: user.id, property_id: detail.property_id })
            if (!error) setSaved(true)
        }

        setSavingFavorite(false)
    }

    const handleAskRony = () => {
        if (!detail || !onAskRony) return
        onAskRony({
            text: `Is "${detail.property_name}" a good fit for my business?`,
            property: toAdvisorPropertyCard(detail),
        })
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

    const typeIcon = TYPE_ICON[detail.property_type] || 'bi-building'
    const availabilityClass = AVAILABILITY_CLASS[detail.availability] || 'available'
    const locationText = [detail.municipality, detail.department].filter(Boolean).join(', ')
    const ownerName = [detail.users?.first_name, detail.users?.last_name].filter(Boolean).join(' ')
    const photos = detail.photos || (detail.photo_url ? [{ photo_url: detail.photo_url }] : [])
    const area = areaOf(detail)
    const insight = priceInsight(detail, marketStats)
    const ownerStatus = LISTING_STATUS[detail.availability] || LISTING_STATUS.Available
    const activeLease = ownerContracts.find((c) => c.status === 'Active')
    const offer = ownerContracts.find((c) => c.status === 'Offered')
    const requests = ownerContracts.filter((c) => c.status === 'Pending')
    const listedSince = detail.registration_date
        ? new Date(detail.registration_date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : null

    return (
        <div className="ns-detail-page">
            <button type="button" className="ns-detail-back" onClick={onBack}>
                <i className="bi bi-arrow-left"></i> {backLabel}
            </button>

            <div className="ns-gallery">
                <div className="ns-detail-hero">
                    {photos.length > 0 ? (
                        <img src={photos[photoIndex]?.photo_url} alt={`${detail.property_name}, photo ${photoIndex + 1}`} />
                    ) : (
                        <div className="ns-detail-hero-placeholder">
                            <i className={`bi ${typeIcon}`}></i>
                        </div>
                    )}
                    {detail.availability && (
                        <span className={`ns-prop-availability ${availabilityClass}`}>{detail.availability}</span>
                    )}
                    {photos.length > 1 && (
                        <>
                            <button
                                type="button"
                                className="ns-gallery-nav is-prev"
                                aria-label="Previous photo"
                                onClick={() => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)}
                            >
                                <i className="bi bi-chevron-left"></i>
                            </button>
                            <button
                                type="button"
                                className="ns-gallery-nav is-next"
                                aria-label="Next photo"
                                onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                            >
                                <i className="bi bi-chevron-right"></i>
                            </button>
                            <span className="ns-gallery-count">
                                {photoIndex + 1} / {photos.length}
                            </span>
                        </>
                    )}
                    <div className="ns-detail-hero-overlay">
                        <h1>{detail.property_name}</h1>
                    </div>
                </div>
                {photos.length > 1 && (
                    <div className="ns-gallery-thumbs">
                        {photos.map((ph, i) => (
                            <button
                                type="button"
                                key={ph.photo_id || ph.photo_url}
                                className={i === photoIndex ? 'active' : ''}
                                onClick={() => setPhotoIndex(i)}
                                aria-label={`Photo ${i + 1}`}
                            >
                                <img src={ph.photo_url} alt="" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="ns-detail-grid">
                <div className="ns-detail-main">
                    <div className="ns-detail-card">
                        <h3>About this space</h3>
                        <p className="ns-detail-desc">
                            {detail.description ||
                                'A commercial space ready for your business. Ask Rony whether it fits what you need, or request the digital contract through NextSpace.'}
                        </p>
                    </div>

                    <div className="ns-detail-card">
                        <h3>Space Information</h3>
                        <div className="ns-detail-info-grid">
                            <div className="ns-detail-info-item">
                                <i className={`bi ${typeIcon}`}></i>
                                <span>{detail.property_type}</span>
                            </div>
                            <div className="ns-detail-info-item">
                                <i className="bi bi-arrows-angle-expand"></i>
                                <span>{detail.business_size_width} × {detail.business_size_length} m</span>
                            </div>
                            <div className="ns-detail-info-item">
                                <i className="bi bi-calendar2-check"></i>
                                <span>{detail.availability}</span>
                            </div>
                            <div className="ns-detail-info-item">
                                <i className="bi bi-geo-alt"></i>
                                <span>{locationText || 'Location on request'}</span>
                            </div>
                            <div className="ns-detail-info-item">
                                <i className="bi bi-calendar3"></i>
                                <span>{listedSince ? `Listed ${listedSince}` : 'Recently listed'}</span>
                            </div>
                            <div className="ns-detail-info-item">
                                <i className="bi bi-bounding-box"></i>
                                <span>{area ? `${area} m² in total` : 'Size on request'}</span>
                            </div>
                        </div>
                        {detail.address && (
                            <p className="ns-detail-address">
                                <i className="bi bi-signpost"></i> {detail.address}
                            </p>
                        )}
                    </div>

                    <div className="ns-detail-card">
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
                            <p className="ns-pay-muted mb-0">The owner hasn't listed amenities for this space.</p>
                        )}
                    </div>

                    {isBusiness && (
                        <div className="ns-detail-card">
                            <h3>Property Owner</h3>
                            <div className="ns-detail-owner">
                                <span className="ns-detail-owner-avatar">
                                    {(ownerName[0] || 'O').toUpperCase()}
                                </span>
                                <div>
                                    <div className="ns-detail-owner-name">{ownerName || 'Property owner'}</div>
                                    <div className="ns-detail-owner-label">Gets your contract request through NextSpace</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="ns-detail-side-col">
                {isOwnerView && (
                    <aside className="ns-detail-side ns-owner-panel">
                        <h3 className="ns-detail-side-title">Your listing</h3>
                        <span className={`ns-own-badge tone-${ownerStatus.tone} is-inline`}>
                            <i className={`bi ${ownerStatus.icon}`}></i> {ownerStatus.label}
                        </span>
                        {activeLease ? (
                            <p className="ns-owner-panel-line">
                                Leased to <strong>{personName(activeLease.users)}</strong> until{' '}
                                {formatDueDate(activeLease.end_date)}.
                            </p>
                        ) : offer ? (
                            <p className="ns-owner-panel-line">
                                Offer sent to <strong>{personName(offer.users)}</strong>, waiting for their signature.
                            </p>
                        ) : requests.length > 0 ? (
                            <p className="ns-owner-panel-line">
                                <strong>
                                    {requests.length} {requests.length === 1 ? 'business wants' : 'businesses want'}
                                </strong>{' '}
                                to lease this space.
                            </p>
                        ) : (
                            <p className="ns-owner-panel-line">
                                {detail.availability === 'Reserved'
                                    ? 'Paused: businesses can’t see or request it.'
                                    : 'Listed and waiting for requests.'}
                            </p>
                        )}
                        <div className="ns-owner-panel-actions">
                            {(activeLease || offer || requests.length > 0) && onNavigate && (
                                <button
                                    type="button"
                                    className="ns-filled-btn"
                                    onClick={() =>
                                        onNavigate('contracts', {
                                            contractId: (activeLease || offer || (requests.length === 1 ? requests[0] : null))?.contract_id ?? null,
                                        })
                                    }
                                >
                                    <i className="bi bi-file-earmark-text"></i>{' '}
                                    {activeLease ? 'Open contract' : offer ? 'Open offer' : 'Answer requests'}
                                </button>
                            )}
                            {activeLease && onNavigate && (
                                <button
                                    type="button"
                                    className="ns-outline-btn"
                                    onClick={() => onNavigate('payments', { contractId: activeLease.contract_id })}
                                >
                                    <i className="bi bi-credit-card"></i> Rent in Payments
                                </button>
                            )}
                        </div>
                        <p className="ns-owner-panel-note">
                            <i className="bi bi-eye"></i> The rest of this page is what businesses see
                            {detail.monthly_rent != null ? ` at ${money(detail.monthly_rent)}/month` : ''}. Edit it from My
                            Properties.
                        </p>
                    </aside>
                )}
                {isBusiness && (
                <aside className="ns-detail-side">
                    <h3 className="ns-detail-side-title">Rental Summary</h3>

                    <div className="ns-detail-summary-row">
                        <span>Monthly Rent</span>
                        <strong>
                            {detail.monthly_rent != null ? `$${Number(detail.monthly_rent).toLocaleString()}` : 'Contact for price'}
                        </strong>
                    </div>
                    {insight && (
                        <div className="ns-detail-price-insight">
                            <span className={`ns-price-tag tone-${insight.tone}`}>{insight.label}</span>
                            <small>
                                {formatPpm(insight.ppm)} here vs {formatPpm(insight.median)} for {insight.scope}
                            </small>
                        </div>
                    )}
                    <div className="ns-detail-summary-row">
                        <span>Property Type</span>
                        <strong>{detail.property_type}</strong>
                    </div>
                    <div className="ns-detail-summary-row">
                        <span>Availability</span>
                        <strong>{detail.availability}</strong>
                    </div>
                    <div className="ns-detail-summary-row">
                        <span>Size</span>
                        <strong>{detail.business_size_width} × {detail.business_size_length} m</strong>
                    </div>

                    {isBusiness && (
                        <>
                            {requestError && (
                                <div className="alert alert-danger py-2 mt-3" role="alert">
                                    {requestError}
                                </div>
                            )}
                            {requestSuccess && (
                                <div className="alert alert-success py-2 mt-3" role="alert">
                                    Your contract request was sent to the owner.
                                </div>
                            )}

                            {detail.monthly_rent == null ? (
                                <p className="ns-pay-muted mt-3 mb-0">
                                    This property doesn't have a rent price set yet.
                                </p>
                            ) : openRequest === 'Offered' ? (
                                <p className="ns-pay-muted mt-3 mb-0">
                                    <i className="bi bi-pen"></i> The owner sent you a lease offer for this space. Review and
                                    sign it in Contracts.
                                </p>
                            ) : openRequest ? (
                                <button type="button" className="ns-submit-btn mt-3" disabled>
                                    <i className="bi bi-file-earmark-check"></i> Request pending
                                </button>
                            ) : detail.availability && detail.availability !== 'Available' ? (
                                <p className="ns-pay-muted mt-3 mb-0">
                                    This space is {detail.availability.toLowerCase()} right now, so it can't take new
                                    contract requests.
                                </p>
                            ) : (
                                <button
                                    type="button" className="ns-submit-btn mt-3"
                                    onClick={handleRequestContract} disabled={requesting || !tenantDui}
                                >
                                    <i className="bi bi-file-earmark-text"></i> {requesting ? 'Sending...' : 'Request Contract'}
                                </button>
                            )}

                            <p className="ns-detail-protect-note">
                                <i className="bi bi-shield-check"></i> Contracts are managed and tracked digitally through
                                NextSpace, so you and the owner always have a clear record.
                            </p>
                        </>
                    )}

                    {isBusiness && (
                        <div className="ns-detail-actions-row">
                            <button
                                type="button"
                                className={`ns-detail-action-link ${saved ? 'active' : ''}`}
                                onClick={handleToggleSave}
                                disabled={savingFavorite}
                            >
                                <i className={`bi ${saved ? 'bi-heart-fill' : 'bi-heart'}`}></i> {saved ? 'Saved' : 'Save'}
                            </button>
                        </div>
                    )}
                </aside>
                )}

                {isBusiness && (
                    <div className="ns-detail-ai-panel">
                        <h4>
                            <i className="bi bi-lightbulb"></i> Is this space for you?
                        </h4>
                        <p>Ask Rony, our AI advisor, whether this space fits what you're looking for.</p>

                        <button type="button" className="ns-detail-ai-btn" onClick={handleAskRony}>
                            <i className="bi bi-stars"></i> Analyze with Rony
                        </button>
                    </div>
                )}
                </div>
            </div>

            {isBusiness && similar.length > 0 && (
                <section className="ns-similar">
                    <h2>Similar spaces</h2>
                    <div className="ns-mk-grid">
                        {similar.map((p) => (
                            <PropertyCard key={p.property_id} property={p} onOpen={onViewProperty} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
