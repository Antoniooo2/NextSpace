import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../lib/format'
import { availabilityLabel, propertyTypeLabel } from '../../lib/displayValues'
import { BRAND_VALUES } from '../../lib/brand'
import { BULLETS, DASH, DOT, MINUS } from '../../lib/symbols'
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
    business: 'dashboard.accountType.business',
    'property-owner': 'dashboard.accountType.owner',
}

const PREVIEW_COUNT = 4

function maskDui(dui) {
    if (!dui) return DASH
    return dui.replace(/^\d{4}/, BULLETS)
}

function memberSince(ts) {
    if (!ts) return null
    return formatDate(ts, { month: 'short', year: 'numeric' })
}

// The on-time rate as a ring, the same figure owners see on a request.
function RecordRing({ pct, tone }) {
    const { t } = useTranslation()
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
                {pct != null ? `${pct}%` : t('profile.record.new')}
            </text>
        </svg>
    )
}

function TenantRecordCard({ record, loading }) {
    const { t } = useTranslation()
    const summary = recordSummary(record)
    const hasHistory = summary.pct != null
    const headline = !hasHistory
        ? t('contracts.record.newOnBrand', BRAND_VALUES)
        : record.months_late_now > 0
          ? t('profile.record.pending')
          : summary.tone === 'success'
            ? t('profile.record.great')
            : t('profile.record.improve')

    return (
        <section className="ns-pf-card ns-pf-record">
            <div className="ns-pf-card-head">
                <h3>{t('profile.record.title')}</h3>
                <span className="ns-pf-hint">
                    <i className="bi bi-eye"></i> {t('profile.record.hint')}
                </span>
            </div>
            {loading ? (
                <p className="ns-pf-muted">{t('profile.record.loading')}</p>
            ) : (
                <div className="ns-pf-record-body">
                    <RecordRing pct={summary.pct} tone={summary.tone} />
                    <div className="ns-pf-record-text">
                        <strong>{headline}</strong>
                        <p>
                            {!hasHistory
                                ? t('profile.record.noHistory')
                                : t('profile.record.paidOnTime', { count: record.months_due, onTime: record.months_on_time })}
                            {hasHistory && record.months_late_now > 0 && (
                                <>
                                    {' '}
                                    <span className="ns-pf-late">
                                        {t('profile.record.lateNow', { count: record.months_late_now })}
                                    </span>
                                </>
                            )}
                        </p>
                        <div className="ns-pf-record-facts">
                            <span>
                                <strong>{record?.active_leases ?? 0}</strong> {t('profile.record.activeLeases', { count: record?.active_leases ?? 0 })}
                            </span>
                            <span>
                                <strong>{record?.completed_leases ?? 0}</strong> {t('profile.record.completed', { count: record?.completed_leases ?? 0 })}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}

function OwnerSummary({ properties, loadingProperties }) {
    const { t } = useTranslation()
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
            value: loadingProperties ? DASH : properties.length,
            label: t('profile.owner.properties'),
            sub: activeLeases ? t('profile.owner.leasedFree', { leased, free: properties.length - leased, dot: DOT }) : '',
        },
        {
            icon: 'bi-file-earmark-check',
            value: activeLeases ? activeLeases.length : DASH,
            label: t('profile.owner.activeLeases'),
            sub: t('profile.owner.tenantsPaying'),
        },
        {
            icon: 'bi-cash-coin',
            value: collected != null ? money(collected.net) : DASH,
            label: t('profile.owner.yoursIn', { year }),
            sub: collected
                ? t('profile.owner.collectedMinusFee', { ...BRAND_VALUES, gross: money(collected.gross), rate: formatRate(feeRate), minus: MINUS })
                : '',
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
    const { t } = useTranslation()
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
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || t('profile.defaultName', BRAND_VALUES)
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
        setNotice(error ? t('profile.chatDeleteError') : t('profile.chatDeleted', BRAND_VALUES))
        setTimeout(() => setNotice(''), 3500)
    }

    const visibleSaved = showAll ? savedProperties : savedProperties.slice(0, PREVIEW_COUNT)

    const settings = [
        isOwner && {
            icon: 'bi-bank',
            title: payoutAccount ? t('profile.settings.bankTitle') : t('profile.settings.addBank'),
            text: payoutAccount
                ? t('profile.settings.bankText', {
                      ...BRAND_VALUES,
                      account: `${payoutAccount.bank_name} ${maskAccountNumber(payoutAccount.account_number)}`,
                      dot: DOT,
                  })
                : t('profile.settings.addBankText', BRAND_VALUES),
            onClick: () => setShowPayoutModal(true),
        },
        {
            icon: 'bi-key',
            title: t('profile.settings.password'),
            text: t('profile.settings.passwordText'),
            onClick: () => setShowChangePasswordModal(true),
        },
        {
            icon: 'bi-chat-left-dots',
            title: t('profile.settings.deleteChat', BRAND_VALUES),
            text: t('profile.settings.deleteChatText'),
            onClick: () => setConfirm('chat'),
        },
        onLogout && {
            icon: 'bi-box-arrow-right',
            title: t('profile.settings.signOut'),
            text: t('profile.settings.signOutText', BRAND_VALUES),
            onClick: () => setConfirm('logout'),
            danger: true,
        },
    ].filter(Boolean)

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>{t('dashboard.nav.profile')}</h1>
                    <p>{isOwner ? t('profile.subtitleOwner') : t('profile.subtitleBusiness')}</p>
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
                                <i className="bi bi-patch-check-fill"></i> {ACCOUNT_TYPE_LABEL[accountType] ? t(ACCOUNT_TYPE_LABEL[accountType]) : ''}
                            </span>
                            {since && <small className="ns-pf-since">{t('profile.memberSince', { date: since })}</small>}
                        </div>
                    </div>

                    <ul className="ns-pf-contact">
                        <li>
                            <i className="bi bi-envelope"></i>
                            <div>
                                <span>{t('profile.email')}</span>
                                <strong>{user.email}</strong>
                            </div>
                        </li>
                        <li>
                            <i className="bi bi-person-vcard"></i>
                            <div>
                                <span>DUI</span>
                                <strong>{showDui ? meta.dui || DASH : maskDui(meta.dui)}</strong>
                            </div>
                            {meta.dui && (
                                <button
                                    type="button"
                                    className="ns-pf-eye"
                                    onClick={() => setShowDui((v) => !v)}
                                    aria-label={showDui ? t('profile.hideDui') : t('profile.showDui')}
                                >
                                    <i className={`bi ${showDui ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                                </button>
                            )}
                        </li>
                    </ul>

                    <button type="button" className="ns-outline-btn ns-pf-edit" onClick={() => setShowEditModal(true)}>
                        <i className="bi bi-pencil"></i> {t('profile.edit')}
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
                                        {t('profile.saved.title')} {savedProperties.length > 0 && <em>{savedProperties.length}</em>}
                                    </h3>
                                    {savedProperties.length > PREVIEW_COUNT && (
                                        <button type="button" className="ns-link-btn" onClick={() => setShowAll((v) => !v)}>
                                            {showAll ? t('profile.saved.showLess') : t('profile.saved.viewAll')}
                                        </button>
                                    )}
                                </div>

                                {loadingSaved ? (
                                    <p className="ns-pf-muted">{t('profile.saved.loading')}</p>
                                ) : savedProperties.length === 0 ? (
                                    <div className="ns-pf-empty">
                                        <i className="bi bi-bookmark-heart"></i>
                                        <p>{t('profile.saved.empty')}</p>
                                        <button type="button" className="ns-outline-btn" onClick={() => onNavigate('home')}>
                                            {t('profile.saved.browse')}
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
                                                            {availabilityLabel(unavailable ? p.availability : 'Available')}
                                                        </span>
                                                    </div>
                                                    <div className="ns-pf-saved-info">
                                                        <strong>{p.property_name}</strong>
                                                        <span>{[p.municipality, p.department].filter(Boolean).join(', ') || propertyTypeLabel(p.property_type)}</span>
                                                        <em>
                                                            {p.monthly_rent != null ? (
                                                                <>
                                                                    {money(p.monthly_rent)}
                                                                    <small>{t('common.perMonth')}</small>
                                                                </>
                                                            ) : (
                                                                t('propertyCard.priceOnRequest')
                                                            )}
                                                        </em>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="ns-pf-saved-remove"
                                                        title={t('propertyCard.unsave')}
                                                        aria-label={t('profile.saved.removeName', { name: p.property_name })}
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
                            <h3>{t('dashboard.navGroups.account')}</h3>
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
                        setNotice(t('profile.bankSaved'))
                        setTimeout(() => setNotice(''), 3500)
                    }}
                    onClose={() => setShowPayoutModal(false)}
                />
            )}

            {confirm === 'chat' && (
                <ConfirmDialog
                    icon="bi-chat-left-dots"
                    title={t('profile.confirmChat.title', BRAND_VALUES)}
                    description={t('profile.confirmChat.description', BRAND_VALUES)}
                    confirmLabel={t('profile.confirmChat.confirm')}
                    onConfirm={handleClearChat}
                    onCancel={() => setConfirm(null)}
                />
            )}

            {confirm === 'logout' && (
                <ConfirmDialog
                    icon="bi-box-arrow-right"
                    title={t('profile.confirmLogout.title')}
                    description={t('profile.confirmLogout.description')}
                    confirmLabel={t('profile.settings.signOut')}
                    onConfirm={onLogout}
                    onCancel={() => setConfirm(null)}
                />
            )}
        </>
    )
}
