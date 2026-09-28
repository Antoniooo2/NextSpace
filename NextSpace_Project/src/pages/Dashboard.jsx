import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import DashboardLayout from '../components/dashboard/DashboardLayout'
import BusinessHome from '../components/dashboard/BusinessHome'
import OwnerHome from '../components/dashboard/OwnerHome'
import ProfileView from '../components/dashboard/ProfileView'
import AdvisorRouter from '../components/dashboard/advisor/AdvisorRouter'
import RonyDrawer from '../components/dashboard/advisor/RonyDrawer'
import PropertyDetailPage from '../components/dashboard/PropertyDetailPage'
import '../components/dashboard/dashboard.css'
import BusinessPayments from '../components/dashboard/BusinessPayments'
import OwnerPayments from '../components/dashboard/OwnerPayments'
import OwnerContracts from '../components/dashboard/OwnerContracts'
import BusinessContracts from '../components/dashboard/BusinessContracts'
import Notifications from '../components/dashboard/Notifications'

const BACK_LABEL = {
    home: 'Back to listings',
    profile: 'Back to profile',
    advisor: 'Back to Rony',
}

export default function Dashboard() {
    const navigate = useNavigate()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [section, setSection] = useState(
        () => new URLSearchParams(window.location.search).get('section') || 'home'
    )
    const [search, setSearch] = useState('')
    const [viewingProperty, setViewingProperty] = useState(null)
    const [viewingFrom, setViewingFrom] = useState('home')
    const [unreadCount, setUnreadCount] = useState(0)
    const [advisorSeed, setAdvisorSeed] = useState(null)
    // Lease to open on the Payments screen, e.g. when arriving from a
    // "rent reminder" notification about a specific contract.
    const [paymentsContractId, setPaymentsContractId] = useState(null)
    // Rony as a side panel over the Payments screen (same conversation as the
    // AI Advisor page), so asking about rent doesn't navigate away.
    const [ronyPanel, setRonyPanel] = useState({ open: false, seed: null })

    const loadUnreadCount = useCallback(async () => {
        const { count } = await supabase
            .from('notifications')
            .select('notification_id', { count: 'exact', head: true })
            .eq('read', false)
        setUnreadCount(count || 0)
    }, [])

    const loadUser = useCallback(async () => {
        const { data, error } = await supabase.auth.getUser()
        if (error || !data?.user) {
            navigate('/')
            return
        }
        setUser(data.user)
        setLoading(false)
    }, [navigate])

    useEffect(() => {
        loadUser()
    }, [loadUser])

    useEffect(() => {
        if (user) loadUnreadCount()
    }, [user, section, loadUnreadCount])

    // Live notifications: Realtime only delivers rows this user may read
    // (RLS), so any insert/update here is theirs. Refresh the count and let
    // the open screens reload quietly.
    const [liveTick, setLiveTick] = useState(0)
    useEffect(() => {
        if (!user) return undefined
        const channel = supabase
            .channel(`notifications-${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
                loadUnreadCount()
                setLiveTick((t) => t + 1)
            })
            .subscribe()
        return () => {
            supabase.removeChannel(channel)
        }
    }, [user, loadUnreadCount])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        navigate('/')
    }

    const handleSectionChange = (nextSection, options = {}) => {
        setViewingProperty(null)
        setRonyPanel({ open: false, seed: null })
        setPaymentsContractId(options.contractId ?? null)
        setSection(nextSection)
        // A "new space for your search" notification opens that space.
        if (options.propertyId) {
            setViewingFrom('home')
            setViewingProperty({ property_id: options.propertyId })
        }
    }

    // Remembers where the property was opened from, so the detail page's back
    // button says where it actually goes (the listings vs. Rony's chat).
    const openProperty = (from) => (property) => {
        setViewingFrom(from)
        setViewingProperty(property)
    }

    const openPaymentsFor = (contractId) => handleSectionChange('payments', { contractId })

    const openRonyPanel = (seed) => setRonyPanel({ open: true, seed: seed || null })

    const handleAskRony = (seed) => {
        setViewingProperty(null)
        setAdvisorSeed(seed)
        setSection('advisor')
    }

    if (loading || !user) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading your space...</p>
            </div>
        )
    }

    const meta = user.user_metadata || {}
    const accountType = meta.account_type === 'property-owner' ? 'property-owner' : 'business'
    const firstName = meta.first_name || user.email?.split('@')[0] || 'there'
    const lastName = meta.last_name || ''

    const renderContent = () => {
        if (viewingProperty) {
            return (
                <PropertyDetailPage
                    property={viewingProperty}
                    user={user}
                    accountType={accountType}
                    onBack={() => setViewingProperty(null)}
                    backLabel={BACK_LABEL[viewingFrom] || 'Back'}
                    onAskRony={handleAskRony}
                    onViewProperty={setViewingProperty}
                    onNavigate={handleSectionChange}
                />
            )
        }

        switch (section) {
            case 'profile':
                return (
                    <ProfileView
                        user={user}
                        accountType={accountType}
                        onNavigate={handleSectionChange}
                        onUserUpdated={loadUser}
                        onViewProperty={accountType === 'property-owner' ? undefined : openProperty('profile')}
                    />
                )
            case 'contracts':
                return accountType === 'property-owner' ? (
                    <OwnerContracts
                        user={user}
                        onAskRony={openRonyPanel}
                        onOpenPayments={openPaymentsFor}
                        initialContractId={paymentsContractId}
                    />
                ) : (
                    <BusinessContracts
                        user={user}
                        onAskRony={openRonyPanel}
                        onOpenPayments={openPaymentsFor}
                        initialContractId={paymentsContractId}
                    />
                )
            case 'payments':
                return accountType === 'property-owner' ? (
                    <OwnerPayments
                        user={user}
                        onAskRony={openRonyPanel}
                        onOpenContract={(contractId) => handleSectionChange('contracts', { contractId })}
                        initialContractId={paymentsContractId}
                    />
                ) : (
                    <BusinessPayments
                        user={user}
                        onNavigate={handleSectionChange}
                        onAskRony={openRonyPanel}
                        initialContractId={paymentsContractId}
                    />
                )
            case 'notifications':
                return (
                    <Notifications
                        liveTick={liveTick}
                        onNavigate={handleSectionChange}
                        onUnreadCountChange={(next) =>
                            setUnreadCount((prev) => (typeof next === 'function' ? next(prev) : next))
                        }
                    />
                )
            case 'advisor':
                return (
                    <AdvisorRouter
                        accountType={accountType}
                        onViewProperty={openProperty('advisor')}
                        onNavigate={handleSectionChange}
                        seed={advisorSeed}
                        onSeedConsumed={() => setAdvisorSeed(null)}
                    />
                )
            default:
                return accountType === 'property-owner' ? (
                    <OwnerHome
                        user={user}
                        firstName={firstName}
                        search={search}
                        onViewProperty={openProperty('home')}
                        onNavigate={handleSectionChange}
                        onAskRony={handleAskRony}
                    />
                ) : (
                    <BusinessHome
                        user={user}
                        search={search}
                        onSearchChange={setSearch}
                        onViewProperty={openProperty('home')}
                        onAskRony={handleAskRony}
                        onNavigate={handleSectionChange}
                    />
                )
        }
    }

    return (
        <DashboardLayout
            firstName={firstName}
            lastName={lastName}
            accountType={accountType}
            section={section}
            onSectionChange={handleSectionChange}
            onLogout={handleLogout}
            search={search}
            onSearchChange={setSearch}
            unreadCount={unreadCount}
            liveTick={liveTick}
            onNotificationsRead={(n) => setUnreadCount((prev) => Math.max(0, prev - n))}
        >
            {renderContent()}
            <RonyDrawer
                open={ronyPanel.open && (section === 'payments' || section === 'contracts') && !viewingProperty}
                accountType={accountType}
                seed={ronyPanel.seed}
                onSeedConsumed={() => setRonyPanel((prev) => ({ ...prev, seed: null }))}
                onClose={() => setRonyPanel({ open: false, seed: null })}
                onOpenFullChat={() => handleSectionChange('advisor')}
                onViewProperty={(property) => {
                    setRonyPanel({ open: false, seed: null })
                    openProperty('advisor')(property)
                }}
                onNavigate={handleSectionChange}
            />
        </DashboardLayout>
    )
}