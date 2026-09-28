import { useState } from 'react'
import logo from '../../assets/NextSpace_logo.png'
import ConfirmDialog from './ConfirmDialog'
import NotificationBell from './NotificationBell'

function navGroupsFor(accountType) {
    const isOwner = accountType === 'property-owner'
    return [
        {
            label: 'Main',
            items: [
                { id: 'home', icon: isOwner ? 'bi-buildings' : 'bi-grid-1x2', label: isOwner ? 'My Properties' : 'Marketplace' },
                { id: 'advisor', icon: 'bi-stars', label: 'AI Advisor' },
            ],
        },
        {
            label: 'Manage',
            items: [
                { id: 'contracts', icon: 'bi-file-earmark-text', label: 'Contracts' },
                { id: 'payments', icon: 'bi-credit-card', label: 'Payments' },
                { id: 'notifications', icon: 'bi-bell', label: 'Notifications' },
            ],
        },
        {
            label: 'Account',
            items: [{ id: 'profile', icon: 'bi-person', label: 'Profile' }],
        },
    ]
}

const ACCOUNT_TYPE_LABEL = {
    business: 'Business',
    'property-owner': 'Property Owner',
}

// What a red dot on Payments / Contracts means, per account type.
const ATTENTION_HINT = {
    business: { payments: 'You have rent overdue', contracts: 'A lease offer is waiting for you' },
    'property-owner': { payments: 'A tenant is late on rent', contracts: 'New lease requests to review' },
}

function greeting() {
    const hour = Number(
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/El_Salvador' }).format(new Date())
    )
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
}

function todayLabel() {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/El_Salvador',
    }).format(new Date())
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
    unreadCount = 0,
    attention = {},
    liveTick = 0,
    onNotificationsRead,
    children,
}) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
    const navGroups = navGroupsFor(accountType)
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'User'
    const initials = (firstName?.[0] || 'U') + (lastName?.[0] || '')
    const hints = ATTENTION_HINT[accountType] || ATTENTION_HINT.business

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
            <aside className={`ns-dash-sidebar ${mobileNavOpen ? 'open' : ''}`}>
                <div className="ns-dash-brand">
                    <button type="button" className="ns-dash-brand-btn" onClick={() => goTo('home')} aria-label="NextSpace home">
                        <img src={logo} alt="NextSpace" className="ns-dash-logo" />
                    </button>
                    <button
                        type="button"
                        className="ns-dash-sidebar-close"
                        onClick={() => setMobileNavOpen(false)}
                        aria-label="Close menu"
                    >
                        <i className="bi bi-x-lg"></i>
                    </button>
                </div>

                <nav className="ns-dash-nav">
                    {navGroups.map((group) => (
                        <div className="ns-dash-nav-group" key={group.label}>
                            <span className="ns-dash-nav-label">{group.label}</span>
                            {group.items.map((item) => {
                                const needsAttention = attention[item.id] && section !== item.id
                                return (
                                    <button
                                        type="button"
                                        key={item.id}
                                        className={`ns-dash-nav-item ${section === item.id ? 'active' : ''}`}
                                        onClick={() => goTo(item.id)}
                                        aria-current={section === item.id ? 'page' : undefined}
                                        title={needsAttention ? hints[item.id] : undefined}
                                    >
                                        <span className="ns-dash-nav-icon">
                                            <i className={`bi ${item.icon}`}></i>
                                            {needsAttention && <span className="ns-dash-nav-dot" aria-label={hints[item.id]} />}
                                        </span>
                                        <span className="ns-dash-nav-text">{item.label}</span>
                                        {item.id === 'notifications' && unreadCount > 0 && (
                                            <span className="ns-dash-nav-badge">{unreadCount}</span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </nav>

                <div className="ns-dash-user">
                    <button type="button" className="ns-dash-user-info" onClick={() => goTo('profile')}>
                        <span className="ns-dash-avatar">{initials.toUpperCase()}</span>
                        <span className="ns-dash-user-text">
                            <span className="ns-dash-user-name" title={fullName}>
                                {fullName}
                            </span>
                            <span className="ns-dash-user-type">{ACCOUNT_TYPE_LABEL[accountType]}</span>
                        </span>
                    </button>
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

            {mobileNavOpen && <div className="ns-dash-backdrop" onClick={() => setMobileNavOpen(false)} />}

            <div className="ns-dash-main">
                <header className="ns-dash-topbar">
                    <button
                        type="button"
                        className="ns-dash-mobile-toggle"
                        onClick={() => setMobileNavOpen(true)}
                        aria-label="Open menu"
                    >
                        <i className="bi bi-list"></i>
                        {(attention.payments || attention.contracts) && <span className="ns-dash-nav-dot" />}
                    </button>
                    <img src={logo} alt="NextSpace" className="ns-dash-mobile-logo" />

                    {/* The search filters the Marketplace / My Properties, so it
                        only shows there; other screens greet the user instead. */}
                    {section === 'home' ? (
                        <div className="ns-dash-search">
                            <i className="bi bi-search"></i>
                            <input
                                type="text"
                                placeholder={
                                    accountType === 'property-owner'
                                        ? 'Search your properties...'
                                        : 'Search spaces by name, type or location...'
                                }
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                            />
                        </div>
                    ) : (
                        <div className="ns-dash-greeting">
                            <strong>
                                {greeting()}, {firstName || 'there'}
                            </strong>
                            <span>{todayLabel()}</span>
                        </div>
                    )}
                    <div className="ns-dash-topbar-actions">
                        <NotificationBell
                            unreadCount={unreadCount}
                            liveTick={liveTick}
                            onRead={onNotificationsRead}
                            onNavigate={(id, options) => {
                                onSectionChange(id, options)
                                setMobileNavOpen(false)
                            }}
                        />
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
