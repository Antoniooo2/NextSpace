import { useCallback, useEffect, useMemo, useState } from 'react'

/**
* NextSpaceDashboard
* Pantalla única con navegación por pestañas (marketplace, contratos, pagos,
* notificaciones, perfil). Las notificaciones se filtran por usuario activo
* y por proceso.
*/

const USERS = [
    { id: 'user_julian', name: 'Julian Diaz', role: 'Principal Broker', avatar: 'JD' },
    { id: 'user_maria', name: 'Maria Reyes', role: 'Property Owner', avatar: 'MR' },
]

const GROUPS = ['TODAY', 'THIS WEEK', 'EARLIER']

const PROCESSES = ['ALL', 'Contracts', 'Payments', 'Marketplace', 'AI Advisor']

const NAV_ITEMS = [
    { id: 'marketplace', label: 'Marketplace', icon: 'fa-store' },
    { id: 'ai', label: 'AI Advisor', icon: 'fa-brain' },
    { id: 'contracts', label: 'Contracts', icon: 'fa-file-contract' },
    { id: 'payments', label: 'Payments', icon: 'fa-wallet' },
    { id: 'notifications', label: 'Notifications', icon: 'fa-bell' },
    { id: 'profile', label: 'Profile', icon: 'fa-user' },
]

const INITIAL_NOTIFICATIONS = [
    {
        id: 'n1',
        userId: 'user_julian',
        process: 'Contracts',
        group: 'TODAY',
        title: 'New contract request: Central Tower',
        description:
            'The tenant Logistics Global requested a new version of the Tower B lease agreement.',
        time: '10:45 AM',
        unread: true,
        accentColor: '#1d4ed8',
        icon: 'fa-file-alt',
        actions: [
            { label: 'Review contract', variant: 'primary' },
            { label: 'Postpone', variant: 'outline' },
        ],
    },
    {
        id: 'n2',
        userId: 'user_julian',
        process: 'Payments',
        group: 'TODAY',
        title: 'Payment received: Unit 402',
        description: 'The security deposit of $4,500.00 USD was processed successfully.',
        time: '09:15 AM',
        unread: true,
        accentColor: '#10b981',
        icon: 'fa-money-bill-wave',
    },
    {
        id: 'n3',
        userId: 'user_julian',
        process: 'Payments',
        group: 'TODAY',
        title: 'Pending payment reminder',
        description:
            'The Plaza Norte contract expires in 3 days and no monthly payment has been detected.',
        time: '2 hours ago',
        unread: false,
        accentColor: '#f59e0b',
        icon: 'fa-exclamation-triangle',
    },
    {
        id: 'n4',
        userId: 'user_julian',
        process: 'Contracts',
        group: 'THIS WEEK',
        title: 'Contract signed: SkyOffice 12',
        description: 'Both parties completed the digital signature.',
        time: 'Mon, Mar 12, 10:20 AM',
        unread: false,
        accentColor: '#1d4ed8',
        icon: 'fa-file-signature',
    },
    {
        id: 'n5',
        userId: 'user_julian',
        process: 'Marketplace',
        group: 'THIS WEEK',
        title: 'Listing activity: Industrial Hub A',
        description: 'Your property received 45 new views and 3 saves this week.',
        time: 'Mon, 11:00 AM',
        unread: false,
        accentColor: '#64748b',
        icon: 'fa-chart-line',
    },
    {
        id: 'n6',
        userId: 'user_julian',
        process: 'AI Advisor',
        group: 'EARLIER',
        title: 'AI Advisor suggestion',
        description:
            'Based on market trends, consider adjusting the price per square meter in San Benito.',
        time: '8 days ago',
        unread: false,
        accentColor: '#8b5cf6',
        icon: 'fa-lightbulb',
    },
    {
        id: 'n7',
        userId: 'user_maria',
        process: 'Payments',
        group: 'TODAY',
        title: 'Rent transferred: Plaza San José',
        description: 'Your September payout of $2,100.00 USD is on its way to your bank account.',
        time: '08:02 AM',
        unread: true,
        accentColor: '#10b981',
        icon: 'fa-money-bill-wave',
    },
]

// Genera ids únicos aunque se creen varias notificaciones en el mismo milisegundo.
let notificationSeq = 0
const nextNotificationId = () => `n_${Date.now()}_${notificationSeq++}`

