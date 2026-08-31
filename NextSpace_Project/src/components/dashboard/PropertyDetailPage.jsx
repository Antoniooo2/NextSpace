import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { TYPE_ICON } from './PropertyCard'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import { PROPERTY_SERVICE_NAMES_EMBED, withServiceNames } from '../../lib/propertyServices'

export default function PropertyDetailPage({ property, onBack }) {
    const [detail, setDetail] = useState(property || null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')

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

                    {detail.phone_number && (
                        <div className="ns-detail-owner">
                            <span className="ns-detail-owner-avatar">
                                <i className="bi bi-telephone"></i>
                            </span>
                            <div>
                                <div className="ns-detail-owner-name">{detail.phone_number}</div>
                                <div className="ns-detail-owner-label">Contact phone</div>
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    )
}
