import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { TYPE_ICON } from './PropertyCard'
import { describeSupabaseError } from './NewPropertyModal'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import { PROPERTY_SERVICE_NAMES_EMBED, withServiceNames } from '../../lib/propertyServices'

export default function PropertyDetailPage({ property, user, accountType, onBack }) {
    const [detail, setDetail] = useState(property || null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [tenantDui, setTenantDui] = useState(null)
    const [hasPendingRequest, setHasPendingRequest] = useState(false)
    const [requesting, setRequesting] = useState(false)
    const [requestError, setRequestError] = useState('')
    const [requestSuccess, setRequestSuccess] = useState(false)

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
                .select(`*, ${PROPERTY_PHOTO_EMBED}, ${PROPERTY_SERVICE_NAMES_EMBED}`)
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
            if (accountType !== 'business' || !user?.id || !detail?.property_id) return

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
    }, [accountType, user?.id, detail?.property_id])

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

        setRequestSuccess(true)
        setHasPendingRequest(true)
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
    const locationText = [detail.address, detail.municipality, detail.department].filter(Boolean).join(', ')

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
            </div>

            <div className="ns-detail-grid">
                <div className="ns-detail-main">
                    <h1>{detail.property_name}</h1>
                    <p className="ns-detail-location">
                        <i className={`bi ${typeIcon}`}></i> {detail.property_type}
                    </p>
                    {locationText && (
                        <p className="ns-detail-location">
                            <i className="bi bi-geo-alt"></i> {locationText}
                        </p>
                    )}

                    <div className="ns-detail-tags">
                        <span>
                            <i className="bi bi-arrows-angle-expand"></i> {detail.business_size_width} × {detail.business_size_length} m
                        </span>
                        <span>
                            <i className="bi bi-info-circle"></i> {detail.availability}
                        </span>
                    </div>

                    {detail.service_names?.length > 0 && (
                        <div className="ns-detail-tags">
                            {detail.service_names.map((name) => (
                                <span key={name}>
                                    <i className="bi bi-check2"></i> {name}
                                </span>
                            ))}
                        </div>
                    )}

                    <p className="ns-detail-desc">
                        {detail.description ||
                            'A commercial space ready for your business. Reach out through NextSpace to schedule a visit, request the digital contract, or ask the owner any questions before booking.'}
                    </p>
                </div>

                <aside className="ns-detail-side">
                    <div className="ns-detail-price">
                        {detail.monthly_rent != null ? (
                            <>${Number(detail.monthly_rent).toLocaleString()} <small>/mo</small></>
                        ) : (
                            'Contact for price'
                        )}
                    </div>

                    {accountType === 'business' && (
                        <>
                            {requestError && (
                                <div className="alert alert-danger py-2" role="alert">
                                    {requestError}
                                </div>
                            )}
                            {requestSuccess && (
                                <div className="alert alert-success py-2" role="alert">
                                    Your contract request was sent to the owner.
                                </div>
                            )}
                            {detail.monthly_rent == null ? (
                                <p className="ns-pay-muted mb-0">
                                    This property doesn't have a rent price set yet — contact the owner directly.
                                </p>
                            ) : hasPendingRequest ? (
                                <button type="button" className="ns-submit-btn" disabled>
                                    Request pending
                                </button>
                            ) : (
                                <button
                                    type="button" className="ns-submit-btn"
                                    onClick={handleRequestContract} disabled={requesting}
                                >
                                    {requesting ? 'Sending...' : 'Request contract'}
                                </button>
                            )}
                        </>
                    )}
                </aside>
            </div>
        </div>
    )
}
