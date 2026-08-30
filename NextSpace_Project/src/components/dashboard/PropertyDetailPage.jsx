import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { TYPE_ICON } from './PropertyCard'

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
                .select('*')
                .eq('property_id', property.property_id)
                .single()

            if (cancelled) return

            if (error || !data) {
                setLoadError("We couldn't load this property. It may have been removed.")
                setLoading(false)
                return
            }

            setDetail(data)
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

    return (
        <div className="ns-detail-page">
            <button type="button" className="ns-detail-back" onClick={onBack}>
                <i className="bi bi-arrow-left"></i> Back to listings
            </button>

            <div className="ns-detail-hero">
                <div className="ns-detail-hero-placeholder">
                    <i className={`bi ${typeIcon}`}></i>
                </div>
            </div>

            <div className="ns-detail-grid">
                <div className="ns-detail-main">
                    <h1>{detail.property_name}</h1>
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
                    </div>

                    <p className="ns-detail-desc">
                        A commercial space ready for your business. Reach out through NextSpace to schedule a
                        visit, request the digital contract, or ask the owner any questions before booking.
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

                    <button type="button" className="ns-submit-btn">
                        Request a visit
                    </button>
                </aside>
            </div>
        </div>
    )
}
