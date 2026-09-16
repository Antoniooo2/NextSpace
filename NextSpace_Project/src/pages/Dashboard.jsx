import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import DashboardLayout from '../components/dashboard/DashboardLayout'
import BusinessHome from '../components/dashboard/BusinessHome'
import OwnerHome from '../components/dashboard/OwnerHome'
import ProfileView from '../components/dashboard/ProfileView'
import AdvisorRouter from '../components/dashboard/advisor/AdvisorRouter'
import PropertyDetailPage from '../components/dashboard/PropertyDetailPage'
import '../components/dashboard/dashboard.css'
import BusinessPayments from '../components/dashboard/BusinessPayments'
import OwnerPayments from '../components/dashboard/OwnerPayments'
import OwnerContracts from '../components/dashboard/OwnerContracts'
import BusinessContracts from '../components/dashboard/BusinessContracts'
import Notifications from '../components/dashboard/Notifications'

export default function Dashboard() {
    const navigate = useNavigate()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [section, setSection] = useState(
        () => new URLSearchParams(window.location.search).get('section') || 'home'
    )
    const [search, setSearch] = useState('')
    const [viewingProperty, setViewingProperty] = useState(null)
    const [unreadCount, setUnreadCount] = useState(0)

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

    const handleLogout = async () => {
        await supabase.auth.signOut()
        navigate('/')
    }

    const handleSectionChange = (nextSection) => {
        setViewingProperty(null)
        setSection(nextSection)
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
                    />
                )
            case 'contracts':
                return accountType === 'property-owner' ? (
                    <OwnerContracts user={user} />
                ) : (
                    <BusinessContracts user={user} />
                )
            case 'payments':
                return accountType === 'property-owner' ? (
                    <OwnerPayments />
                ) : (
                    <BusinessPayments user={user} onNavigate={handleSectionChange} />
                )
            case 'notifications':
                return (
                    <Notifications
                        onNavigate={handleSectionChange}
                        onUnreadCountChange={(next) =>
                            setUnreadCount((prev) => (typeof next === 'function' ? next(prev) : next))
                        }
                    />
                )
            case 'advisor':
                return <AdvisorRouter accountType={accountType} onViewProperty={setViewingProperty} />
            default:
                return accountType === 'property-owner' ? (
                    <OwnerHome user={user} firstName={firstName} search={search} onViewProperty={setViewingProperty} />
                ) : (
                    <BusinessHome user={user} firstName={firstName} search={search} onViewProperty={setViewingProperty} />
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
        >
            {renderContent()}
        </DashboardLayout>
    )
}