export default function NextSpaceDashboard() {
    const [currentUserId, setCurrentUserId] = useState(USERS[0].id)
    const [activeTab, setActiveTab] = useState('notifications')
    const [selectedProcess, setSelectedProcess] = useState('ALL')
    const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS)

    const currentUser = USERS.find((u) => u.id === currentUserId) ?? USERS[0]

    // Font Awesome: los iconos no se ven si la hoja de estilos no está cargada.
    // Lo ideal es ponerla en index.html; esto la inyecta si no existe.
    useEffect(() => {
        const id = 'nextspace-fontawesome'
        if (document.getElementById(id)) return
        const link = document.createElement('link')
        link.id = id
        link.rel = 'stylesheet'
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'
        document.head.appendChild(link)
    }, [])

    const createNotification = useCallback(
        ({ targetUserId, process, title, description, accentColor, icon, actions }) => {
            setNotifications((prev) => [
                {
                    id: nextNotificationId(),
                    userId: targetUserId || currentUserId,
                    process,
                    group: 'TODAY',
                    title,
                    description,
                    time: 'Just now',
                    unread: true,
                    accentColor: accentColor || '#1d4ed8',
                    icon: icon || 'fa-bell',
                    actions: actions || null,
                },
                ...prev,
            ])
        },
        [currentUserId],
    )

    const markAsRead = useCallback((id) => {
        setNotifications((prev) => {
            const target = prev.find((n) => n.id === id)
            if (!target || !target.unread) return prev // evita re-render innecesario
            return prev.map((n) => (n.id === id ? { ...n, unread: false } : n))
        })
    }, [])

    const markAllAsRead = useCallback(() => {
        setNotifications((prev) =>
            prev.some((n) => n.userId === currentUserId && n.unread)
                ? prev.map((n) => (n.userId === currentUserId ? { ...n, unread: false } : n))
                : prev,
        )
    }, [currentUserId])

    const userNotifications = useMemo(
        () => notifications.filter((n) => n.userId === currentUserId),
        [notifications, currentUserId],
    )

    const unreadCount = useMemo(
        () => userNotifications.filter((n) => n.unread).length,
        [userNotifications],
    )

    const filteredNotifications = useMemo(
        () =>
            userNotifications.filter((n) =>
                selectedProcess === 'ALL' ? true : n.process === selectedProcess,
            ),
        [userNotifications, selectedProcess],
    )

    return (
        <div
            style={{
                display: 'flex',
                minHeight: '100vh',
                fontFamily: 'Inter, system-ui, sans-serif',
                background: '#f8fafc',
            }}
        >
            {/* SIDEBAR */}
            <aside
                style={{
                    width: '240px',
                    background: '#0f172a',
                    color: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                        style={{
                            background: '#2563eb',
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            display: 'grid',
                            placeItems: 'center',
                        }}
                    >
                        <i className="fas fa-building" style={{ color: '#fff' }} aria-hidden="true" />
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em' }}>
                        NextSpace
                    </span>
                </div>

                <nav
                    style={{
                        flex: 1,
                        padding: '0 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                    }}
                >
                    {NAV_ITEMS.map((item) => {
                        const isActive = activeTab === item.id
                        const badge = item.id === 'notifications' ? unreadCount : 0

                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveTab(item.id)}
                                aria-current={isActive ? 'page' : undefined}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    width: '100%',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: isActive ? '#1e293b' : 'transparent',
                                    color: isActive ? '#fff' : '#94a3b8',
                                    fontWeight: isActive ? 600 : 500,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                <i className={`fas ${item.icon}`} style={{ width: '16px' }} aria-hidden="true" />
                                <span style={{ flex: 1 }}>{item.label}</span>
                                {badge > 0 && (
                                    <span
                                        style={{
                                            background: '#2563eb',
                                            color: '#fff',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            padding: '2px 7px',
                                            borderRadius: '10px',
                                        }}
                                    >
                                        {badge}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </nav>

                {/* Cambio de usuario activo: demuestra el filtrado de notificaciones por userId */}
                <div style={{ padding: '16px', borderTop: '1px solid #1e293b' }}>
                    <div
                        style={{
                            fontSize: '11px',
                            color: '#64748b',
                            marginBottom: '8px',
                            fontWeight: 700,
                        }}
                    >
                        Active session
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: '#2563eb',
                                color: '#fff',
                                display: 'grid',
                                placeItems: 'center',
                                fontWeight: 700,
                                fontSize: '13px',
                            }}
                        >
                            {currentUser.avatar}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {currentUser.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{currentUser.role}</div>
                        </div>
                    </div>

                    <label
                        htmlFor="user-switcher"
                        style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}
                    >
                        Switch user
                    </label>
                    <select
                        id="user-switcher"
                        value={currentUserId}
                        onChange={(e) => setCurrentUserId(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid #1e293b',
                            background: '#1e293b',
                            color: '#e2e8f0',
                            fontSize: '12px',
                            cursor: 'pointer',
                        }}
                    >
                        {USERS.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.name}
                            </option>
                        ))}
                    </select>
                </div>
            </aside>

            {/* ÁREA PRINCIPAL */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <header
                    style={{
                        height: '64px',
                        background: '#fff',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 28px',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            background: '#f1f5f9',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            width: '320px',
                        }}
                    >
                        <i
                            className="fas fa-search"
                            style={{ color: '#94a3b8', fontSize: '13px' }}
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            aria-label="Search properties, contracts and alerts"
                            placeholder="Search properties, contracts, alerts..."
                            style={{
                                border: 'none',
                                background: 'transparent',
                                outline: 'none',
                                fontSize: '13px',
                                width: '100%',
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button
                            type="button"
                            onClick={() => setActiveTab('notifications')}
                            aria-label={`Notifications, ${unreadCount} unread`}
                            style={{
                                position: 'relative',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '16px',
                                color: '#64748b',
                            }}
                        >
                            <i className="far fa-bell" aria-hidden="true" />
                            {unreadCount > 0 && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: '-2px',
                                        right: '-2px',
                                        width: '8px',
                                        height: '8px',
                                        background: '#ef4444',
                                        borderRadius: '50%',
                                    }}
                                />
                            )}
                        </button>
                        <span
                            style={{
                                fontSize: '12px',
                                background: '#f0fdf4',
                                color: '#166534',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontWeight: 600,
                            }}
                        >
                            Premium plan
                        </span>
                    </div>
                </header>

                <main style={{ flex: 1, padding: '28px', overflowY: 'auto' }}>
                    {activeTab === 'notifications' && (
                        <div style={{ maxWidth: '880px', margin: '0 auto' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    marginBottom: '20px',
                                }}
                            >
                                <div>
                                    <h1
                                        style={{
                                            fontSize: '22px',
                                            fontWeight: 700,
                                            color: '#0f172a',
                                            margin: '0 0 4px',
                                        }}
                                    >
                                        Notifications
                                    </h1>
                                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                                        Manage your rental updates and marketplace activity.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={markAllAsRead}
                                    disabled={unreadCount === 0}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: unreadCount === 0 ? '#94a3b8' : '#2563eb',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: unreadCount === 0 ? 'default' : 'pointer',
                                    }}
                                >
                                    Mark all as read
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                                {PROCESSES.map((proc) => {
                                    const isActive = selectedProcess === proc
                                    return (
                                        <button
                                            key={proc}
                                            type="button"
                                            onClick={() => setSelectedProcess(proc)}
                                            aria-pressed={isActive}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '20px',
                                                border: '1px solid',
                                                borderColor: isActive ? '#2563eb' : '#e2e8f0',
                                                background: isActive ? '#eff6ff' : '#fff',
                                                color: isActive ? '#2563eb' : '#64748b',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {proc === 'ALL' ? 'All' : proc}
                                        </button>
                                    )
                                })}
                            </div>

                            {filteredNotifications.length === 0 ? (
                                <div
                                    style={{
                                        background: '#fff',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '10px',
                                        padding: '40px',
                                        textAlign: 'center',
                                        color: '#64748b',
                                        fontSize: '14px',
                                    }}
                                >
                                    Nothing here yet. Activity for this filter will show up as it happens.
                                </div>
                            ) : (
                                GROUPS.map((group) => {
                                    const groupItems = filteredNotifications.filter((n) => n.group === group)
                                    if (groupItems.length === 0) return null

                                    return (
                                        <section key={group} style={{ marginBottom: '24px' }}>
                                            <h2
                                                style={{
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    color: '#94a3b8',
                                                    letterSpacing: '0.05em',
                                                    margin: '0 0 10px',
                                                }}
                                            >
                                                {group}
                                            </h2>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {groupItems.map((item) => (
                                                    <article
                                                        key={item.id}
                                                        onClick={() => markAsRead(item.id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault()
                                                                markAsRead(item.id)
                                                            }
                                                        }}
                                                        role="button"
                                                        tabIndex={0}
                                                        aria-label={`${item.title}. ${item.unread ? 'Unread' : 'Read'}`}
                                                        style={{
                                                            background: '#fff',
                                                            borderRadius: '10px',
                                                            border: '1px solid #e2e8f0',
                                                            borderLeft: `4px solid ${item.accentColor}`,
                                                            padding: '16px',
                                                            display: 'flex',
                                                            gap: '14px',
                                                            cursor: item.unread ? 'pointer' : 'default',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                width: '36px',
                                                                height: '36px',
                                                                borderRadius: '50%',
                                                                background: `${item.accentColor}15`,
                                                                color: item.accentColor,
                                                                display: 'grid',
                                                                placeItems: 'center',
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            <i
                                                                className={`fas ${item.icon}`}
                                                                style={{ fontSize: '14px' }}
                                                                aria-hidden="true"
                                                            />
                                                        </div>

                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    gap: '12px',
                                                                    marginBottom: '4px',
                                                                }}
                                                            >
                                                                <span
                                                                    style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}
                                                                >
                                                                    {item.title}
                                                                </span>
                                                                <span
                                                                    style={{
                                                                        fontSize: '11px',
                                                                        color: '#94a3b8',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    {item.time}
                                                                </span>
                                                            </div>
                                                            <p
                                                                style={{
                                                                    fontSize: '13px',
                                                                    color: '#475569',
                                                                    margin: item.actions ? '0 0 10px' : 0,
                                                                    lineHeight: 1.4,
                                                                }}
                                                            >
                                                                {item.description}
                                                            </p>

                                                            {item.actions && (
                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                    {item.actions.map((act) => (
                                                                        <button
                                                                            key={act.label}
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                // Sin esto, el click sube al contenedor y marca como leída.
                                                                                e.stopPropagation()
                                                                                act.onClick?.(item)
                                                                            }}
                                                                            style={{
                                                                                padding: '5px 12px',
                                                                                borderRadius: '6px',
                                                                                fontSize: '12px',
                                                                                fontWeight: 600,
                                                                                border:
                                                                                    act.variant === 'primary' ? 'none' : '1px solid #cbd5e1',
                                                                                background: act.variant === 'primary' ? '#0f172a' : '#fff',
                                                                                color: act.variant === 'primary' ? '#fff' : '#334155',
                                                                                cursor: 'pointer',
                                                                            }}
                                                                        >
                                                                            {act.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {item.unread && (
                                                            <span
                                                                aria-hidden="true"
                                                                style={{
                                                                    width: '8px',
                                                                    height: '8px',
                                                                    borderRadius: '50%',
                                                                    background: '#2563eb',
                                                                    marginTop: '4px',
                                                                    flexShrink: 0,
                                                                }}
                                                            />
                                                        )}
                                                    </article>
                                                ))}
                                            </div>
                                        </section>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {activeTab === 'contracts' && (
                        <div
                            style={{
                                maxWidth: '800px',
                                background: '#fff',
                                padding: '24px',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                            }}
                        >
                            <h1 style={{ margin: '0 0 10px', fontSize: '18px' }}>Contracts</h1>
                            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
                                Create a contract event to see the notification appear for the active user.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    createNotification({
                                        process: 'Contracts',
                                        title: 'Draft created: Unit 302',
                                        description: 'The lease draft for Plaza San José was generated.',
                                        accentColor: '#1d4ed8',
                                        icon: 'fa-file-signature',
                                        actions: [{ label: 'Sign now', variant: 'primary' }],
                                    })
                                    setActiveTab('notifications')
                                }}
                                style={{
                                    background: '#2563eb',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px 18px',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Create contract event
                            </button>
                        </div>
                    )}

                    {activeTab === 'payments' && (
                        <div
                            style={{
                                maxWidth: '800px',
                                background: '#fff',
                                padding: '24px',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                            }}
                        >
                            <h1 style={{ margin: '0 0 10px', fontSize: '18px' }}>Payments</h1>
                            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
                                Record a payment to notify the active user right away.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    createNotification({
                                        process: 'Payments',
                                        title: 'Payment received: $1,200.00 USD',
                                        description: 'September transfer verified for office B1.',
                                        accentColor: '#10b981',
                                        icon: 'fa-money-bill-wave',
                                    })
                                    setActiveTab('notifications')
                                }}
                                style={{
                                    background: '#10b981',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px 18px',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Record payment
                            </button>
                        </div>
                    )}

                    {!['notifications', 'contracts', 'payments'].includes(activeTab) && (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            The {NAV_ITEMS.find((i) => i.id === activeTab)?.label ?? activeTab} module is not
                            built yet.
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}