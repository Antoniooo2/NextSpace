import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from '../../lib/supabaseErrors'

const PROCESSES = ['All', 'Contracts', 'Payments']

const PROCESS_ICON = {
    Contracts: 'bi-file-earmark-text',
    Payments: 'bi-credit-card',
}

function formatTime(isoString) {
    const date = new Date(isoString)
    const now = new Date()
    const sameDay = date.toDateString() === now.toDateString()
    if (sameDay) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Notifications({ onNavigate, onUnreadCountChange }) {
    const [notifications, setNotifications] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [selectedProcess, setSelectedProcess] = useState('All')

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            setLoadError('')

            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })

            if (cancelled) return

            if (error) {
                setLoadError(describeSupabaseError(error))
                setLoading(false)
                return
            }

            setNotifications(data || [])
            setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [])

    const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

    const filtered = useMemo(
        () =>
            selectedProcess === 'All'
                ? notifications
                : notifications.filter((n) => n.process === selectedProcess),
        [notifications, selectedProcess]
    )

    const markAsRead = async (notification) => {
        if (notification.read) return

        setNotifications((prev) =>
            prev.map((n) => (n.notification_id === notification.notification_id ? { ...n, read: true } : n))
        )
        onUnreadCountChange?.((prev) => Math.max(0, prev - 1))

        await supabase
            .from('notifications')
            .update({ read: true })
            .eq('notification_id', notification.notification_id)
    }

    const markAllAsRead = async () => {
        const unreadIds = notifications.filter((n) => !n.read).map((n) => n.notification_id)
        if (unreadIds.length === 0) return

        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        onUnreadCountChange?.(0)

        await supabase.from('notifications').update({ read: true }).in('notification_id', unreadIds)
    }

    const handleOpen = (notification) => {
        markAsRead(notification)
        onNavigate?.(notification.process === 'Payments' ? 'payments' : 'contracts')
    }

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading notifications...</p>
            </div>
        )
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Notifications</h1>
                    <p>Updates on your contracts and payments.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button
                        type="button"
                        className="ns-link-btn"
                        onClick={markAllAsRead}
                        disabled={unreadCount === 0}
                    >
                        Mark all as read
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            {notifications.length > 0 && (
                <div className="ns-pill-row">
                    {PROCESSES.map((proc) => (
                        <button
                            type="button"
                            key={proc}
                            className={`ns-pill ${selectedProcess === proc ? 'active' : ''}`}
                            onClick={() => setSelectedProcess(proc)}
                        >
                            {proc}
                        </button>
                    ))}
                </div>
            )}

            {notifications.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-bell"></i>
                    <h3>You're all caught up</h3>
                    <p>New activity on your contracts and payments will show up here.</p>
                </div>
            ) : filtered.length === 0 ? (
                <p className="ns-pay-muted mb-4">No notifications match this filter.</p>
            ) : (
                <div className="ns-notif-list">
                    {filtered.map((notification) => (
                        <button
                            type="button"
                            key={notification.notification_id}
                            className={`ns-notif-row ${notification.read ? '' : 'unread'}`}
                            onClick={() => handleOpen(notification)}
                        >
                            <span className="ns-notif-icon">
                                <i className={`bi ${PROCESS_ICON[notification.process] || 'bi-bell'}`}></i>
                            </span>
                            <span className="ns-notif-body">
                                <span className="ns-notif-title-row">
                                    <span className="ns-notif-title">{notification.title}</span>
                                    <span className="ns-notif-time">{formatTime(notification.created_at)}</span>
                                </span>
                                {notification.description && (
                                    <span className="ns-notif-desc">{notification.description}</span>
                                )}
                            </span>
                            {!notification.read && <span className="ns-notif-dot" aria-hidden="true" />}
                        </button>
                    ))}
                </div>
            )}
        </>
    )
}
