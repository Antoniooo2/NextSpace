import { useState } from 'react'
import { DEMO_OWNER_ID, PROPERTIES } from '../../data/properties'
import EditProfileModal from './EditProfileModal'

const ACCOUNT_TYPE_LABEL = {
    business: 'Business',
    'property-owner': 'Property Owner',
}

export default function ProfileView({ user, accountType, onNavigate, onUserUpdated }) {
    const [showEditModal, setShowEditModal] = useState(false)

    const meta = user.user_metadata || {}
    const firstName = meta.first_name || ''
    const lastName = meta.last_name || ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'NextSpace User'
    const initials = ((firstName[0] || 'U') + (lastName[0] || '')).toUpperCase()

    const isOwner = accountType === 'property-owner'

    // Every stat is 0 for now since favorites, contracts, profile views, and
    // messages aren't real features yet. Wire these up to real counts once
    // those systems exist.
    const stats = isOwner
        ? [
              { icon: 'bi-buildings', label: 'Listings', value: 0 },
              { icon: 'bi-file-earmark-text', label: 'Contracts', value: 0 },
              { icon: 'bi-eye', label: 'Profile views', value: 0 },
              { icon: 'bi-chat-dots', label: 'Messages', value: 0 },
          ]
        : [
              { icon: 'bi-heart', label: 'Favorites', value: 0 },
              { icon: 'bi-file-earmark-text', label: 'Contracts', value: 0 },
              { icon: 'bi-search', label: 'Searches', value: 0 },
              { icon: 'bi-chat-dots', label: 'Messages', value: 0 },
          ]

    const previewProperties = isOwner
        ? PROPERTIES.filter((p) => p.ownerId === DEMO_OWNER_ID).slice(0, 2)
        : PROPERTIES.slice(0, 2)

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

                        {previewProperties.length === 0 ? (
                            <p className="ns-profile-empty-hint">
                                {isOwner ? "You haven't published any spaces yet." : "You haven't saved any properties yet."}
                            </p>
                        ) : (
                            <div className="ns-profile-mini-list">
                                {previewProperties.map((property) => (
                                    <div className="ns-profile-mini-card" key={property.id}>
                                        <div className="ns-profile-mini-img">
                                            {property.image ? (
                                                <img src={property.image} alt={property.title} />
                                            ) : (
                                                <i className="bi bi-image"></i>
                                            )}
                                        </div>
                                        <div className="ns-profile-mini-info">
                                            <span className="ns-profile-mini-title">{property.title}</span>
                                            <span className="ns-profile-mini-location">{property.city}</span>
                                            <span className="ns-profile-mini-price">
                                                ${property.price.toLocaleString()}<small>/month</small>
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
                </div>
            </div>

            {showEditModal && (
                <EditProfileModal
                    user={user}
                    onClose={() => setShowEditModal(false)}
                    onUpdated={onUserUpdated}
                />
            )}
        </>
    )
}