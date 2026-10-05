import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { money, recordSummary } from '../../lib/contracts'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import { useOwnerProperties } from '../../hooks/useOwnerProperties'
import { clearHistory } from './advisor/chatBlocks'
import ChangePasswordModal from './ChangePasswordModal'
import PayoutAccountModal from './payments/PayoutAccountModal'
import { formatRate, sumSplit } from '../../lib/platformFee'
import { loadPayoutAccount, maskAccountNumber } from '../../lib/payouts'
import usePlatformFee from '../../hooks/usePlatformFee'
import ConfirmDialog from './ConfirmDialog'
import EditProfileModal from './EditProfileModal'
import './profile.css'

const ACCOUNT_TYPE_LABEL = {
    business: 'Business',
    'property-owner': 'Property Owner',
}

const PREVIEW_COUNT = 4

function maskDui(dui) {
    if (!dui) return '—'
    return dui.replace(/^\d{4}/, '••••')
}

function memberSince(ts) {
    if (!ts) return null
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// The on-time rate as a ring, the same figure owners see on a request.
function RecordRing({ pct, tone }) {
    const r = 34
    const c = 2 * Math.PI * r
    return (
        <svg className={`ns-pf-ring tone-${tone}`} viewBox="0 0 84 84" aria-hidden="true">
            <circle cx="42" cy="42" r={r} className="ns-pf-ring-track" />
            {pct != null && (
                <circle
                    cx="42"
                    cy="42"
                    r={r}
                    className="ns-pf-ring-value"
                    strokeDasharray={`${(pct / 100) * c} ${c}`}
                    transform="rotate(-90 42 42)"
                />
            )}
            <text x="42" y="47" textAnchor="middle">
                {pct != null ? `${pct}%` : 'New'}
            </text>
        </svg>
    )
}

function TenantRecordCard({ record, loading }) {
    const summary = recordSummary(record)
    const hasHistory = summary.pct != null
    const headline = !hasHistory
        ? 'New on NextSpace'
        : record.months_late_now > 0
          ? 'You have rent pending'
          : summary.tone === 'success'
            ? 'Great payment record'
            : 'Room to improve'

    return (
        <section className="ns-pf-card ns-pf-record">
            <div className="ns-pf-card-head">
                <h3>How owners see you</h3>
                <span className="ns-pf-hint">
                    <i className="bi bi-eye"></i> Shown when you request a space
                </span>
            </div>
            {loading ? (
                <p className="ns-pf-muted">Loading your record...</p>
            ) : (
                <div className="ns-pf-record-body">
                    <RecordRing pct={summary.pct} tone={summary.tone} />
                    <div className="ns-pf-record-text">
                        <strong>{headline}</strong>
                        <p>
                            {!hasHistory
                                ? 'You have no rent history yet. Paying on time from your first month builds the record owners look at.'
                                : `${record.months_on_time} of ${record.months_due} months paid on time.`}
                            {hasHistory && record.months_late_now > 0 && (
                                <>
                                    {' '}
                                    <span className="ns-pf-late">
                                        {record.months_late_now === 1 ? '1 month is' : `${record.months_late_now} months are`} late right now.
                                    </span>
                                </>
                            )}
                        </p>
                        <div className="ns-pf-record-facts">
                            <span>
                                <strong>{record?.active_leases ?? 0}</strong> active {record?.active_leases === 1 ? 'lease' : 'leases'}
                            </span>
                            <span>
                                <strong>{record?.completed_leases ?? 0}</strong> completed
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}

function OwnerSummary({ properties, loadingProperties }) {
    const [activeLeases, setActiveLeases] = useState(null)
    const [collected, setCollected] = useState(null)
    const feeRate = usePlatformFee()
    const year = new Date().getFullYear()

    useEffect(() => {
        if (loadingProperties) return undefined
        let cancelled = false
        const ids = properties.map((p) => p.property_id)
        if (ids.length === 0) {
            setActiveLeases([])
            setCollected({ gross: 0, fee: 0, net: 0 })
            return undefined
        }
        ;(async () => {
            const { data: contracts } = await supabase
                .from('contract')
                .select('contract_id, property_id, status')
                .in('property_id', ids)
            const all = contracts || []
            const contractIds = all.map((c) => c.contract_id)
            let total = { gross: 0, fee: 0, net: 0 }
            if (contractIds.length > 0) {
                const { data: paid } = await supabase
                    .from('payment')
                    .select('amount, commission_rate, commission_amount, owner_amount')
                    .in('contract_id', contractIds)
                    .eq('status', 'Paid')
                    .gte('paid_at', `${year}-01-01`)
                total = sumSplit(paid || [], feeRate)
            }
            if (cancelled) return
            setActiveLeases(all.filter((c) => c.status === 'Active'))
            setCollected(total)
        })()
        return () => {
            cancelled = true
        }
    }, [properties, loadingProperties, year, feeRate])

    const leasedIds = new Set((activeLeases || []).map((c) => c.property_id))
    const leased = properties.filter((p) => leasedIds.has(p.property_id)).length
    const tiles = [
        {
            icon: 'bi-buildings',
            value: loadingProperties ? '—' : properties.length,
            label: 'Properties',
            sub: activeLeases ? `${leased} leased · ${properties.length - leased} free` : '',
        },
        { icon: 'bi-file-earmark-check', value: activeLeases ? activeLeases.length : '—', label: 'Active leases', sub: 'Tenants paying rent' },
        {
            icon: 'bi-cash-coin',
            value: collected != null ? money(collected.net) : '—',
            label: `Yours in ${year}`,
            sub: collected ? `${money(collected.gross)} collected − ${formatRate(feeRate)} NextSpace fee` : '',
        },
    ]

    return (
        <section className="ns-pf-tiles">
            {tiles.map((t) => (
                <div className="ns-pf-tile" key={t.label}>
                    <span className="ns-pf-tile-icon">
                        <i className={`bi ${t.icon}`}></i>
                    </span>
                    <div>
                        <strong>{t.value}</strong>
                        <span>{t.label}</span>
                        {t.sub && <small>{t.sub}</small>}
                    </div>
                </div>
            ))}
        </section>
    )
}

export default function ProfileView({ user, accountType, onNavigate, onUserUpdated, onViewProperty, onLogout }) {
    const [showEditModal, setShowEditModal] = useState(false)
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
    const [confirm, setConfirm] = useState(null)
    const [notice, setNotice] = useState('')
    const [showDui, setShowDui] = useState(false)
    const [record, setRecord] = useState(null)
    const [loadingRecord, setLoadingRecord] = useState(true)
    const [savedProperties, setSavedProperties] = useState([])
    const [loadingSaved, setLoadingSaved] = useState(true)
    const [showAll, setShowAll] = useState(false)
    const [removingId, setRemovingId] = useState(null)
    const [payoutAccount, setPayoutAccount] = useState(null)
    const [showPayoutModal, setShowPayoutModal] = useState(false)

    const meta = user.user_metadata || {}
    const firstName = meta.first_name || ''
    const lastName = meta.last_name || ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'NextSpace User'
    const initials = ((firstName[0] || 'U') + (lastName[0] || '')).toUpperCase()
    const since = memberSince(user.created_at)

    const isOwner = accountType === 'property-owner'
    const { properties: ownProperties, loading: loadingProperties } = useOwnerProperties(isOwner ? user : null)

    useEffect(() => {
        if (!isOwner) return undefined
        let cancelled = false
        loadPayoutAccount()
            .then((account) => {
                if (!cancelled) setPayoutAccount(account)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [isOwner, user.id])

    useEffect(() => {
        if (isOwner) return undefined
        let cancelled = false

        supabase.rpc('my_tenant_record').then(({ data, error }) => {
            if (cancelled) return
            if (error) console.error('Profile: could not load payment record', error)
            setRecord(data?.[0] || null)
            setLoadingRecord(false)
        })

        supabase
            .from('saved_properties')
            .select(`saved_at, add_business(*, ${PROPERTY_PHOTO_EMBED})`)
            .eq('user_auth_id', user.id)
            .order('saved_at', { ascending: false })
            .then(({ data, error }) => {
                if (cancelled) return
                if (error) console.error('Profile: could not load saved properties', error)
                // Skip any row whose listing didn't come back instead of
                // rendering an empty card.
                setSavedProperties(
                    (data || [])
                        .map((row) => row.add_business)
                        .filter(Boolean)
                        .map(withCoverPhoto)
                )
                setLoadingSaved(false)
            })

        return () => {
            cancelled = true
        }
    }, [isOwner, user.id])

    const handleRemoveSaved = async (propertyId) => {
        if (removingId) return
        setRemovingId(propertyId)

        const { error } = await supabase
            .from('saved_properties')
            .delete()
            .eq('user_auth_id', user.id)
            .eq('property_id', propertyId)

        setRemovingId(null)
        if (!error) setSavedProperties((prev) => prev.filter((p) => p.property_id !== propertyId))
    }

    const handleClearChat = async () => {
        setConfirm(null)
        const { error } = await clearHistory()
        setNotice(error ? 'Could not delete the chat history. Please try again.' : 'Your chat with Rony was deleted.')
        setTimeout(() => setNotice(''), 3500)
    }

    const visibleSaved = showAll ? savedProperties : savedProperties.slice(0, PREVIEW_COUNT)

    const settings = [
        isOwner && {
            icon: 'bi-bank',
            title: payoutAccount ? 'Bank account for transfers' : 'Add your bank account',
            text: payoutAccount
                ? `${payoutAccount.bank_name} ${maskAccountNumber(payoutAccount.account_number)} · where NextSpace sends your rent`
                : 'Where NextSpace sends your rent, minus its fee',
            onClick: () => setShowPayoutModal(true),
        },
        {
            icon: 'bi-key',
            title: 'Change password',
            text: 'Update your access key for security',
            onClick: () => setShowChangePasswordModal(true),
        },
        {
            icon: 'bi-chat-left-dots',
            title: 'Delete chat with Rony',
            text: 'Start the AI Advisor from a clean slate',
            onClick: () => setConfirm('chat'),
        },
        onLogout && {
            icon: 'bi-box-arrow-right',
            title: 'Sign out',
            text: 'Leave NextSpace on this device',
            onClick: () => setConfirm('logout'),
            danger: true,
        },
    ].filter(Boolean)

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Profile</h1>
                    <p>{isOwner ? 'Your account and portfolio at a glance.' : 'Your account, your record and the spaces you saved.'}</p>
                </div>
            </div>

            {notice && (
                <div className="ns-pf-notice" role="status">
                    <i className="bi bi-check-circle"></i> {notice}
                </div>
            )}

            <div className="ns-pf-grid">
                <aside className="ns-pf-card ns-pf-id">
                    <div className="ns-pf-id-top">
                        <span className="ns-pf-avatar">{initials}</span>
                        <div>
                            <h2>{fullName}</h2>
                            <span className="ns-pf-badge">
                                <i className="bi bi-patch-check-fill"></i> {ACCOUNT_TYPE_LABEL[accountType]}
                            </span>
                            {since && <small className="ns-pf-since">Member since {since}</small>}
                        </div>
                    </div>

                    <ul className="ns-pf-contact">
                        <li>
                            <i className="bi bi-envelope"></i>
                            <div>
                                <span>Email</span>
                                <strong>{user.email}</strong>
                            </div>
                        </li>
                        <li>
                            <i className="bi bi-person-vcard"></i>
                            <div>
                                <span>DUI</span>
                                <strong>{showDui ? meta.dui || '—' : maskDui(meta.dui)}</strong>
                            </div>
                            {meta.dui && (
                                <button
                                    type="button"
                                    className="ns-pf-eye"
                                    onClick={() => setShowDui((v) => !v)}
                                    aria-label={showDui ? 'Hide DUI' : 'Show DUI'}
                                >
                                    <i className={`bi ${showDui ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                                </button>
                            )}
                        </li>
                    </ul>

                    <button type="button" className="ns-outline-btn ns-pf-edit" onClick={() => setShowEditModal(true)}>
                        <i className="bi bi-pencil"></i> Edit profile
                    </button>
                </aside>

                <div className="ns-pf-main">
                    {isOwner ? (
                        <OwnerSummary properties={ownProperties} loadingProperties={loadingProperties} />
                    ) : (
                        <>
                            <TenantRecordCard record={record} loading={loadingRecord} />

                            <section className="ns-pf-card">
                                <div className="ns-pf-card-head">
                                    <h3>
                                        Saved spaces {savedProperties.length > 0 && <em>{savedProperties.length}</em>}
                                    </h3>
                                    {savedProperties.length > PREVIEW_COUNT && (
                                        <button type="button" className="ns-link-btn" onClick={() => setShowAll((v) => !v)}>
                                            {showAll ? 'Show less' : 'View all'}
                                        </button>
                                    )}
                                </div>

                                {loadingSaved ? (
                                    <p className="ns-pf-muted">Loading your saved spaces...</p>
                                ) : savedProperties.length === 0 ? (
                                    <div className="ns-pf-empty">
                                        <i className="bi bi-bookmark-heart"></i>
                                        <p>Tap Save on a space in the Marketplace to keep it here.</p>
                                        <button type="button" className="ns-outline-btn" onClick={() => onNavigate('home')}>
                                            Browse Marketplace
                                        </button>
                                    </div>
                                ) : (
                                    <div className="ns-pf-saved">
                                        {visibleSaved.map((p) => {
                                            const unavailable = p.availability && p.availability !== 'Available'
                                            return (
                                                <div
                                                    key={p.property_id}
                                                    className="ns-pf-saved-card"
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => onViewProperty?.(p)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') onViewProperty?.(p)
                                                    }}
                                                >
                                                    <div className="ns-pf-saved-img">
                                                        {p.photo_url ? <img src={p.photo_url} alt={p.property_name} /> : <i className="bi bi-shop"></i>}
                                                        <span className={`ns-pf-saved-status ${unavailable ? 'is-off' : ''}`}>
                                                            {unavailable ? p.availability : 'Available'}
                                                        </span>
                                                    </div>
                                                    <div className="ns-pf-saved-info">
                                                        <strong>{p.property_name}</strong>
                                                        <span>{[p.municipality, p.department].filter(Boolean).join(', ') || p.property_type}</span>
                                                        <em>
                                                            {p.monthly_rent != null ? (
                                                                <>
                                                                    {money(p.monthly_rent)}
                                                                    <small>/month</small>
                                                                </>
                                                            ) : (
                                                                'Price on request'
                                                            )}
                                                        </em>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="ns-pf-saved-remove"
                                                        title="Remove from saved"
                                                        aria-label={`Remove ${p.property_name} from saved`}
                                                        disabled={removingId === p.property_id}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleRemoveSaved(p.property_id)
                                                        }}
                                                    >
                                                        <i className="bi bi-bookmark-x"></i>
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </section>
                        </>
                    )}

                    <section className="ns-pf-card">
                        <div className="ns-pf-card-head">
                            <h3>Account</h3>
                        </div>
                        <div className="ns-pf-settings">
                            {settings.map((s) => (
                                <button type="button" key={s.title} className={s.danger ? 'is-danger' : ''} onClick={s.onClick}>
                                    <span className="ns-pf-settings-icon">
                                        <i className={`bi ${s.icon}`}></i>
                                    </span>
                                    <span className="ns-pf-settings-text">
                                        <strong>{s.title}</strong>
                                        <small>{s.text}</small>
                                    </span>
                                    <i className="bi bi-chevron-right ns-pf-chevron"></i>
                                </button>
                            ))}
                        </div>
                    </section>
                </div>
            </div>

            {showEditModal && (
                <EditProfileModal user={user} onClose={() => setShowEditModal(false)} onUpdated={onUserUpdated} />
            )}

            {showChangePasswordModal && <ChangePasswordModal onClose={() => setShowChangePasswordModal(false)} />}

            {showPayoutModal && (
                <PayoutAccountModal
                    ownerDui={meta.dui}
                    account={payoutAccount}
                    defaultHolder={fullName}
                    onSaved={(saved) => {
                        setPayoutAccount(saved)
                        setShowPayoutModal(false)
                        setNotice('Bank account saved.')
                        setTimeout(() => setNotice(''), 3500)
                    }}
                    onClose={() => setShowPayoutModal(false)}
                />
            )}

            {confirm === 'chat' && (
                <ConfirmDialog
                    icon="bi-chat-left-dots"
                    title="Delete your chat with Rony?"
                    description="The whole conversation is removed. Rony still knows your NextSpace data."
                    confirmLabel="Delete chat"
                    onConfirm={handleClearChat}
                    onCancel={() => setConfirm(null)}
                />
            )}

            {confirm === 'logout' && (
                <ConfirmDialog
                    icon="bi-box-arrow-right"
                    title="Sign out?"
                    description="You'll need your email and password to come back in."
                    confirmLabel="Sign out"
                    onConfirm={onLogout}
                    onCancel={() => setConfirm(null)}
                />
            )}
        </>
    )
}
