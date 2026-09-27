import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import { useOwnerProperties } from '../../hooks/useOwnerProperties'
import EditProfileModal from './EditProfileModal'
import ChangePasswordModal from './ChangePasswordModal'

const ACCOUNT_TYPE_LABEL = {
    business: 'Business',
    'property-owner': 'Property Owner',
}

const PREVIEW_COUNT = 2

export default function ProfileView({ user, accountType, onNavigate, onUserUpdated, onViewProperty }) {
    const [showEditModal, setShowEditModal] = useState(false)
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
    const [contractsCount, setContractsCount] = useState(0)
    const [savedProperties, setSavedProperties] = useState([])
    const [loadingSaved, setLoadingSaved] = useState(true)
    const [showAll, setShowAll] = useState(false)
    const [removingId, setRemovingId] = useState(null)

    const meta = user.user_metadata || {}
    const firstName = meta.first_name || ''
    const lastName = meta.last_name || ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'NextSpace User'
    const initials = ((firstName[0] || 'U') + (lastName[0] || '')).toUpperCase()

    const isOwner = accountType === 'property-owner'

    const { properties: ownProperties, loading: loadingProperties } = useOwnerProperties(isOwner ? user : null)

    useEffect(() => {
        let cancelled = false

        const loadContractsCount = async () => {
            if (isOwner) {
                if (loadingProperties || ownProperties.length === 0) {
                    if (!cancelled) setContractsCount(0)
                    return
                }
                const propertyIds = ownProperties.map((p) => p.property_id)
                const { count } = await supabase
                    .from('contract')
                    .select('contract_id', { count: 'exact', head: true })
                    .in('property_id', propertyIds)
                if (!cancelled) setContractsCount(count || 0)
            } else {
                if (!meta.dui) {
                    if (!cancelled) setContractsCount(0)
                    return
                }
                const { count } = await supabase
                    .from('contract')
                    .select('contract_id', { count: 'exact', head: true })
                    .eq('tenant_dui', meta.dui)
                if (!cancelled) setContractsCount(count || 0)
            }
        }

        loadContractsCount()

        return () => {
            cancelled = true
        }
    }, [isOwner, loadingProperties, ownProperties, meta.dui])

    useEffect(() => {
        if (isOwner) return
        let cancelled = false

        supabase
            .from('saved_properties')
            .select(`saved_at, add_business(*, ${PROPERTY_PHOTO_EMBED})`)
            .eq('user_auth_id', user.id)
            .order('saved_at', { ascending: false })
            .then(({ data, error }) => {
                if (cancelled) return
                if (error) console.error('Profile: could not load saved properties', error)
                // Skip any row whose listing didn't come back instead of
                // rendering an empty card.
                setSavedProperties(
                    (data || [])
                        .map((row) => row.add_business)
                        .filter(Boolean)
                        .map(withCoverPhoto)
                )
                setLoadingSaved(false)
            })

        return () => {
            cancelled = true
        }
    }, [isOwner, user.id])

    const handleRemoveSaved = async (propertyId) => {
        if (removingId) return
        setRemovingId(propertyId)

        const { error } = await supabase
            .from('saved_properties')
            .delete()
            .eq('user_auth_id', user.id)
            .eq('property_id', propertyId)

        setRemovingId(null)
        if (!error) setSavedProperties((prev) => prev.filter((p) => p.property_id !== propertyId))
    }

    // Profile views, searches, and messages stay at 0 since those aren't real
    // features yet (no supporting tables). Wire these up once those systems exist.
    const stats = isOwner
        ? [
              { icon: 'bi-buildings', label: 'Listings', value: ownProperties.length },
              { icon: 'bi-file-earmark-text', label: 'Contracts', value: contractsCount },
              { icon: 'bi-eye', label: 'Profile views', value: 0 },
              { icon: 'bi-chat-dots', label: 'Messages', value: 0 },
          ]
        : [
              { icon: 'bi-heart', label: 'Saved', value: savedProperties.length },
              { icon: 'bi-file-earmark-text', label: 'Contracts', value: contractsCount },
              { icon: 'bi-search', label: 'Searches', value: 0 },
              { icon: 'bi-chat-dots', label: 'Messages', value: 0 },
          ]

    const listSource = isOwner ? ownProperties : savedProperties
    const listLoading = isOwner ? loadingProperties : loadingSaved
    const visibleSource = !isOwner && showAll ? listSource : listSource.slice(0, PREVIEW_COUNT)
    const previewItems = visibleSource.map((p) => ({
        key: p.property_id,
        property: p,
        image: p.photo_url,
        title: p.property_name,
        subtitle: isOwner
            ? p.property_type
            : [p.municipality, p.department].filter(Boolean).join(', ') || p.property_type,
        price: p.monthly_rent,
        unavailable: !isOwner && p.availability && p.availability !== 'Available' ? p.availability : null,
    }))

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Profile</h1>
                    <p>Your account and saved activity in one place.</p>
                </div>
            </div>

            <div className="ns-profile-grid">
                <aside className="ns-profile-side">
                    <div className="ns-profile-banner" />
                    <div className="ns-profile-side-body">
                        <span className="ns-profile-avatar-lg">{initials}</span>
                        <h2>{fullName}</h2>
                        <span className="ns-profile-badge">
                            <i className="bi bi-patch-check-fill"></i> {ACCOUNT_TYPE_LABEL[accountType]}
                        </span>

                        <div className="ns-profile-fields">
                            <div className="ns-profile-field-box">
                                <span className="ns-profile-field-label">Contact email</span>
                                <div className="ns-profile-field-value">{user.email}</div>
                            </div>
                            <div className="ns-profile-field-box">
                                <span className="ns-profile-field-label">Phone</span>
                                <div className="ns-profile-field-value">{meta.phone || '—'}</div>
                            </div>
                            <div className="ns-profile-field-box">
                                <span className="ns-profile-field-label">DUI</span>
                                <div className="ns-profile-field-value">{meta.dui || '—'}</div>
                            </div>
                        </div>

                        <button type="button" className="ns-outline-btn ns-profile-edit-btn" onClick={() => setShowEditModal(true)}>
                            <i className="bi bi-pencil"></i> Edit profile
                        </button>
                    </div>
                </aside>

                <div className="ns-profile-main">
                    <div className="ns-profile-stats-row">
                        {stats.map((stat) => (
                            <div className="ns-profile-stat-card" key={stat.label}>
                                <span className="ns-profile-stat-icon">
                                    <i className={`bi ${stat.icon}`}></i>
                                </span>
                                <span className="ns-profile-stat-label">{stat.label}</span>
                                <span className="ns-profile-stat-value">{stat.value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="ns-profile-section">
                        <div className="ns-profile-section-head">
                            <h3>{isOwner ? 'My listings' : 'Saved properties'}</h3>
                            {isOwner ? (
                                <button type="button" className="ns-link-btn" onClick={() => onNavigate('home')}>
                                    View all
                                </button>
                            ) : (
                                savedProperties.length > PREVIEW_COUNT && (
                                    <button type="button" className="ns-link-btn" onClick={() => setShowAll((v) => !v)}>
                                        {showAll ? 'Show less' : `View all (${savedProperties.length})`}
                                    </button>
                                )
                            )}
                        </div>

                        {listLoading ? (
                            <p className="ns-profile-empty-hint">
                                {isOwner ? 'Loading your listings...' : 'Loading your saved properties...'}
                            </p>
                        ) : previewItems.length === 0 ? (
                            <p className="ns-profile-empty-hint">
                                {isOwner
                                    ? "You haven't published any spaces yet."
                                    : "You haven't saved any properties yet. Tap Save on a space in the Marketplace to keep it here."}
                            </p>
                        ) : (
                            <div className="ns-profile-mini-list">
                                {previewItems.map((item) => (
                                    <div
                                        className={`ns-profile-mini-card ${onViewProperty ? 'clickable' : ''}`}
                                        key={item.key}
                                        role={onViewProperty ? 'button' : undefined}
                                        tabIndex={onViewProperty ? 0 : undefined}
                                        onClick={onViewProperty ? () => onViewProperty(item.property) : undefined}
                                        onKeyDown={
                                            onViewProperty
                                                ? (e) => {
                                                      if (e.key === 'Enter') onViewProperty(item.property)
                                                  }
                                                : undefined
                                        }
                                    >
                                        <div className="ns-profile-mini-img">
                                            {item.image ? (
                                                <img src={item.image} alt={item.title} />
                                            ) : (
                                                <i className="bi bi-image"></i>
                                            )}
                                        </div>
                                        <div className="ns-profile-mini-info">
                                            <span className="ns-profile-mini-title">{item.title}</span>
                                            <span className="ns-profile-mini-location">
                                                {item.subtitle}
                                                {item.unavailable && (
                                                    <span className="ns-profile-mini-unavailable"> · {item.unavailable}</span>
                                                )}
                                            </span>
                                            <span className="ns-profile-mini-price">
                                                {item.price != null ? (
                                                    <>${Number(item.price).toLocaleString()}<small>/month</small></>
                                                ) : (
                                                    'Contact for price'
                                                )}
                                            </span>
                                        </div>
                                        {!isOwner && (
                                            <button
                                                type="button"
                                                className="ns-profile-mini-remove"
                                                title="Remove from saved"
                                                aria-label={`Remove ${item.title} from saved`}
                                                disabled={removingId === item.key}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleRemoveSaved(item.key)
                                                }}
                                            >
                                                <i className="bi bi-trash"></i>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="ns-profile-section">
                        <div className="ns-profile-section-head">
                            <h3>Account settings</h3>
                        </div>

                        <div className="list-group list-group-flush">
                            <button
                                type="button"
                                className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3"
                                onClick={() => setShowChangePasswordModal(true)}
                            >
                                <i className="bi bi-key fs-5" style={{ width: 22 }}></i>
                                <span className="flex-grow-1 d-flex flex-column lh-sm text-start">
                                    <span className="fw-semibold">Change password</span>
                                    <span className="text-muted small">Update your access key for security</span>
                                </span>
                                <i className="bi bi-chevron-right text-muted small"></i>
                            </button>

                            <button
                                type="button"
                                className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3"
                                onClick={() => onNavigate('notifications')}
                            >
                                <i className="bi bi-bell fs-5" style={{ width: 22 }}></i>
                                <span className="flex-grow-1 d-flex flex-column lh-sm text-start">
                                    <span className="fw-semibold">Notifications</span>
                                    <span className="text-muted small">See your contract and payment updates</span>
                                </span>
                                <i className="bi bi-chevron-right text-muted small"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showEditModal && (
                <EditProfileModal
                    user={user}
                    onClose={() => setShowEditModal(false)}
                    onUpdated={onUserUpdated}
                />
            )}

            {showChangePasswordModal && (
                <ChangePasswordModal onClose={() => setShowChangePasswordModal(false)} />
            )}
        </>
    )
}