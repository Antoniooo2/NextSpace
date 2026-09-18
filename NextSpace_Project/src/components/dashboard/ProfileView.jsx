import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { PROPERTIES } from '../../data/properties'
import { useOwnerProperties } from '../../hooks/useOwnerProperties'
import EditProfileModal from './EditProfileModal'
import ChangePasswordModal from './ChangePasswordModal'

const ACCOUNT_TYPE_LABEL = {
    business: 'Business',
    'property-owner': 'Property Owner',
}

export default function ProfileView({ user, accountType, onNavigate, onUserUpdated }) {
    const [showEditModal, setShowEditModal] = useState(false)
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
    const [contractsCount, setContractsCount] = useState(0)

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

    // Profile views, favorites, and searches stay at 0 since those aren't real
    // features yet (no supporting tables). Wire these up once those systems exist.
    const stats = isOwner
        ? [
              { icon: 'bi-buildings', label: 'Listings', value: ownProperties.length },
              { icon: 'bi-file-earmark-text', label: 'Contracts', value: contractsCount },
              { icon: 'bi-eye', label: 'Profile views', value: 0 },
              { icon: 'bi-chat-dots', label: 'Messages', value: 0 },
          ]
        : [
              { icon: 'bi-heart', label: 'Favorites', value: 0 },
              { icon: 'bi-file-earmark-text', label: 'Contracts', value: contractsCount },
              { icon: 'bi-search', label: 'Searches', value: 0 },
              { icon: 'bi-chat-dots', label: 'Messages', value: 0 },
          ]

    const previewItems = isOwner
        ? ownProperties.slice(0, 2).map((p) => ({
              key: p.property_id,
              image: p.photo_url,
              title: p.property_name,
              subtitle: p.property_type,
              price: p.monthly_rent,
          }))
        : PROPERTIES.slice(0, 2).map((p) => ({
              key: p.id,
              image: p.image,
              title: p.title,
              subtitle: p.city,
              price: p.price,
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
                            <button type="button" className="ns-link-btn" onClick={() => onNavigate('home')}>
                                View all
                            </button>
                        </div>

                        {isOwner && loadingProperties ? (
                            <p className="ns-profile-empty-hint">Loading your listings...</p>
                        ) : previewItems.length === 0 ? (
                            <p className="ns-profile-empty-hint">
                                {isOwner ? "You haven't published any spaces yet." : "You haven't saved any properties yet."}
                            </p>
                        ) : (
                            <div className="ns-profile-mini-list">
                                {previewItems.map((item) => (
                                    <div className="ns-profile-mini-card" key={item.key}>
                                        <div className="ns-profile-mini-img">
                                            {item.image ? (
                                                <img src={item.image} alt={item.title} />
                                            ) : (
                                                <i className="bi bi-image"></i>
                                            )}
                                        </div>
                                        <div className="ns-profile-mini-info">
                                            <span className="ns-profile-mini-title">{item.title}</span>
                                            <span className="ns-profile-mini-location">{item.subtitle}</span>
                                            <span className="ns-profile-mini-price">
                                                {item.price != null ? (
                                                    <>${Number(item.price).toLocaleString()}<small>/month</small></>
                                                ) : (
                                                    'Contact for price'
                                                )}
                                            </span>
                                        </div>
                                        <span className="ns-profile-mini-remove" title="Remove">
                                            <i className="bi bi-trash"></i>
                                        </span>
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
                                    <span className="text-muted small">Manage email and push alerts</span>
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