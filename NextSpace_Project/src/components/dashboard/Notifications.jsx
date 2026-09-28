import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import {
    dayGroup,
    loadNotificationContext,
    markNotificationsRead,
    notificationAction,
    notificationKind,
    notificationTarget,
    timeLabel,
} from '../../lib/notificationKinds'
import './notifications.css'

const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'action', label: 'Needs action' },
    { id: 'Contracts', label: 'Contracts' },
    { id: 'Payments', label: 'Payments' },
    { id: 'Marketplace', label: 'Space alerts' },
]

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier']

// Every notification, grouped by day, with an icon per type and a direct
// button when it still asks something of you ("Review offer", "Pay now").
// New ones arrive live (liveTick changes when Realtime reports one).
export default function Notifications({ onNavigate, onUnreadCountChange, liveTick = 0 }) {
    const [notifications, setNotifications] = useState([])
    const [context, setContext] = useState({ contracts: {}, owed: {} })
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [filter, setFilter] = useState('all')
    const [freshIds, setFreshIds] = useState(() => new Set())

    const load = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) setLoading(true)
        const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200)
        if (error) {
            setLoadError(describeSupabaseError(error))
            setLoading(false)
            return
        }
        const rows = data || []
        setNotifications((prev) => {
            if (quiet && prev.length) {
                const known = new Set(prev.map((n) => n.notification_id))
                const added = rows.filter((n) => !known.has(n.notification_id)).map((n) => n.notification_id)
                if (added.length) setFreshIds((f) => new Set([...f, ...added]))
            }
            return rows
        })
        setContext(await loadNotificationContext(rows))
        setLoading(false)
    }, [])

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        if (liveTick > 0) load({ quiet: true })
    }, [liveTick, load])

    const rows = useMemo(
        () =>
            notifications.map((n) => ({
                n,
                meta: notificationKind(n),
                action: notificationAction(n, context.contracts[n.contract_id], context.owed),
            })),
        [notifications, context]
    )

    const counts = useMemo(
        () => ({
            all: rows.length,
            unread: rows.filter((r) => !r.n.read).length,
            action: rows.filter((r) => r.action && r.action !== 'done').length,
            Contracts: rows.filter((r) => r.n.process === 'Contracts').length,
            Payments: rows.filter((r) => r.n.process === 'Payments').length,
            Marketplace: rows.filter((r) => r.n.process === 'Marketplace').length,
        }),
        [rows]
    )

    const groups = useMemo(() => {
        const visible = rows.filter((r) =>
            filter === 'all'
                ? true
                : filter === 'unread'
                  ? !r.n.read
                  : filter === 'action'
                    ? r.action && r.action !== 'done'
                    : r.n.process === filter
        )
        const byGroup = {}
        for (const r of visible) (byGroup[dayGroup(r.n.created_at)] ||= []).push(r)
        return GROUP_ORDER.filter((g) => byGroup[g]).map((g) => ({ title: g, rows: byGroup[g] }))
    }, [rows, filter])

    const markRead = (ids) => {
        const unread = ids.filter((id) => notifications.find((n) => n.notification_id === id && !n.read))
        if (unread.length === 0) return
        setNotifications((prev) => prev.map((n) => (unread.includes(n.notification_id) ? { ...n, read: true } : n)))
        onUnreadCountChange?.((prev) => Math.max(0, prev - unread.length))
        markNotificationsRead(unread)
    }

    const open = (n, section) => {
        markRead([n.notification_id])
        const target = notificationTarget(n)
        onNavigate?.(section || target.section, { contractId: target.contractId, propertyId: target.propertyId })
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
                    <p>
                        {counts.action > 0
                            ? `${counts.action} ${counts.action === 1 ? 'thing needs' : 'things need'} your action. Everything else is for your records.`
                            : 'Updates on your contracts and payments. Nothing needs your action right now.'}
                    </p>
                </div>
                <div className="ns-dash-header-actions">
                    <button
                        type="button"
                        className="ns-outline-btn"
                        onClick={() => markRead(notifications.filter((n) => !n.read).map((n) => n.notification_id))}
                        disabled={counts.unread === 0}
                    >
                        <i className="bi bi-check2-all"></i> Mark all as read
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            {notifications.length > 0 && (
                <div className="ns-nt-filters" role="tablist" aria-label="Filter notifications">
                    {FILTERS.filter((f) => f.id !== 'Marketplace' || counts.Marketplace > 0).map((f) => (
                        <button
                            type="button"
                            key={f.id}
                            role="tab"
                            aria-selected={filter === f.id}
                            className={`${filter === f.id ? 'active' : ''} ${f.id === 'action' && counts.action > 0 ? 'is-hot' : ''}`}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label} <em>{counts[f.id]}</em>
                        </button>
                    ))}
                </div>
            )}

            {notifications.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-bell"></i>
                    <h3>You're all caught up</h3>
                    <p>New activity on your contracts and payments will show up here as it happens.</p>
                </div>
            ) : groups.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-check2-circle"></i>
                    <h3>{filter === 'action' ? 'Nothing needs your action' : 'Nothing here'}</h3>
                    <p>{filter === 'unread' ? 'You have read everything.' : 'Try another filter.'}</p>
                </div>
            ) : (
                groups.map((group) => (
                    <section key={group.title} className="ns-nt-group">
                        <header>
                            <h2>{group.title}</h2>
                            {group.rows.some((r) => !r.n.read) && (
                                <button type="button" className="ns-link-btn" onClick={() => markRead(group.rows.map((r) => r.n.notification_id))}>
                                    Mark as read
                                </button>
                            )}
                        </header>
                        <ul className="ns-nt-list">
                            {group.rows.map(({ n, meta, action }) => (
                                <li
                                    key={n.notification_id}
                                    className={`ns-nt-row tone-${meta.tone} ${n.read ? '' : 'is-unread'} ${freshIds.has(n.notification_id) ? 'is-fresh' : ''}`}
                                >
                                    <button type="button" className="ns-nt-main" onClick={() => open(n)}>
                                        <span className="ns-nt-icon">
                                            <i className={`bi ${meta.icon}`}></i>
                                        </span>
                                        <span className="ns-nt-text">
                                            <span className="ns-nt-title">
                                                {n.title}
                                                {!n.read && <span className="ns-nt-dot" aria-label="Unread" />}
                                            </span>
                                            {n.description && <span className="ns-nt-desc">{n.description}</span>}
                                            <span className="ns-nt-time">{timeLabel(n.created_at)}</span>
                                        </span>
                                    </button>
                                    {action === 'done' ? (
                                        <span className="ns-nt-done">
                                            <i className="bi bi-check2"></i> Done
                                        </span>
                                    ) : action ? (
                                        <button type="button" className="ns-nt-action" onClick={() => open(n, action.section)}>
                                            {action.label}
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))
            )}
        </>
    )
}
