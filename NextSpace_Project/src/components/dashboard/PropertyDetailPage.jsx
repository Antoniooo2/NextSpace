import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { TYPE_ICON } from '../../lib/propertyTypes'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import { PROPERTY_SERVICE_NAMES_EMBED, withServiceNames } from '../../lib/propertyServices'
import { createNotification } from '../../lib/notifications'

const AVAILABILITY_CLASS = {
    Available: 'available',
    Occupied: 'occupied',
    Reserved: 'reserved',
}

const OWNER_EMBED = 'users!add_business_owner_id_fkey(first_name,last_name)'

export default function PropertyDetailPage({ property, user, accountType, onBack, onNavigate }) {
    const [detail, setDetail] = useState(property || null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [tenantDui, setTenantDui] = useState(null)
    const [hasPendingRequest, setHasPendingRequest] = useState(false)
    const [requesting, setRequesting] = useState(false)
    const [requestError, setRequestError] = useState('')
    const [requestSuccess, setRequestSuccess] = useState(false)

    const [saved, setSaved] = useState(false)
    const [savingFavorite, setSavingFavorite] = useState(false)
    const [shareCopied, setShareCopied] = useState(false)

    const [aiAnalyzing, setAiAnalyzing] = useState(false)
    const [aiReply, setAiReply] = useState('')
    const [aiError, setAiError] = useState('')

    const isBusiness = accountType === 'business'

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

            if (cancelled || userError || !userRow) return

            setTenantDui(userRow.dui)

            const { data: existing, error: existingError } = await supabase
                .from('contract')
                .select('contract_id')
                .eq('property_id', detail.property_id)
                .eq('tenant_dui', userRow.dui)
                .eq('status', 'Pending')

            if (cancelled || existingError) return

            setHasPendingRequest((existing || []).length > 0)
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

    const handleRequestContract = async () => {
        if (!tenantDui || !detail) return

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
        setHasPendingRequest(true)
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

    const handleShare = async () => {
        if (!detail) return

        const shareText = `${detail.property_name} — ${
            detail.monthly_rent != null ? `$${Number(detail.monthly_rent).toLocaleString()}/month` : 'contact for price'
        } on NextSpace`

        if (navigator.share) {
            try {
                await navigator.share({ title: detail.property_name, text: shareText })
            } catch {
                // The user closed the share sheet without picking anything; nothing to do.
            }
            return
        }

        try {
            await navigator.clipboard.writeText(shareText)
            setShareCopied(true)
            setTimeout(() => setShareCopied(false), 2000)
        } catch {
            setShareCopied(false)
        }
    }

    const handleAnalyze = async () => {
        if (!detail || aiAnalyzing) return

        setAiAnalyzing(true)
        setAiError('')
        setAiReply('')

        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData?.session?.access_token

        if (!accessToken) {
            setAiAnalyzing(false)
            setAiError('Your session expired. Please sign in again.')
            return
        }

        const propertyCard = {
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

        try {
            const response = await fetch('/api/advisor', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    role: 'business',
                    messages: [
                        {
                            role: 'user',
                            content: `Is "${detail.property_name}" a good fit for my business? Please analyze it for me.`,
                        },
                    ],
                    filter: null,
                    results: [propertyCard],
                    relaxed: [],
                }),
            })

            const result = await response.json()
            if (!response.ok) {
                throw new Error(result.error || 'Something went wrong. Please try again.')
            }

            setAiReply(result.reply || '')
        } catch (err) {
            setAiError(err.message || 'Something went wrong. Please try again.')
        } finally {
            setAiAnalyzing(false)
        }
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
                    <i className="bi bi-arrow-left"></i> Back to listings
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
    const listedSince = detail.registration_date
        ? new Date(detail.registration_date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : null

    return (
        <div className="ns-detail-page">
            <button type="button" className="ns-detail-back" onClick={onBack}>
                <i className="bi bi-arrow-left"></i> Back to listings
            </button>

            <div className="ns-detail-hero">
                {detail.photo_url ? (
                    <img src={detail.photo_url} alt={detail.property_name} />
                ) : (
                    <div className="ns-detail-hero-placeholder">
                        <i className={`bi ${typeIcon}`}></i>
                    </div>
                )}
                {detail.availability && (
                    <span className={`ns-prop-availability ${availabilityClass}`}>{detail.availability}</span>
                )}
                <div className="ns-detail-hero-overlay">
                    <h1>{detail.property_name}</h1>
                </div>
            </div>

            <div className="ns-detail-grid">
                <div className="ns-detail-main">
                    <div className="ns-detail-subrow">
                        <p className="ns-detail-location">
                            <i className={`bi ${typeIcon}`}></i> {detail.property_type}
                        </p>
                        <div className="ns-detail-tags">
                            <span>
                                <i className="bi bi-arrows-angle-expand"></i> {detail.business_size_width} × {detail.business_size_length} m
                            </span>
                            <span>
                                <i className="bi bi-info-circle"></i> {detail.availability}
                            </span>
                            <span>
                                <i className="bi bi-briefcase"></i> Business Space
                            </span>
                        </div>
                    </div>

                    <div className="ns-detail-card">
                        <h3>About this space</h3>
                        <p className="ns-detail-desc">
                            {detail.description ||
                                'A commercial space ready for your business. Reach out through NextSpace to schedule a visit, request the digital contract, or ask the owner any questions before booking.'}
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
                                <i className="bi bi-stars"></i>
                                <span>
                                    {detail.service_names?.length > 0
                                        ? `${detail.service_names.length} amenities included`
                                        : 'No amenities listed'}
                                </span>
                            </div>
                        </div>
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
                                    <div className="ns-detail-owner-label">
                                        {detail.phone_number ? (
                                            <a href={`tel:${detail.phone_number}`}>{detail.phone_number}</a>
                                        ) : (
                                            'Contact number not listed'
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="ns-detail-side-col">
                <aside className="ns-detail-side">
                    <h3 className="ns-detail-side-title">Rental Summary</h3>

                    <div className="ns-detail-summary-row">
                        <span>Monthly Rent</span>
                        <strong>
                            {detail.monthly_rent != null ? `$${Number(detail.monthly_rent).toLocaleString()}` : 'Contact for price'}
                        </strong>
                    </div>
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
                        <strong>{detail.business_size_width} m</strong>
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
                                    This property doesn't have a rent price set yet — contact the owner directly.
                                </p>
                            ) : hasPendingRequest ? (
                                <button type="button" className="ns-submit-btn mt-3" disabled>
                                    <i className="bi bi-file-earmark-check"></i> Contract requested
                                </button>
                            ) : (
                                <button
                                    type="button" className="ns-submit-btn mt-3"
                                    onClick={handleRequestContract} disabled={requesting}
                                >
                                    <i className="bi bi-file-earmark-text"></i> {requesting ? 'Sending...' : 'Start Contract'}
                                </button>
                            )}

                            {detail.phone_number && (
                                <a href={`tel:${detail.phone_number}`} className="ns-outline-btn ns-detail-contact-btn mt-2">
                                    <i className="bi bi-chat-dots"></i> Contact Owner
                                </a>
                            )}

                            <p className="ns-detail-protect-note">
                                <i className="bi bi-shield-check"></i> Contracts are managed and tracked digitally through
                                NextSpace, so you and the owner always have a clear record.
                            </p>
                        </>
                    )}

                    <div className="ns-detail-actions-row">
                        <button type="button" className="ns-detail-action-link" onClick={handleShare}>
                            <i className="bi bi-share"></i> {shareCopied ? 'Copied!' : 'Share'}
                        </button>
                        {isBusiness && (
                            <button
                                type="button"
                                className={`ns-detail-action-link ${saved ? 'active' : ''}`}
                                onClick={handleToggleSave}
                                disabled={savingFavorite}
                            >
                                <i className={`bi ${saved ? 'bi-heart-fill' : 'bi-heart'}`}></i> {saved ? 'Saved' : 'Save'}
                            </button>
                        )}
                        {isBusiness && (
                            <button
                                type="button"
                                className="ns-detail-action-link"
                                onClick={() => onNavigate && onNavigate('advisor')}
                            >
                                <i className="bi bi-question-circle"></i> Ask
                            </button>
                        )}
                    </div>
                </aside>

                {isBusiness && (
                    <div className="ns-detail-ai-panel">
                        <h4>
                            <i className="bi bi-lightbulb"></i> Is this space for you?
                        </h4>
                        <p>We can analyze this space against what you're looking for and tell you if it's a good match.</p>

                        {aiError && (
                            <div className="alert alert-danger py-2" role="alert">
                                {aiError}
                            </div>
                        )}

                        {aiReply ? (
                            <p className="ns-detail-ai-reply">{aiReply}</p>
                        ) : (
                            <button type="button" className="ns-detail-ai-btn" onClick={handleAnalyze} disabled={aiAnalyzing}>
                                <i className="bi bi-stars"></i> {aiAnalyzing ? 'Analyzing...' : 'Analyze with AI'}
                            </button>
                        )}
                    </div>
                )}
                </div>
            </div>
        </div>
    )
}
