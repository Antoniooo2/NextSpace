import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import DashboardLayout from '../components/dashboard/DashboardLayout'
import BusinessHome from '../components/dashboard/BusinessHome'
import OwnerHome from '../components/dashboard/OwnerHome'
import ProfileView from '../components/dashboard/ProfileView'
import ComingSoon from '../components/dashboard/ComingSoon'
import PropertyDetailPage from '../components/dashboard/PropertyDetailPage'
import '../components/dashboard/dashboard.css'
import BusinessPayments from '../components/dashboard/BusinessPayments'
import OwnerPayments from '../components/dashboard/OwnerPayments'

export default function Dashboard() {
    const navigate = useNavigate()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [section, setSection] = useState('home')
    const [search, setSearch] = useState('')
    const [viewingProperty, setViewingProperty] = useState(null)

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
            return <PropertyDetailPage property={viewingProperty} onBack={() => setViewingProperty(null)} />
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
                return (
                    <ComingSoon
                        icon="bi-file-earmark-text"
                        title="Contracts"
                        description="Digital contracts and e-signatures are coming soon. You'll be able to draft, send, and sign lease agreements right here."
                    />
                )
            case 'payments':
                return accountType === 'property-owner' ? (
                    <OwnerPayments />
                ) : (
                    <BusinessPayments onNavigate={handleSectionChange} />
                )
            case 'notifications':
                return (
                    <ComingSoon
                        icon="bi-bell"
                        title="Notifications"
                        description="You're all caught up. New activity on your account will show up here."
                    />
                )
            case 'advisor':
                return (
                    <ComingSoon
                        icon="bi-stars"
                        title="AI Advisor"
                        description="Your personal AI advisor is warming up. Soon it'll help you find the right space, or the right tenant, automatically."
                    />
                )
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
        >
            {renderContent()}
        </DashboardLayout>
    )
}