import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { propertyTypeLabel, serviceLabel } from '../../lib/displayValues'
import { BRAND_VALUES } from '../../lib/brand'
import { DASH, DOT, MINUS, SQ_M } from '../../lib/symbols'
import { supabase } from '../../lib/supabaseClient'
import { LISTING_STATUS } from '../../lib/propertyTypes'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import { PROPERTY_SERVICES_FULL_EMBED, PROPERTY_SERVICE_NAMES_EMBED, withServiceNames, withServices } from '../../lib/propertyServices'
import { createNotification } from '../../lib/notifications'
import { openConversation } from '../../lib/chat'
import { SERVICE_ICON, areaOf, daysSince, listingChecklist, listingScore, locationOf, typeIcon } from '../../lib/listings'
import { formatDueDate } from '../../lib/rentSchedule'
import { money, personName } from '../../lib/contracts'
import { formatPpm, loadMarketStats, priceInsight } from '../../lib/market'
import { setSaved as persistSaved } from '../../lib/savedProperties'
import PropertyCard from './PropertyCard'
import NewPropertyModal from './NewPropertyModal'
import ConfirmDialog from './ConfirmDialog'
import PropertyGallery from './property/PropertyGallery'
import PriceMarketBar from './property/PriceMarketBar'
import ViewsChart from './property/ViewsChart'
import './listings.css'
import './property/property.css'

const OWNER_EMBED = 'users!add_business_owner_id_fkey(first_name,last_name)'

function toAdvisorPropertyCard(detail) {
    return {
        property_id: detail.property_id,
        property_name: detail.property_name,
        description: detail.description || null,
        monthly_rent: detail.monthly_rent != null ? Number(detail.monthly_rent) : null,
        property_type: detail.property_type,
        department: detail.department,
        municipality: detail.municipality,
        address: detail.address,
        photo_url: detail.photo_url || null,
        services: detail.service_names || [],
    }
}

function listedAgo(ts) {
    const d = daysSince(ts)
    if (d == null) return null
    if (d === 0) return i18n.t('propertyDetail.listedToday')
    if (d < 30) return i18n.t('propertyDetail.listedDaysAgo', { count: d })
    const months = Math.round(d / 30)
    return i18n.t('propertyDetail.listedMonthsAgo', { count: months })
}

