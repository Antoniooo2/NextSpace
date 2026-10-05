import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabaseClient'
import { markNotificationsRead, notificationKind, notificationTarget, notificationTitle, timeLabel } from '../../lib/notificationKinds'
import './notifications.css'

// The bell in the top bar: the unread dot, and on click the five latest
// notifications without leaving the current screen.
export default function NotificationBell({ unreadCount, liveTick, onNavigate, onRead }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const wrapRef = useRef(null)

    useEffect(() => {
        if (!open) return undefined
        let cancelled = false
        setLoading(true)
        supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5)
            .then(({ data }) => {
                if (cancelled) return
                setItems(data || [])
                setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [open, liveTick])

    useEffect(() => {
        if (!open) return undefined
        const onDown = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
        }
        const onKey = (e) => e.key === 'Escape' && setOpen(false)
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const openItem = (n) => {
        if (!n.read) {
            markNotificationsRead([n.notification_id])
            onRead?.(1)
        }
        setOpen(false)
        const target = notificationTarget(n)
        onNavigate(target.section, { contractId: target.contractId, propertyId: target.propertyId })
    }

    return (
        <div className="ns-bell" ref={wrapRef}>
            <button
                type="button"
                className="ns-dash-icon-btn"
                aria-label={unreadCount > 0 ? t('notifications.bell.labelUnread', { count: unreadCount }) : t('notifications.bell.label')}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <i className="bi bi-bell"></i>
                {unreadCount > 0 && <span className="ns-bell-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>

            {open && (
                <div className="ns-bell-panel" role="dialog" aria-label={t('notifications.bell.latest')}>
                    <header>
                        <strong>{t('notifications.bell.label')}</strong>
                        {unreadCount > 0 && <span>{t('notifications.unreadCount', { count: unreadCount })}</span>}
                    </header>
                    {loading && items.length === 0 ? (
                        <p className="ns-bell-empty">{t('common.loading')}</p>
                    ) : items.length === 0 ? (
                        <p className="ns-bell-empty">{t('notifications.bell.caughtUp')}</p>
                    ) : (
                        <ul>
                            {items.map((n) => {
                                const meta = notificationKind(n)
                                return (
                                    <li key={n.notification_id}>
                                        <button type="button" className={`tone-${meta.tone} ${n.read ? '' : 'is-unread'}`} onClick={() => openItem(n)}>
                                            <span className="ns-nt-icon">
                                                <i className={`bi ${meta.icon}`}></i>
                                            </span>
                                            <span className="ns-bell-text">
                                                <strong>{notificationTitle(n)}</strong>
                                                <small>{timeLabel(n.created_at)}</small>
                                            </span>
                                            {!n.read && <span className="ns-nt-dot" aria-label={t('notifications.unread')} />}
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                    <button
                        type="button"
                        className="ns-bell-all"
                        onClick={() => {
                            setOpen(false)
                            onNavigate('notifications')
                        }}
                    >
                        {t('notifications.bell.seeAll')} <i className="bi bi-arrow-right"></i>
                    </button>
                </div>
            )}
        </div>
    )
}
