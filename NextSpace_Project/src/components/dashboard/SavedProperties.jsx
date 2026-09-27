import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import PropertyCard from './PropertyCard'

export default function SavedProperties({ user, onViewProperty, onNavigate }) {
    const [properties, setProperties] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [actionError, setActionError] = useState('')
    const [removingId, setRemovingId] = useState(null)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            setLoadError('')

            const { data, error } = await supabase
                .from('saved_properties')
                .select(`saved_at, add_business(*, ${PROPERTY_PHOTO_EMBED})`)
                .eq('user_auth_id', user.id)
                .order('saved_at', { ascending: false })

            if (cancelled) return

            if (error) {
                setLoadError(describeSupabaseError(error))
                setLoading(false)
                return
            }

            // A listing the owner has since deleted cascades out of
            // saved_properties, but skip any row whose property didn't come
            // back (e.g. hidden by RLS) instead of rendering an empty card.
            setProperties(
                (data || [])
                    .map((row) => row.add_business)
                    .filter(Boolean)
                    .map(withCoverPhoto)
            )
            setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [user.id])

    const handleRemove = async (property) => {
        if (removingId) return

        setRemovingId(property.property_id)
        setActionError('')

        const { error } = await supabase
            .from('saved_properties')
            .delete()
            .eq('user_auth_id', user.id)
            .eq('property_id', property.property_id)

        setRemovingId(null)

        if (error) {
            setActionError(describeSupabaseError(error))
            return
        }

        setProperties((prev) => prev.filter((p) => p.property_id !== property.property_id))
    }

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading saved spaces...</p>
            </div>
        )
    }

    const unavailableCount = properties.filter((p) => p.availability && p.availability !== 'Available').length

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Saved</h1>
                    <p>Spaces you saved to come back to, compare, or request later.</p>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}
            {actionError && (
                <div className="alert alert-danger py-2" role="alert">
                    {actionError}
                </div>
            )}

            {properties.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-heart"></i>
                    <h3>No saved spaces yet</h3>
                    <p>Open a space from the Marketplace and tap Save to keep it here.</p>
                    {onNavigate && (
                        <button type="button" className="ns-outline-btn" onClick={() => onNavigate('home')}>
                            Browse spaces
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {unavailableCount > 0 && (
                        <p className="ns-pay-muted mb-3">
                            <i className="bi bi-info-circle"></i>{' '}
                            {unavailableCount === 1
                                ? '1 saved space is no longer available.'
                                : `${unavailableCount} saved spaces are no longer available.`}
                        </p>
                    )}
                    <div className="ns-prop-grid">
                        {properties.map((property) => (
                            <PropertyCard
                                key={property.property_id}
                                property={property}
                                onAction={onViewProperty}
                                secondaryActions={[
                                    {
                                        label: removingId === property.property_id ? 'Removing...' : 'Remove from saved',
                                        icon: 'bi-heart-fill',
                                        onClick: handleRemove,
                                    },
                                ]}
                            />
                        ))}
                    </div>
                </>
            )}
        </>
    )
}
