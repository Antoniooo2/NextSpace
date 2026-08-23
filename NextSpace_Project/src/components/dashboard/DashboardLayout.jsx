import { useState } from 'react'
import logo from '../../assets/logo_ns_right.png'
import ConfirmDialog from './ConfirmDialog'

function navItemsFor(accountType) {
    return [
        {
            id: 'home',
            icon: 'bi-grid-1x2-fill',
            label: accountType === 'property-owner' ? 'My Properties' : 'Marketplace',
        },
        { id: 'advisor', icon: 'bi-stars', label: 'AI Advisor' },
        { id: 'contracts', icon: 'bi-file-earmark-text', label: 'Contracts' },
        { id: 'payments', icon: 'bi-credit-card', label: 'Payments' },
        { id: 'notifications', icon: 'bi-bell', label: 'Notifications' },
        { id: 'profile', icon: 'bi-person', label: 'Profile' },
    ]
}

const ACCOUNT_TYPE_LABEL = {
    business: 'Business',
    'property-owner': 'Property Owner',
}

export default function DashboardLayout({
    firstName,
    lastName,
    accountType,
    section,
    onSectionChange,
    onLogout,
    search,
    onSearchChange,
    children,
}) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
    const navItems = navItemsFor(accountType)
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'User'
    const initials = (firstName?.[0] || 'U') + (lastName?.[0] || '')

    const goTo = (id) => {
        onSectionChange(id)
        setMobileNavOpen(false)
    }

    const confirmLogout = () => {
        setShowLogoutConfirm(false)
        onLogout()
    }

    return (
        <div className="ns-dash">
            <button
                type="button"
                className="ns-dash-mobile-toggle"
                onClick={() => setMobileNavOpen((v) => !v)}
                aria-label="Toggle menu"
            >
                <i className={`bi ${mobileNavOpen ? 'bi-x-lg' : 'bi-list'}`}></i>
            </button>

            <aside className={`ns-dash-sidebar ${mobileNavOpen ? 'open' : ''}`}>
                <div className="ns-dash-brand">
                    <img src={logo} alt="NextSpace" className="ns-dash-logo" />
                </div>

                <nav className="ns-dash-nav">
                    {navItems.map((item) => (
                        <button
                            type="button"
                            key={item.id}
                            className={`ns-dash-nav-item ${section === item.id ? 'active' : ''}`}
                            onClick={() => goTo(item.id)}
                        >
                            <i className={`bi ${item.icon}`}></i>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="ns-dash-user">
                    <div className="ns-dash-user-info" onClick={() => goTo('profile')} role="button" tabIndex={0}>
                        <span className="ns-dash-avatar">{initials.toUpperCase()}</span>
                        <div className="ns-dash-user-text">
                            <span className="ns-dash-user-name">{fullName}</span>
                            <span className="ns-dash-user-type">{ACCOUNT_TYPE_LABEL[accountType]}</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="ns-dash-logout"
                        onClick={() => setShowLogoutConfirm(true)}
                        aria-label="Log out"
                        title="Log out"
                    >
                        <i className="bi bi-box-arrow-right"></i>
                    </button>
                </div>
            </aside>

            {mobileNavOpen && (
                <div className="ns-dash-backdrop" onClick={() => setMobileNavOpen(false)} />
            )}

            <div className="ns-dash-main">
                <header className="ns-dash-topbar">
                    <div className="ns-dash-search">
                        <i className="bi bi-search"></i>
                        <input
                            type="text"
                            placeholder="Search properties, locations, or clients..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                    </div>
                    <div className="ns-dash-topbar-actions">
                        <button type="button" className="ns-dash-icon-btn" aria-label="Notifications" onClick={() => goTo('notifications')}>
                            <i className="bi bi-bell"></i>
                        </button>
                    </div>
                </header>

                <main className="ns-dash-content">{children}</main>
            </div>

            {showLogoutConfirm && (
                <ConfirmDialog
                    icon="bi-box-arrow-right"
                    title="Log out of NextSpace?"
                    description="You'll need to sign in again to access your dashboard."
                    confirmLabel="Log out"
                    cancelLabel="Cancel"
                    onConfirm={confirmLogout}
                    onCancel={() => setShowLogoutConfirm(false)}
                />
            )}
        </div>
    )
}