// What businesses read about the space: description, amenities, location.
function ListingContent({ detail }) {
    const { t } = useTranslation()
    return (
        <>
            <section className="ns-pd-section">
                <h3>{t('propertyDetail.about')}</h3>
                <p className="ns-pd-desc">
                    {detail.description || t('propertyDetail.noDescription', BRAND_VALUES)}
                </p>
            </section>

            <section className="ns-pd-section">
                <h3>{t('propertyCard.amenities')}</h3>
                {detail.service_names?.length > 0 ? (
                    <ul className="ns-amenity-list">
                        {detail.service_names.map((name) => (
                            <li key={name}>
                                <i className={`bi ${SERVICE_ICON[name] || 'bi-check2'}`}></i> {serviceLabel(name)}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="ns-pay-muted mb-0">{t('propertyDetail.noAmenities')}</p>
                )}
            </section>

            <section className="ns-pd-section">
                <h3>{t('compare.location')}</h3>
                <p className="ns-pd-location">
                    <i className="bi bi-geo-alt-fill"></i>
                    <span>
                        <strong>{locationOf(detail) || t('propertyDetail.locationOnRequest')}</strong>
                        {detail.address && <small>{detail.address}</small>}
                    </span>
                </p>
            </section>
        </>
    )
}

export default function PropertyDetailPage({ property, user, accountType, onBack, onAskRony, onViewProperty, onNavigate, backLabel }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const isBusiness = accountType === 'business'
    const isOwnerView = accountType === 'property-owner'

    const [detail, setDetail] = useState(property || null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [marketStats, setMarketStats] = useState(null)

    // Business
    const [tenantDui, setTenantDui] = useState(null)
    const [openRequest, setOpenRequest] = useState(null) // 'Pending' | 'Offered' | 'Active' | null
    const [requesting, setRequesting] = useState(false)
    const [requestError, setRequestError] = useState('')
    const [requestSuccess, setRequestSuccess] = useState(false)
    const [saved, setSaved] = useState(false)
    const [similar, setSimilar] = useState([])
    const [contacting, setContacting] = useState(false)

    // Owner
    const [tab, setTab] = useState('overview')
    const [ownerDui, setOwnerDui] = useState(null)
    const [ownerContracts, setOwnerContracts] = useState([])
    const [stats, setStats] = useState(null)
    const [viewDays, setViewDays] = useState([])
    const [modal, setModal] = useState(null) // 'edit' | 'duplicate' | 'delete'
    const [busy, setBusy] = useState(false)
    const [actionError, setActionError] = useState('')

    const load = useCallback(async () => {
        if (!property?.property_id) {
            setLoading(false)
            return
        }
        const embed = isOwnerView ? PROPERTY_SERVICES_FULL_EMBED : PROPERTY_SERVICE_NAMES_EMBED
        const { data, error } = await supabase
            .from('add_business')
            .select(`*, ${PROPERTY_PHOTO_EMBED}, ${embed}, ${OWNER_EMBED}`)
            .eq('property_id', property.property_id)
            .single()
        if (error || !data) {
            setLoadError(i18n.t('propertyDetail.loadError'))
            setLoading(false)
            return
        }
        setDetail(isOwnerView ? withServices(withCoverPhoto(data)) : withServiceNames(withCoverPhoto(data)))
        setLoading(false)
    }, [property?.property_id, isOwnerView])

    useEffect(() => {
        setLoading(true)
        setLoadError('')
        setTab('overview')
        load()
        window.scrollTo({ top: 0 })
    }, [load])

    useEffect(() => {
        let cancelled = false
        loadMarketStats().then((m) => !cancelled && setMarketStats(m))
        return () => {
            cancelled = true
        }
    }, [])

    // ---------- Business data ----------
    useEffect(() => {
        let cancelled = false
        if (!isBusiness || !user?.id || !detail?.property_id) return undefined

        const run = async () => {
            supabase.rpc('record_property_view', { p_property_id: detail.property_id }).then(() => {})

            const [{ data: userRow }, { data: savedRow }] = await Promise.all([
                supabase.from('users').select('dui').eq('id_supabase_auth', user.id).single(),
                supabase.from('saved_properties').select('id').eq('user_auth_id', user.id).eq('property_id', detail.property_id).maybeSingle(),
            ])
            if (cancelled) return
            setSaved(Boolean(savedRow))
            if (!userRow?.dui) {
                setRequestError(i18n.t('propertyDetail.noDui'))
                return
            }
            setTenantDui(userRow.dui)
            const { data: existing } = await supabase
                .from('contract')
                .select('status')
                .eq('property_id', detail.property_id)
                .eq('tenant_dui', userRow.dui)
                .in('status', ['Pending', 'Offered', 'Active'])
            if (cancelled) return
            const statuses = (existing || []).map((c) => c.status)
            setOpenRequest(['Active', 'Offered', 'Pending'].find((s) => statuses.includes(s)) || null)
        }
        run()
        return () => {
            cancelled = true
        }
    }, [isBusiness, user?.id, detail?.property_id])

    // Other listed spaces of the same type or in the same municipality.
    useEffect(() => {
        let cancelled = false
        if (!isBusiness || !detail?.property_id) return undefined
        const filters = [`property_type.eq.${JSON.stringify(detail.property_type)}`]
        if (detail.municipality) filters.push(`municipality.eq.${JSON.stringify(detail.municipality)}`)
        supabase
            .from('add_business')
            .select(`*, ${PROPERTY_PHOTO_EMBED}, ${PROPERTY_SERVICE_NAMES_EMBED}`)
            .eq('availability', 'Available')
            .neq('property_id', detail.property_id)
            .or(filters.join(','))
            .order('registration_date', { ascending: false })
            .limit(12)
            .then(({ data }) => {
                if (cancelled) return
                const rows = (data || []).map((r) => withServiceNames(withCoverPhoto(r)))
                const score = (r) => (r.property_type === detail.property_type ? 2 : 0) + (r.municipality === detail.municipality ? 1 : 0)
                setSimilar(rows.sort((a, b) => score(b) - score(a)).slice(0, 3))
            })
        return () => {
            cancelled = true
        }
    }, [isBusiness, detail?.property_id, detail?.property_type, detail?.municipality])

    // ---------- Owner data ----------
    const loadOwnerData = useCallback(async () => {
        if (!isOwnerView || !property?.property_id) return
        const [{ data: contracts }, { data: statRows }, { data: days }, { data: me }] = await Promise.all([
            supabase
                .from('contract')
                .select('contract_id, status, end_date, closed_at, users!contract_tenant_dui_fkey(first_name,last_name)')
                .eq('property_id', property.property_id),
            supabase.rpc('owner_listing_stats'),
            supabase.rpc('owner_property_views', { p_property_id: property.property_id }),
            user?.id ? supabase.from('users').select('dui').eq('id_supabase_auth', user.id).single() : Promise.resolve({ data: null }),
        ])
        setOwnerContracts(contracts || [])
        setStats((statRows || []).find((r) => r.property_id === property.property_id) || null)
        setViewDays(days || [])
        if (me?.dui) setOwnerDui(me.dui)
    }, [isOwnerView, property?.property_id, user?.id])

    useEffect(() => {
        loadOwnerData()
    }, [loadOwnerData])

    // ---------- Actions ----------
    const handleRequestContract = async () => {
        if (!tenantDui || !detail || detail.availability !== 'Available') return
        setRequesting(true)
        setRequestError('')
        setRequestSuccess(false)
        const { data, error } = await supabase
            .from('contract')
            .insert({
                property_id: detail.property_id,
                business_id: detail.business_id,
                tenant_dui: tenantDui,
                monthly_rent: detail.monthly_rent,
                status: 'Pending',
                start_date: null,
                end_date: null,
            })
            .select()
        setRequesting(false)
        if (error || !data?.length) {
            setRequestError(error ? describeSupabaseError(error) : t('propertyDetail.requestFailed'))
            return
        }
        createNotification({
            recipientDui: detail.owner_id,
            senderDui: tenantDui,
            process: 'Contracts',
            title: `New contract request: ${detail.property_name}`,
            description: 'A business requested to lease this property.',
            contractId: data[0].contract_id,
        })
        setRequestSuccess(true)
        setOpenRequest('Pending')
    }

    // Opens (or reuses) the chat with the owner about this space. Without a
    // session there is no one to write as, so it goes to the login first.
    const handleContactOwner = async () => {
        const { data: auth } = await supabase.auth.getSession()
        if (!auth?.session) {
            navigate('/', { state: { view: 'login' } })
            return
        }
        if (!tenantDui || !detail) return
        setContacting(true)
        setRequestError('')
        const { conversationId, error } = await openConversation(detail.property_id, tenantDui)
        setContacting(false)
        if (error || !conversationId) {
            setRequestError(error ? describeSupabaseError(error) : t('messages.openFailed'))
            return
        }
        onNavigate?.('messages', { conversationId })
    }

    const toggleSave = async () => {
        if (!user?.id || !detail) return
        const next = !saved
        setSaved(next)
        if (!(await persistSaved(user.id, detail.property_id, next))) setSaved(!next)
    }

    const askRony = (text) =>
        onAskRony?.(text ? { text } : { text: t('propertyDetail.ask.fit', { name: detail.property_name }), property: toAdvisorPropertyCard(detail) })

    const togglePause = async () => {
        setBusy(true)
        setActionError('')
        const next = detail.availability === 'Reserved' ? 'Available' : 'Reserved'
        const { data, error } = await supabase.from('add_business').update({ availability: next }).eq('property_id', detail.property_id).select('availability')
        setBusy(false)
        if (error || !data?.length) {
            setActionError(error ? describeSupabaseError(error) : t('propertyDetail.updateFailed'))
            return
        }
        setDetail((d) => ({ ...d, availability: next }))
    }

    const handleDelete = async () => {
        setBusy(true)
        setActionError('')
        const { data, error } = await supabase.from('add_business').delete().eq('property_id', detail.property_id).select()
        setBusy(false)
        setModal(null)
        if (error || !data?.length) {
            setActionError(error ? describeSupabaseError(error) : t('propertyDetail.deleteFailed'))
            return
        }
        onBack()
    }

    if (!property) return null

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>{t('propertyDetail.loading')}</p>
            </div>
        )
    }

    if (loadError || !detail) {
        return (
            <div className="ns-detail-page">
                <button type="button" className="ns-detail-back" onClick={onBack}>
                    <i className="bi bi-arrow-left"></i> {backLabel || t('common.back')}
                </button>
                <div className="alert alert-danger py-2 mt-3" role="alert">
                    {loadError || t('propertyDetail.notFound')}
                </div>
            </div>
        )
    }

    const area = areaOf(detail)
    const insight = priceInsight(detail, marketStats)
    const ownerName = personName(detail.users)
    const status = LISTING_STATUS[detail.availability] || LISTING_STATUS.Available

    const header = (
        <>
            <button type="button" className="ns-detail-back" onClick={onBack}>
                <i className="bi bi-arrow-left"></i> {backLabel || t('common.back')}
            </button>

            <PropertyGallery
                property={detail}
                badge={
                    isOwnerView ? (
                        <span className={`ns-own-badge tone-${status.tone} ns-pg-badge`}>
                            <i className={`bi ${status.icon}`}></i> {status.label}
                        </span>
                    ) : null
                }
            />

            <div className="ns-pd-head">
                <div className="ns-pd-title">
                    <span className="ns-pd-type">
                        <i className={`bi ${typeIcon(detail.property_type)}`}></i> {propertyTypeLabel(detail.property_type)}
                    </span>
                    <h1>{detail.property_name}</h1>
                    <p>
                        <i className="bi bi-geo-alt"></i> {locationOf(detail) || t('propertyDetail.locationOnRequest')}
                    </p>
                </div>
                <div className="ns-pd-facts">
                    <div>
                        <strong>{detail.monthly_rent != null ? money(detail.monthly_rent) : DASH}</strong>
                        <small>{t('propertyDetail.perMonth')}</small>
                    </div>
                    <div>
                        <strong>{area ? `${area} ${SQ_M}` : DASH}</strong>
                        <small>
                            {t('propertyDetail.dimensions', { width: detail.business_size_width, length: detail.business_size_length })}
                        </small>
                    </div>
                    <div>
                        <strong>{insight ? formatPpm(insight.ppm) : DASH}</strong>
                        <small>{t('propertyDetail.perM2', { unit: SQ_M })}</small>
                    </div>
                    <div>
                        <strong>{detail.service_names?.length || 0}</strong>
                        <small>{t('propertyDetail.amenitiesCount', { count: detail.service_names?.length || 0 })}</small>
                    </div>
                </div>
            </div>
        </>
    )

    // ===================== Business view =====================
    if (!isOwnerView) {
        const cta =
            openRequest === 'Active' ? (
                <button type="button" className="ns-filled-btn" onClick={() => onNavigate?.('contracts')}>
                    <i className="bi bi-key"></i> {t('propertyDetail.cta.leased')}
                </button>
            ) : openRequest === 'Offered' ? (
                <button type="button" className="ns-filled-btn is-warm" onClick={() => onNavigate?.('contracts')}>
                    <i className="bi bi-pen"></i> {t('propertyDetail.cta.reviewOffer')}
                </button>
            ) : openRequest === 'Pending' ? (
                <button type="button" className="ns-outline-btn" onClick={() => onNavigate?.('contracts')}>
                    <i className="bi bi-hourglass-split"></i> {t('propertyDetail.cta.waiting', { dot: DOT })}
                </button>
            ) : detail.availability === 'Available' && detail.monthly_rent != null ? (
                <button type="button" className="ns-filled-btn" onClick={handleRequestContract} disabled={requesting || !tenantDui}>
                    <i className="bi bi-file-earmark-text"></i> {requesting ? t('common.sending') : t('propertyDetail.cta.request')}
                </button>
            ) : null
        // Business accounts only, never on their own space, and only while the
        // owner can still be reached about it (listed, or a lease in progress).
        const canContact =
            !user?.id ||
            (isBusiness && Boolean(tenantDui) && tenantDui !== detail.owner_id && (detail.availability === 'Available' || Boolean(openRequest)))
        const yearly = detail.monthly_rent != null ? Number(detail.monthly_rent) * 12 : null
        const steps = [
            { icon: 'bi-send', label: t('propertyDetail.steps.request'), done: Boolean(openRequest) },
            { icon: 'bi-envelope-paper', label: t('propertyDetail.steps.offer'), done: openRequest === 'Offered' || openRequest === 'Active' },
            { icon: 'bi-pen', label: t('propertyDetail.steps.sign'), done: openRequest === 'Active' },
            { icon: 'bi-credit-card', label: t('propertyDetail.steps.pay', BRAND_VALUES), done: openRequest === 'Active' },
        ]

        return (
            <div className="ns-detail-page">
                {header}

                <div className="ns-pd-owner-bar">
                    <div className="ns-pd-tabs" role="tablist" aria-label={t('propertyDetail.about')}>
                        {[
                            { id: 'overview', label: t('propertyDetail.tabs.overview'), icon: 'bi-house' },
                            { id: 'price', label: t('propertyDetail.tabs.price'), icon: 'bi-tag', badge: insight && insight.tone === 'good' ? `${MINUS}${Math.abs(insight.pct)}%` : null },
                        ].map((tabItem) => (
                            <button type="button" key={tabItem.id} role="tab" aria-selected={tab === tabItem.id} className={tab === tabItem.id ? 'active' : ''} onClick={() => setTab(tabItem.id)}>
                                <i className={`bi ${tabItem.icon}`}></i> {tabItem.label}
                                {tabItem.badge && <em className="is-good">{tabItem.badge}</em>}
                            </button>
                        ))}
                    </div>
                    <div className="ns-pd-owner-actions">
                        {cta}
                        {canContact && (
                            <button type="button" className="ns-outline-btn" onClick={handleContactOwner} disabled={contacting}>
                                <i className="bi bi-chat-dots"></i> {contacting ? t('messages.opening') : t('propertyDetail.contactOwner')}
                            </button>
                        )}
                        <button type="button" className={`ns-outline-btn ${saved ? 'is-saved' : ''}`} onClick={toggleSave} aria-pressed={saved}>
                            <i className={`bi ${saved ? 'bi-heart-fill' : 'bi-heart'}`}></i> {saved ? t('propertyCard.saved') : t('propertyCard.save')}
                        </button>
                        {onAskRony && (
                            <button type="button" className="ns-outline-btn" onClick={() => askRony()}>
                                <i className="bi bi-stars"></i> {t('insights.owner.askRony', BRAND_VALUES)}
                            </button>
                        )}
                    </div>
                </div>

                {requestError && (
                    <div className="alert alert-danger py-2" role="alert">
                        {requestError}
                    </div>
                )}
                {requestSuccess && (
                    <div className="alert alert-success py-2" role="status">
                        {t('propertyDetail.requestSent')}
                    </div>
                )}
                {!cta && !openRequest && (
                    <div className="alert alert-secondary py-2" role="status">
                        {detail.monthly_rent == null
                            ? t('propertyDetail.noRent')
                            : t('propertyDetail.notTaking')}
                    </div>
                )}

                {tab === 'overview' && (
                    <div className="ns-pd-grid">
                        <div className="ns-pd-main">
                            <ListingContent detail={detail} />
                        </div>
                        <aside className="ns-pd-side">
                            <div className="ns-pd-card">
                                <h3 className="ns-pd-card-title">{t('propertyDetail.glance')}</h3>
                                <ul className="ns-pd-glance">
                                    <li>
                                        <i className={`bi ${typeIcon(detail.property_type)}`}></i>
                                        <span>{t('compare.type')}</span>
                                        <strong>{propertyTypeLabel(detail.property_type)}</strong>
                                    </li>
                                    <li>
                                        <i className="bi bi-bounding-box"></i>
                                        <span>{t('compare.size')}</span>
                                        <strong>
                                            {area ? `${area} ${SQ_M}` : DASH}{' '}
                                            <small>({t('propertyDetail.dimensions', { width: detail.business_size_width, length: detail.business_size_length })})</small>
                                        </strong>
                                    </li>
                                    <li>
                                        <i className="bi bi-cash-stack"></i>
                                        <span>{t('propertyDetail.rent')}</span>
                                        <strong>{detail.monthly_rent != null ? `${money(detail.monthly_rent)}${t('common.perMonth')}` : t('compare.onRequest')}</strong>
                                    </li>
                                    <li>
                                        <i className="bi bi-calendar3"></i>
                                        <span>{t('propertyDetail.onBrand', BRAND_VALUES)}</span>
                                        <strong>{listedAgo(detail.registration_date) || DASH}</strong>
                                    </li>
                                </ul>
                                <div className="ns-pd-owner-row">
                                    <span className="ns-detail-owner-avatar">{(ownerName[0] || 'O').toUpperCase()}</span>
                                    <div>
                                        <strong>{ownerName}</strong>
                                        <small>{t('propertyDetail.ownerAnswers', { dot: DOT })}</small>
                                    </div>
                                </div>
                            </div>

                            <div className="ns-pd-card ns-pd-steps-card">
                                <h3 className="ns-pd-card-title">{t('propertyDetail.howLeasing')}</h3>
                                <ol className="ns-pd-steps">
                                    {steps.map((st) => (
                                        <li key={st.label} className={st.done ? 'is-done' : ''}>
                                            <span>
                                                <i className={`bi ${st.done ? 'bi-check-lg' : st.icon}`}></i>
                                            </span>
                                            {st.label}
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        </aside>
                    </div>
                )}

                {tab === 'price' && (
                    <div className="ns-pd-panels">
                        <section className="ns-pd-section">
                            <h3>{t('propertyDetail.priceVsSimilar')}</h3>
                            {insight ? (
                                <PriceMarketBar insight={insight} />
                            ) : (
                                <p className="ns-pay-muted mb-0">{t('propertyDetail.notEnoughSimilar', BRAND_VALUES)}</p>
                            )}
                        </section>
                        <section className="ns-pd-section">
                            <h3>{t('propertyDetail.whatItCosts')}</h3>
                            <div className="ns-pd-mini">
                                <div>
                                    <strong>{detail.monthly_rent != null ? money(detail.monthly_rent) : DASH}</strong>
                                    <small>{t('propertyDetail.perMonth')}</small>
                                </div>
                                <div>
                                    <strong>{yearly != null ? money(yearly) : DASH}</strong>
                                    <small>{t('propertyDetail.perYear')}</small>
                                </div>
                                <div>
                                    <strong>{insight ? formatPpm(insight.ppm) : area && detail.monthly_rent != null ? formatPpm(Number(detail.monthly_rent) / area) : DASH}</strong>
                                    <small>{t('propertyDetail.perM2', { unit: SQ_M })}</small>
                                </div>
                            </div>
                            <p className="ns-pd-hint">
                                {t('propertyDetail.offerHint')}
                            </p>
                            {onAskRony && detail.monthly_rent != null && (
                                <button
                                    type="button"
                                    className="ns-rony-write mt-2"
                                    onClick={() =>
                                        askRony(
                                            t('propertyDetail.ask.goodPrice', {
                                                rent: money(detail.monthly_rent),
                                                name: detail.property_name,
                                                type: propertyTypeLabel(detail.property_type),
                                                area: area || '?',
                                                unit: SQ_M,
                                                place: locationOf(detail) || 'El Salvador',
                                                market: insight ? t('propertyDetail.ask.goodPriceMarket', { ppm: formatPpm(insight.ppm), median: formatPpm(insight.median) }) : '',
                                            })
                                        )
                                    }
                                >
                                    <i className="bi bi-stars"></i> {t('propertyDetail.askGoodPrice', BRAND_VALUES)}
                                </button>
                            )}
                        </section>
                    </div>
                )}

                {similar.length > 0 && (
                    <section className="ns-similar">
                        <h2>{t('propertyDetail.similar')}</h2>
                        <div className="ns-mk-grid">
                            {similar.map((p) => (
                                <PropertyCard key={p.property_id} property={p} onOpen={onViewProperty} insight={priceInsight(p, marketStats)} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        )
    }

    // ===================== Owner view =====================
    const active = ownerContracts.find((c) => c.status === 'Active')
    const offer = ownerContracts.find((c) => c.status === 'Offered')
    const requests = ownerContracts.filter((c) => c.status === 'Pending')
    const hasHistory = ownerContracts.length > 0
    const lastClosed = ownerContracts.map((c) => c.closed_at).filter(Boolean).sort().pop()
    const vacantDays = active ? null : daysSince(lastClosed || detail.registration_date)
    const missed = !active && detail.monthly_rent != null && vacantDays > 0 ? Math.round((Number(detail.monthly_rent) / 30) * vacantDays) : 0
    const checklist = listingChecklist(detail)
    const score = listingScore(detail)

    return (
        <div className="ns-detail-page">
            {header}

            {actionError && (
                <div className="alert alert-danger d-flex justify-content-between align-items-center gap-2 py-2" role="alert">
                    <span>{actionError}</span>
                    <button type="button" className="btn-close" aria-label={t('common.dismiss')} onClick={() => setActionError('')} />
                </div>
            )}

            <div className="ns-pd-owner-bar">
                <div className="ns-pd-tabs" role="tablist" aria-label={t('propertyDetail.manage')}>
                    {[
                        { id: 'overview', label: t('propertyDetail.tabs.overview'), icon: 'bi-house' },
                        { id: 'performance', label: t('propertyDetail.tabs.performance'), icon: 'bi-graph-up' },
                        { id: 'listing', label: t('propertyDetail.tabs.listing'), icon: 'bi-card-text', badge: score < 100 ? `${score}%` : null },
                    ].map((tabItem) => (
                        <button type="button" key={tabItem.id} role="tab" aria-selected={tab === tabItem.id} className={tab === tabItem.id ? 'active' : ''} onClick={() => setTab(tabItem.id)}>
                            <i className={`bi ${tabItem.icon}`}></i> {tabItem.label}
                            {tabItem.badge && <em>{tabItem.badge}</em>}
                        </button>
                    ))}
                </div>
                <div className="ns-pd-owner-actions">
                    <button type="button" className="ns-filled-btn" onClick={() => setModal('edit')} disabled={!ownerDui}>
                        <i className="bi bi-pencil"></i> {t('common.edit')}
                    </button>
                    <button type="button" className="ns-outline-btn" onClick={() => setModal('duplicate')} disabled={!ownerDui}>
                        <i className="bi bi-copy"></i> {t('propertyDetail.duplicate')}
                    </button>
                    {!active && (
                        <button type="button" className="ns-outline-btn" onClick={togglePause} disabled={busy}>
                            <i className={`bi ${detail.availability === 'Reserved' ? 'bi-play-circle' : 'bi-pause-circle'}`}></i>{' '}
                            {detail.availability === 'Reserved' ? t('propertyDetail.resume') : t('propertyDetail.pause')}
                        </button>
                    )}
                    {!hasHistory && (
                        <button type="button" className="ns-outline-btn is-danger" onClick={() => setModal('delete')} aria-label={t('propertyDetail.deleteListing')} title={t('propertyDetail.deleteListing')}>
                            <i className="bi bi-trash"></i>
                        </button>
                    )}
                </div>
            </div>

            {tab === 'overview' && (
                <div className="ns-pd-panels">
                    <section className="ns-pd-section">
                        <h3>{t('propertyDetail.now.title')}</h3>
                        {active ? (
                            <div className="ns-pd-now tone-info">
                                <i className="bi bi-key-fill"></i>
                                <div>
                                    <strong>{t('propertyDetail.now.leasedTo', { name: personName(active.users) })}</strong>
                                    <span>{t('propertyDetail.now.until', { date: formatDueDate(active.end_date) })}</span>
                                </div>
                                <div className="ns-pd-now-actions">
                                    <button type="button" className="ns-outline-btn" onClick={() => onNavigate?.('contracts', { contractId: active.contract_id })}>
                                        {t('propertyDetail.now.contract')}
                                    </button>
                                    <button type="button" className="ns-outline-btn" onClick={() => onNavigate?.('payments', { contractId: active.contract_id })}>
                                        {t('propertyDetail.rent')}
                                    </button>
                                </div>
                            </div>
                        ) : offer ? (
                            <div className="ns-pd-now tone-warning">
                                <i className="bi bi-pen-fill"></i>
                                <div>
                                    <strong>{t('propertyDetail.now.offerSent', { name: personName(offer.users) })}</strong>
                                    <span>{t('propertyDetail.now.waitingSignature')}</span>
                                </div>
                                <div className="ns-pd-now-actions">
                                    <button type="button" className="ns-outline-btn" onClick={() => onNavigate?.('contracts', { contractId: offer.contract_id })}>
                                        {t('propertyDetail.now.openOffer')}
                                    </button>
                                </div>
                            </div>
                        ) : requests.length > 0 ? (
                            <div className="ns-pd-now tone-hot">
                                <i className="bi bi-inbox-fill"></i>
                                <div>
                                    <strong>
                                        {t('propertyDetail.now.wanted', { count: requests.length })}
                                    </strong>
                                    <span>{requests.map((r) => personName(r.users)).join(', ')}</span>
                                </div>
                                <div className="ns-pd-now-actions">
                                    <button
                                        type="button"
                                        className="ns-filled-btn"
                                        onClick={() => onNavigate?.('contracts', { contractId: requests.length === 1 ? requests[0].contract_id : null })}
                                    >
                                        {t('notifications.actions.answer')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="ns-pd-now tone-neutral">
                                <i className={`bi ${detail.availability === 'Reserved' ? 'bi-pause-circle-fill' : 'bi-broadcast'}`}></i>
                                <div>
                                    <strong>{detail.availability === 'Reserved' ? t('values.listingStatus.reserved') : t('propertyDetail.now.listedWaiting')}</strong>
                                    <span>
                                        {detail.availability === 'Reserved'
                                            ? t('propertyDetail.now.pausedHint')
                                            : `${vacantDays === 0 ? t('propertyDetail.now.vacantToday') : t('propertyDetail.now.vacantFor', { count: vacantDays })}${
                                                  missed ? ` ${DOT} ${t('propertyDetail.now.missed', { amount: money(missed) })}` : ''
                                              }`}
                                    </span>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="ns-pd-section">
                        <h3>{t('propertyDetail.interest.title')}</h3>
                        <div className="ns-pd-mini">
                            <div>
                                <strong>{stats?.views_30d ?? 0}</strong>
                                <small>{t('propertyDetail.interest.views30')}</small>
                            </div>
                            <div>
                                <strong>{stats?.saves ?? 0}</strong>
                                <small>{t('propertyDetail.interest.saved')}</small>
                            </div>
                            <div>
                                <strong>{stats?.requests_total ?? 0}</strong>
                                <small>{t('propertyDetail.interest.requestsAll')}</small>
                            </div>
                        </div>
                        <button type="button" className="ns-link-btn mt-2" onClick={() => setTab('performance')}>
                            {t('propertyDetail.interest.seePerformance')} <i className="bi bi-arrow-right"></i>
                        </button>
                    </section>
                </div>
            )}

            {tab === 'performance' && (
                <div className="ns-pd-panels">
                    <section className="ns-pd-section">
                        <h3>{t('propertyDetail.performance.views')}</h3>
                        <ViewsChart days={viewDays} />
                        <div className="ns-pd-mini mt-3">
                            <div>
                                <strong>{stats?.saves ?? 0}</strong>
                                <small>{t('propertyDetail.performance.saved')}</small>
                            </div>
                            <div>
                                <strong>{stats?.requests_total ?? 0}</strong>
                                <small>{t('propertyDetail.performance.requests')}</small>
                            </div>
                            <div>
                                <strong>{stats?.views_total ?? 0}</strong>
                                <small>{t('propertyDetail.performance.viewsAll')}</small>
                            </div>
                        </div>
                        <p className="ns-pd-hint">
                            {(stats?.views_30d || 0) >= 10 && (stats?.requests_total || 0) === 0
                                ? t('propertyDetail.performance.lookNoRequest')
                                : (stats?.views_30d || 0) === 0 && !active
                                  ? t('propertyDetail.performance.noViews')
                                  : t('propertyDetail.performance.privacy')}
                        </p>
                    </section>

                    <section className="ns-pd-section">
                        <h3>{t('propertyDetail.performance.yourPrice')}</h3>
                        {insight ? (
                            <PriceMarketBar insight={insight} />
                        ) : (
                            <p className="ns-pay-muted">{t('propertyDetail.notEnoughSimilar', BRAND_VALUES)}</p>
                        )}
                        {!active && missed > 0 && (
                            <p className="ns-pd-missed">
                                <i className="bi bi-hourglass-split"></i> {t('propertyDetail.performance.vacantMissed', { count: vacantDays, amount: money(missed) })}
                            </p>
                        )}
                        {onAskRony && detail.monthly_rent != null && (
                            <button
                                type="button"
                                className="ns-rony-write mt-2"
                                onClick={() =>
                                    askRony(
                                        t('propertyDetail.ask.whatRent', {
                                            name: detail.property_name,
                                            type: propertyTypeLabel(detail.property_type),
                                            area: area || '?',
                                            unit: SQ_M,
                                            place: locationOf(detail) || 'El Salvador',
                                            rent: money(detail.monthly_rent),
                                            market: insight ? t('propertyDetail.ask.whatRentMarket', { ppm: formatPpm(insight.ppm), median: formatPpm(insight.median) }) : '',
                                            views: stats?.views_30d ?? 0,
                                            requests: stats?.requests_total ?? 0,
                                        })
                                    )
                                }
                            >
                                <i className="bi bi-stars"></i> {t('propertyDetail.askPrice', BRAND_VALUES)}
                            </button>
                        )}
                    </section>
                </div>
            )}

            {tab === 'listing' && (
                <div className="ns-pd-grid">
                    <div className="ns-pd-main">
                        <p className="ns-pd-preview-note">
                            <i className="bi bi-eye"></i> {t('propertyDetail.previewNote')}
                        </p>
                        <ListingContent detail={detail} />
                    </div>
                    <aside className="ns-pd-side">
                        <div className="ns-pd-card">
                            <div className="ns-own-quality-head">
                                <span>{t('ownerHome.listingQuality')}</span>
                                <strong className={score === 100 ? 'is-good' : score < 60 ? 'is-bad' : ''}>{score}%</strong>
                            </div>
                            <div className="ns-own-quality-track">
                                <div style={{ width: `${score}%` }} className={score === 100 ? 'is-good' : score < 60 ? 'is-bad' : ''} />
                            </div>
                            <ul className="ns-pd-checklist">
                                {checklist.map((item) => (
                                    <li key={item.id} className={item.done ? 'is-done' : ''}>
                                        <i className={`bi ${item.done ? 'bi-check-circle-fill' : 'bi-circle'}`}></i> {item.label}
                                    </li>
                                ))}
                            </ul>
                            {score < 100 && (
                                <button type="button" className="ns-submit-btn" onClick={() => setModal('edit')} disabled={!ownerDui}>
                                    {t('propertyDetail.complete')}
                                </button>
                            )}
                        </div>
                    </aside>
                </div>
            )}

            {(modal === 'edit' || modal === 'duplicate') && ownerDui && (
                <NewPropertyModal
                    property={modal === 'edit' ? detail : null}
                    template={modal === 'duplicate' ? detail : null}
                    ownerDui={ownerDui}
                    onClose={() => setModal(null)}
                    onSaved={async (savedProperty) => {
                        setModal(null)
                        if (modal === 'duplicate' && savedProperty?.property_id) {
                            onViewProperty?.({ property_id: savedProperty.property_id })
                            return
                        }
                        await load()
                        await loadOwnerData()
                    }}
                />
            )}

            {modal === 'delete' && (
                <ConfirmDialog
                    icon="bi-trash"
                    title={t('propertyDetail.deleteConfirm.title')}
                    description={t('propertyDetail.deleteConfirm.description', { name: detail.property_name })}
                    confirmLabel={busy ? t('propertyDetail.deleteConfirm.deleting') : t('common.delete')}
                    cancelLabel={t('common.cancel')}
                    onConfirm={handleDelete}
                    onCancel={() => setModal(null)}
                />
            )}
        </div>
    )
}
