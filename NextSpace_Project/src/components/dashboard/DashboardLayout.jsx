import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '../../i18n'
import { BRAND_NAME, BRAND_VALUES } from '../../lib/brand'
import { DOT } from '../../lib/symbols'
import LanguageSwitcher from '../LanguageSwitcher.jsx'
import AccessibilityMenu from '../AccessibilityMenu.jsx'
import mark from '../../assets/favicon_ns.png'
import logo from '../../assets/NextSpace_logo.png'
import ConfirmDialog from './ConfirmDialog'
import NotificationBell from './NotificationBell'

function navGroupsFor(accountType) {
    const isOwner = accountType === 'property-owner'
    return [
        {
            label: 'main',
            items: [
                { id: 'home', icon: isOwner ? 'bi-buildings' : 'bi-grid-1x2', label: isOwner ? 'myProperties' : 'marketplace' },
                { id: 'advisor', icon: 'bi-stars', label: 'advisor' },
            ],
        },
        {
            label: 'manage',
            items: [
                { id: 'contracts', icon: 'bi-file-earmark-text', label: 'contracts' },
                { id: 'payments', icon: 'bi-credit-card', label: 'payments' },
                { id: 'messages', icon: 'bi-chat-dots', label: 'messages' },
                { id: 'notifications', icon: 'bi-bell', label: 'notifications' },
            ],
        },
        {
            label: 'account',
            items: [{ id: 'profile', icon: 'bi-person', label: 'profile' }],
        },
    ]
}

const ACCOUNT_TYPE_LABEL = {
    business: 'dashboard.accountType.business',
    'property-owner': 'dashboard.accountType.owner',
}

// What a red dot on Payments / Contracts means, per account type.
const ATTENTION_HINT = {
    business: { payments: 'dashboard.attention.business.payments', contracts: 'dashboard.attention.business.contracts' },
    'property-owner': { payments: 'dashboard.attention.owner.payments', contracts: 'dashboard.attention.owner.contracts' },
}

function greeting() {
    const hour = Number(
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/El_Salvador' }).format(new Date())
    )
    if (hour < 12) return 'dashboard.greeting.morning'
    if (hour < 18) return 'dashboard.greeting.afternoon'
    return 'dashboard.greeting.evening'
}

function todayLabel() {
    return new Intl.DateTimeFormat(currentLocale(), {
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
    unreadMessages = 0,
    attention = {},
    liveTick = 0,
    onNotificationsRead,
    children,
}) {
    const { t } = useTranslation()
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
    // Desktop only: the menu can shrink to an icon rail to give the page
    // more room. Remembered on this browser.
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem('ns-sidebar-collapsed') === '1'
        } catch {
            return false
        }
    })
    const toggleCollapsed = () => {
        setCollapsed((v) => {
            try {
                localStorage.setItem('ns-sidebar-collapsed', v ? '0' : '1')
            } catch {
                // Storage can be blocked; the toggle still works for this visit.
            }
            return !v
        })
    }
    const navGroups = navGroupsFor(accountType)
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || t('dashboard.user')
    const initials = (firstName?.[0] || 'U') + (lastName?.[0] || '')
    const hintKeys = ATTENTION_HINT[accountType] || ATTENTION_HINT.business
    const hints = { payments: t(hintKeys.payments), contracts: t(hintKeys.contracts) }
    const badges = {
        notifications: { count: unreadCount },
        messages: { count: unreadMessages, label: t('dashboard.unreadMessages', { count: unreadMessages }) },
    }

    const goTo = (id) => {
        onSectionChange(id)
        setMobileNavOpen(false)
    }

    const confirmLogout = () => {
        setShowLogoutConfirm(false)
        onLogout()
    }

    return (
        <div className={`ns-dash ${collapsed ? 'is-collapsed' : ''}`}>
            <aside className={`ns-dash-sidebar ${mobileNavOpen ? 'open' : ''}`}>
                <div className="ns-dash-brand">
                    <button type="button" className="ns-dash-brand-btn" onClick={() => goTo('home')} aria-label={t('dashboard.brandHome', BRAND_VALUES)}>
                        <img src={logo} alt={BRAND_NAME} className="ns-dash-logo" />
                        <img src={mark} alt={BRAND_NAME} className="ns-dash-mark" />
                    </button>
                    <button
                        type="button"
                        className="ns-dash-sidebar-close"
                        onClick={() => setMobileNavOpen(false)}
                        aria-label={t('dashboard.closeMenu')}
                    >
                        <i className="bi bi-x-lg"></i>
                    </button>
                </div>

                <nav className="ns-dash-nav">
                    {navGroups.map((group) => (
                        <div className="ns-dash-nav-group" key={group.label}>
                            <span className="ns-dash-nav-label">{t(`dashboard.navGroups.${group.label}`)}</span>
                            {group.items.map((navItem) => {
                                const item = { ...navItem, label: t(`dashboard.nav.${navItem.label}`) }
                                const needsAttention = attention[item.id] && section !== item.id
                                return (
                                    <button
                                        type="button"
                                        key={item.id}
                                        className={`ns-dash-nav-item ${section === item.id ? 'active' : ''}`}
                                        onClick={() => goTo(item.id)}
                                        aria-current={section === item.id ? 'page' : undefined}
                                        title={needsAttention ? `${item.label} ${DOT} ${hints[item.id]}` : collapsed ? item.label : undefined}
                                    >
                                        <span className="ns-dash-nav-icon">
                                            <i className={`bi ${item.icon}`}></i>
                                            {needsAttention && <span className="ns-dash-nav-dot" aria-label={hints[item.id]} />}
                                        </span>
                                        <span className="ns-dash-nav-text">{item.label}</span>
                                        {badges[item.id]?.count > 0 && (
                                            <span className="ns-dash-nav-badge" aria-label={badges[item.id].label}>
                                                {badges[item.id].count}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </nav>

                <div className="ns-dash-user">
                    <button type="button" className="ns-dash-user-info" onClick={() => goTo('profile')} title={collapsed ? fullName : undefined}>
                        <span className="ns-dash-avatar">{initials.toUpperCase()}</span>
                        <span className="ns-dash-user-text">
                            <span className="ns-dash-user-name" title={fullName}>
                                {fullName}
                            </span>
                            <span className="ns-dash-user-type">{ACCOUNT_TYPE_LABEL[accountType] ? t(ACCOUNT_TYPE_LABEL[accountType]) : ''}</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        className="ns-dash-logout"
                        onClick={() => setShowLogoutConfirm(true)}
                        aria-label={t('dashboard.logout')}
                        title={t('dashboard.logout')}
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
                        className="ns-dash-collapse"
                        onClick={toggleCollapsed}
                        aria-label={collapsed ? t('dashboard.showMenu') : t('dashboard.hideMenu')}
                        title={collapsed ? t('dashboard.showMenu') : t('dashboard.hideMenuTitle')}
                    >
                        <i className={`bi ${collapsed ? 'bi-layout-sidebar' : 'bi-layout-sidebar-inset'}`}></i>
                    </button>
                    <button
                        type="button"
                        className="ns-dash-mobile-toggle"
                        onClick={() => setMobileNavOpen(true)}
                        aria-label={t('dashboard.openMenu')}
                    >
                        <i className="bi bi-list"></i>
                        {(attention.payments || attention.contracts || unreadMessages > 0) && <span className="ns-dash-nav-dot" />}
                    </button>
                    <img src={logo} alt={BRAND_NAME} className="ns-dash-mobile-logo" />

                    {/* The search filters the Marketplace / My Properties, so it
                        only shows there; other screens greet the user instead. */}
                    {section === 'home' ? (
                        <div className="ns-dash-search">
                            <i className="bi bi-search"></i>
                            <input
                                type="text"
                                placeholder={
                                    accountType === 'property-owner'
                                        ? t('dashboard.search.owner')
                                        : t('dashboard.search.business')
                                }
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                            />
                        </div>
                    ) : (
                        <div className="ns-dash-greeting">
                            <strong>
                                {t(greeting())}, {firstName || t('dashboard.there')}
                            </strong>
                            <span>{todayLabel()}</span>
                        </div>
                    )}
                    <div className="ns-dash-topbar-actions">
                        <LanguageSwitcher />
                        <AccessibilityMenu />
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
                    title={t('dashboard.logoutConfirm.title', BRAND_VALUES)}
                    description={t('dashboard.logoutConfirm.description')}
                    confirmLabel={t('dashboard.logout')}
                    cancelLabel={t('common.cancel')}
                    onConfirm={confirmLogout}
                    onCancel={() => setShowLogoutConfirm(false)}
                />
            )}
        </div>
    )
}
