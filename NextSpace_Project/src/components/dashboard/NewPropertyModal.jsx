import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { money } from '../../lib/money'
import { propertyTypeLabel, serviceLabel } from '../../lib/displayValues'
import { BRAND_VALUES } from '../../lib/brand'
import { DASH, DOT, SQ_M } from '../../lib/symbols'
import { supabase } from '../../lib/supabaseClient'
import { EL_SALVADOR_DEPARTMENTS, EL_SALVADOR_DEPARTMENT_NAMES } from '../../lib/elSalvadorLocations'
import { SERVICE_ICON, listingChecklist, listingScore } from '../../lib/listings'
import { formatPpm, loadMarketStats, priceInsight } from '../../lib/market'
import { PROPERTY_TYPES, TYPE_ICON } from '../../lib/propertyTypes'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import PropertyCard from './PropertyCard'
import PriceMarketBar from './property/PriceMarketBar'
import FeeBreakdown from './payments/FeeBreakdown'
import { formatRate } from '../../lib/platformFee'
import usePlatformFee from '../../hooks/usePlatformFee'
import './listings.css'
import './property/property.css'
import './listingForm.css'

const LocationPicker = lazy(() => import('./map/LocationPicker'))

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_URL_MARKER = '/property-photos/'
const MAX_PHOTOS = 6
const DESCRIPTION_GOOD = 40

const STEPS = [
    { id: 'basics', label: 'listingForm.steps.basics', icon: 'bi-shop', fields: ['name', 'width', 'length'] },
    { id: 'location', label: 'listingForm.steps.location', icon: 'bi-geo-alt', fields: [] },
    { id: 'price', label: 'listingForm.steps.price', icon: 'bi-currency-dollar', fields: ['rent'] },
    { id: 'details', label: 'listingForm.steps.details', icon: 'bi-images', fields: [] },
]

// Where each quality-checklist item is filled in.
const CHECK_STEP = { photo: 'details', 'more-photos': 'details', rent: 'price', description: 'details', location: 'location', services: 'details' }

const DESCRIPTION_TIPS = ['listingForm.tips.traffic', 'listingForm.tips.condition', 'listingForm.tips.access']

function positive(value) {
    const n = Number(value)
    return value.trim() !== '' && !Number.isNaN(n) && n > 0
}

export default function NewPropertyModal({ property, template, ownerDui, onClose, onSaved }) {
    const { t } = useTranslation()
    // "Duplicate" starts a new listing from another one's details (no photos).
    const base = property || template || null
    const isEditMode = Boolean(property)

    const [propertyName, setPropertyName] = useState(template && !property ? t('listingForm.copyName', { name: template.property_name }) : property?.property_name || '')
    const [propertyType, setPropertyType] = useState(base?.property_type || PROPERTY_TYPES[0])
    const [monthlyRent, setMonthlyRent] = useState(base?.monthly_rent != null ? String(base.monthly_rent) : '')
    const [width, setWidth] = useState(base?.business_size_width != null ? String(base.business_size_width) : '')
    const [length, setLength] = useState(base?.business_size_length != null ? String(base.business_size_length) : '')
    // Occupied is set by the lease flow; owners only choose listed or paused.
    const isLeased = property?.availability === 'Occupied'
    const [listed, setListed] = useState(property?.availability !== 'Reserved')
    const [description, setDescription] = useState(base?.description || '')
    const [department, setDepartment] = useState(base?.department || '')
    const [municipality, setMunicipality] = useState(base?.municipality || '')
    const [address, setAddress] = useState(base?.address || '')
    const [pin, setPin] = useState(() =>
        base?.latitude != null && base?.longitude != null ? { lat: Number(base.latitude), lng: Number(base.longitude) } : null
    )
    // Up to 6 photos; the first one is the cover. Existing photos keep their
    // row id, new ones carry the file to upload.
    const [photoItems, setPhotoItems] = useState(() =>
        (property?.photos || (property?.photo_url ? [{ photo_id: null, photo_url: property.photo_url }] : [])).map((ph, i) => ({
            key: `old-${ph.photo_id ?? i}`,
            photoId: ph.photo_id,
            url: ph.photo_url,
            file: null,
        }))
    )
    const [removedPhotos, setRemovedPhotos] = useState([])
    const [photoError, setPhotoError] = useState('')
    const [dragging, setDragging] = useState(false)
    const [servicesList, setServicesList] = useState([])
    const [selectedServiceIds, setSelectedServiceIds] = useState(base?.service_ids || [])
    const [marketStats, setMarketStats] = useState(null)
    const [step, setStep] = useState(0)
    const [reached, setReached] = useState(isEditMode ? STEPS.length - 1 : 0)
    const [showErrors, setShowErrors] = useState(false)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    // Owners accept the NextSpace fee once, before their first new listing.
    // null while unknown; edits never ask.
    const [feeAccepted, setFeeAccepted] = useState(isEditMode ? true : null)
    const [feeChecked, setFeeChecked] = useState(false)
    const [feeError, setFeeError] = useState(false)
    const feeRate = usePlatformFee()
    const bodyRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        supabase
            .from('services')
            .select('service_id, service_name')
            .order('service_id')
            .then(({ data, error }) => {
                if (cancelled || error) return
                setServicesList(data || [])
            })
        loadMarketStats().then((stats) => {
            if (!cancelled) setMarketStats(stats)
        })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (isEditMode) return undefined
        let cancelled = false
        supabase
            .from('platform_fee_acceptance')
            .select('accepted_at')
            .maybeSingle()
            .then(({ data, error }) => {
                if (!cancelled) setFeeAccepted(error ? false : Boolean(data))
            })
        return () => {
            cancelled = true
        }
    }, [isEditMode])

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    // Field problems, shown under each field once the owner tries to move on.
    const fieldErrors = useMemo(() => {
        const errors = {}
        if (!propertyName.trim()) errors.name = 'listingForm.errors.name'
        if (!positive(width)) errors.width = 'listingForm.errors.width'
        if (!positive(length)) errors.length = 'listingForm.errors.length'
        if (monthlyRent.trim() !== '' && !positive(monthlyRent)) errors.rent = 'listingForm.errors.rent'
        return errors
    }, [propertyName, width, length, monthlyRent])

    const stepValid = (i) => STEPS[i].fields.every((f) => !fieldErrors[f])

    const area = positive(width) && positive(length) ? Math.round(Number(width) * Number(length)) : null
    const serviceNames = servicesList.filter((s) => selectedServiceIds.includes(s.service_id)).map((s) => s.service_name)

    // The listing as it will look on the Marketplace, rebuilt as the owner types.
    const preview = {
        property_id: property?.property_id ?? 0,
        property_name: propertyName.trim() || t('listingForm.yourSpace'),
        property_type: propertyType,
        monthly_rent: positive(monthlyRent) ? Number(monthlyRent) : null,
        business_size_width: positive(width) ? Number(width) : null,
        business_size_length: positive(length) ? Number(length) : null,
        department: department || null,
        municipality: municipality || null,
        description,
        photo_url: photoItems[0]?.url || null,
        photos: photoItems.map((p) => ({ photo_url: p.url })),
        service_ids: selectedServiceIds,
        service_names: serviceNames,
        registration_date: property?.registration_date || new Date().toISOString(),
    }
    const insight = priceInsight(preview, marketStats)
    const checklist = listingChecklist(preview)
    const score = listingScore(preview)
    const scoreTone = score >= 80 ? 'is-good' : score >= 50 ? 'is-mid' : 'is-low'

    // Market median for this type (and department when there are enough
    // spaces there) times the area: a starting point for the rent.
    const suggestion = useMemo(() => {
        if (!marketStats?.size || !area) return null
        const local = department ? marketStats.get(`${propertyType}|${department}`) : null
        const ref = local || marketStats.get(`${propertyType}|*`)
        if (!ref?.median) return null
        return {
            ppm: ref.median,
            rent: Math.max(10, Math.round((ref.median * area) / 10) * 10),
            local: Boolean(local),
        }
    }, [marketStats, area, propertyType, department])

    const goTo = (i) => {
        setStep(i)
        setReached((r) => Math.max(r, i))
        setShowErrors(false)
        bodyRef.current?.scrollTo({ top: 0 })
    }

    const next = () => {
        if (!stepValid(step)) {
            setShowErrors(true)
            return
        }
        goTo(step + 1)
    }

    const handleDepartmentChange = (value) => {
        setDepartment(value)
        setMunicipality(EL_SALVADOR_DEPARTMENTS[value]?.[0] || '')
    }

    const toggleService = (serviceId) => {
        setSelectedServiceIds((prev) =>
            prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
        )
    }

    const addFiles = (files) => {
        if (files.length === 0) return
        setPhotoError('')
        const room = MAX_PHOTOS - photoItems.length
        const accepted = []
        for (const file of files) {
            if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
                setPhotoError(t('listingForm.photos.badType'))
                continue
            }
            if (file.size > MAX_PHOTO_BYTES) {
                setPhotoError(t('listingForm.photos.tooBig'))
                continue
            }
            accepted.push(file)
        }
        if (accepted.length > room) setPhotoError(t('listingForm.photos.tooMany', { max: MAX_PHOTOS }))

        setPhotoItems((prev) => [
            ...prev,
            ...accepted.slice(0, Math.max(0, room)).map((file, i) => ({
                key: `new-${Date.now()}-${i}`,
                photoId: null,
                url: URL.createObjectURL(file),
                file,
            })),
        ])
    }

    const handlePhotoChange = (e) => {
        const files = Array.from(e.target.files || [])
        e.target.value = ''
        addFiles(files)
    }

    const dropHandlers = {
        onDragOver: (e) => {
            e.preventDefault()
            setDragging(true)
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e) => {
            e.preventDefault()
            setDragging(false)
            addFiles(Array.from(e.dataTransfer.files || []))
        },
    }

    const removePhoto = (key) => {
        const item = photoItems.find((p) => p.key === key)
        if (item?.photoId) setRemovedPhotos((prev) => [...prev, item])
        setPhotoItems((prev) => prev.filter((p) => p.key !== key))
        setPhotoError('')
    }

    const makeCover = (key) => {
        setPhotoItems((prev) => {
            const item = prev.find((p) => p.key === key)
            return item ? [item, ...prev.filter((p) => p.key !== key)] : prev
        })
    }

    const storagePath = (url) => {
        const idx = url?.indexOf(PHOTO_URL_MARKER)
        return idx != null && idx !== -1 ? url.slice(idx + PHOTO_URL_MARKER.length) : null
    }

    // Removed photos go first (so the 6-photo limit holds), then new uploads,
    // then every photo gets its position (0 = cover).
    const syncPhotos = async (propertyId) => {
        for (const old of removedPhotos) {
            const path = storagePath(old.url)
            if (path) await supabase.storage.from('property-photos').remove([path])
            const { error } = await supabase.from('business_photos').delete().eq('photo_id', old.photoId)
            if (error) return describeSupabaseError(error)
        }

        for (const [index, item] of photoItems.entries()) {
            if (item.file) {
                const ext = item.file.name.split('.').pop()
                const path = `${propertyId}/${Date.now()}-${index}.${ext}`
                const { error: uploadError } = await supabase.storage.from('property-photos').upload(path, item.file)
                if (uploadError) return describeSupabaseError(uploadError)
                const {
                    data: { publicUrl },
                } = supabase.storage.from('property-photos').getPublicUrl(path)
                const { error: rowError } = await supabase
                    .from('business_photos')
                    .insert({ property_id: propertyId, photo_url: publicUrl, sort_order: index })
                if (rowError) return describeSupabaseError(rowError)
            } else if (item.photoId) {
                const { error } = await supabase.from('business_photos').update({ sort_order: index }).eq('photo_id', item.photoId)
                if (error) return describeSupabaseError(error)
            }
        }
        return null
    }

    const syncServices = async (businessId) => {
        const { error: deleteError } = await supabase
            .from('business_services')
            .delete()
            .eq('business_id', businessId)
            .select()
        if (deleteError) return describeSupabaseError(deleteError)

        if (selectedServiceIds.length === 0) return null

        const rows = selectedServiceIds.map((serviceId) => ({ business_id: businessId, service_id: serviceId }))
        const { error: insertError } = await supabase.from('business_services').insert(rows)
        if (insertError) return describeSupabaseError(insertError)

        return null
    }

    const handleSubmit = async () => {
        setErrorMsg('')
        const firstBad = STEPS.findIndex((_, i) => !stepValid(i))
        if (firstBad !== -1) {
            setStep(firstBad)
            setShowErrors(true)
            return
        }

        const needsFeeAcceptance = !isEditMode && !feeAccepted
        if (needsFeeAcceptance && !feeChecked) {
            setFeeError(true)
            return
        }

        setSaving(true)

        if (needsFeeAcceptance) {
            const { error: acceptError } = await supabase.rpc('accept_platform_fee')
            if (acceptError) {
                console.error('Listing: accepting the fee failed', acceptError)
                setSaving(false)
                setErrorMsg(describeSupabaseError(acceptError))
                return
            }
            setFeeAccepted(true)
        }

        const payload = {
            property_name: propertyName.trim(),
            property_type: propertyType,
            monthly_rent: positive(monthlyRent) ? Number(monthlyRent) : null,
            business_size_width: Number(width),
            business_size_length: Number(length),
            ...(isLeased ? {} : { availability: listed ? 'Available' : 'Reserved' }),
            description: description.trim() || null,
            department: department || null,
            municipality: municipality || null,
            address: address.trim() || null,
            latitude: pin ? Number(pin.lat.toFixed(6)) : null,
            longitude: pin ? Number(pin.lng.toFixed(6)) : null,
        }

        const query = isEditMode
            ? supabase.from('add_business').update(payload).eq('property_id', property.property_id).select()
            : supabase.from('add_business').insert({ ...payload, owner_id: ownerDui }).select()

        const { data, error } = await query

        if (error || !data || data.length === 0) {
            if (error) console.error('Listing: save failed', error)
            setSaving(false)
            setErrorMsg(
                error && error.code !== '42501'
                    ? describeSupabaseError(error)
                    : isEditMode
                      ? t('listingForm.saveFailed')
                      : t('listingForm.publishFailed')
            )
            return
        }

        const savedProperty = data[0]
        const issues = []

        const photosChanged =
            removedPhotos.length > 0 ||
            photoItems.some((p, i) => p.file || (property?.photos?.[i]?.photo_id ?? null) !== p.photoId)
        if (photosChanged) {
            const photoIssue = await syncPhotos(savedProperty.property_id)
            if (photoIssue) issues.push(t('listingForm.issues.photos'))
        }

        const servicesIssue = await syncServices(savedProperty.business_id)
        if (servicesIssue) issues.push(t('listingForm.issues.amenities'))

        // Amenities are saved now, so alert businesses whose saved search matches.
        if (!isLeased && listed) {
            await supabase.rpc('notify_saved_searches', { p_property_id: savedProperty.property_id })
        }

        setSaving(false)
        if (issues.length > 0) {
            window.alert(t('listingForm.partialSave', { items: issues.join(t('listingForm.issues.and')) }))
        }
        onSaved(savedProperty)
    }

    const err = (field) =>
        showErrors && fieldErrors[field] ? (
            <p className="ns-lf-error">
                <i className="bi bi-exclamation-circle"></i> {t(fieldErrors[field])}
            </p>
        ) : null

    const bad = (field) => (showErrors && fieldErrors[field] ? 'is-bad' : '')

    const current = STEPS[step].id
    const isLast = step === STEPS.length - 1
    const title = isEditMode ? t('listingForm.titleEdit') : template ? t('listingForm.titleSimilar') : t('listingForm.titleNew')
    const suggestionScope = suggestion
        ? suggestion.local
            ? t('listingForm.suggest.scopeLocal', { type: propertyTypeLabel(propertyType), place: department })
            : t('listingForm.suggest.scopeAll', { ...BRAND_VALUES, type: propertyTypeLabel(propertyType) })
        : ''

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-lf-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
                <header className="ns-lf-head">
                    <div>
                        <h2>{title}</h2>
                        <p>
                            {isEditMode
                                ? t('listingForm.subtitleEdit')
                                : t('listingForm.subtitleNew')}
                        </p>
                    </div>
                    <button type="button" className="ns-lf-preview-toggle" onClick={() => setPreviewOpen((v) => !v)}>
                        <i className={`bi ${previewOpen ? 'bi-pencil' : 'bi-eye'}`}></i> {previewOpen ? t('common.edit') : t('listingForm.preview')}
                    </button>
                    <button type="button" className="ns-lf-close" onClick={onClose} aria-label={t('common.close')}>
                        <i className="bi bi-x-lg"></i>
                    </button>
                </header>

                <nav className="ns-lf-steps" aria-label={t('listingForm.stepsLabel')}>
                    {STEPS.map((s, i) => {
                        const done = i !== step && (isEditMode ? stepValid(i) : i < reached || i < step)
                        const canJump = isEditMode || i <= reached
                        return (
                            <button
                                type="button"
                                key={s.id}
                                className={`${i === step ? 'is-current' : ''} ${done ? 'is-done' : ''}`}
                                onClick={() => canJump && goTo(i)}
                                disabled={!canJump}
                                aria-current={i === step ? 'step' : undefined}
                            >
                                <span className="ns-lf-step-dot">
                                    {done ? <i className="bi bi-check-lg"></i> : isEditMode ? <i className={`bi ${s.icon}`}></i> : i + 1}
                                </span>
                                <span className="ns-lf-step-label">{t(s.label)}</span>
                            </button>
                        )
                    })}
                </nav>

                <div className={`ns-lf-layout ${previewOpen ? 'show-preview' : ''}`}>
                    <div className="ns-lf-body" ref={bodyRef}>
                        {errorMsg && (
                            <div className="ns-lf-alert" role="alert">
                                <i className="bi bi-exclamation-triangle"></i> {errorMsg}
                            </div>
                        )}

                        {current === 'basics' && (
                            <section className="ns-lf-section">
                                <label className="ns-lf-label" htmlFor="propName">
                                    {t('listingForm.name')}
                                </label>
                                <div className={`ns-lf-input ${bad('name')}`}>
                                    <i className="bi bi-shop"></i>
                                    <input
                                        id="propName"
                                        type="text"
                                        placeholder={t('listingForm.namePlaceholder')}
                                        value={propertyName}
                                        onChange={(e) => setPropertyName(e.target.value)}
                                    />
                                </div>
                                {err('name')}

                                <span className="ns-lf-label">{t('listingForm.kind')}</span>
                                <div className="ns-lf-chips">
                                    {PROPERTY_TYPES.map((type) => (
                                        <button
                                            type="button"
                                            key={type}
                                            className={propertyType === type ? 'is-on' : ''}
                                            onClick={() => setPropertyType(type)}
                                            aria-pressed={propertyType === type}
                                        >
                                            <i className={`bi ${TYPE_ICON[type]}`}></i> {propertyTypeLabel(type)}
                                        </button>
                                    ))}
                                </div>

                                <span className="ns-lf-label">{t('listingForm.size')}</span>
                                <div className="ns-lf-size">
                                    <div>
                                        <div className={`ns-lf-input ${bad('width')}`}>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                placeholder="6"
                                                value={width}
                                                onChange={(e) => setWidth(e.target.value)}
                                                aria-label={t('listingForm.widthLabel')}
                                            />
                                            <em>{t('listingForm.wide')}</em>
                                        </div>
                                        {err('width')}
                                    </div>
                                    <span className="ns-lf-times">×</span>
                                    <div>
                                        <div className={`ns-lf-input ${bad('length')}`}>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                placeholder="10"
                                                value={length}
                                                onChange={(e) => setLength(e.target.value)}
                                                aria-label={t('listingForm.lengthLabel')}
                                            />
                                            <em>{t('listingForm.long')}</em>
                                        </div>
                                        {err('length')}
                                    </div>
                                    <span className={`ns-lf-area ${area ? 'is-on' : ''}`}>
                                        <strong>{area ?? DASH}</strong> {SQ_M}
                                    </span>
                                </div>
                            </section>
                        )}

                        {current === 'location' && (
                            <section className="ns-lf-section">
                                <p className="ns-lf-intro">
                                    <i className="bi bi-info-circle"></i> {t('listingForm.locationIntro')}
                                </p>
                                <div className="ns-lf-two">
                                    <div>
                                        <label className="ns-lf-label" htmlFor="propDepartment">
                                            {t('listingForm.department')}
                                        </label>
                                        <select
                                            id="propDepartment"
                                            className="form-select"
                                            value={department}
                                            onChange={(e) => handleDepartmentChange(e.target.value)}
                                        >
                                            <option value="">{t('listingForm.selectDepartment')}</option>
                                            {EL_SALVADOR_DEPARTMENT_NAMES.map((name) => (
                                                <option key={name} value={name}>
                                                    {name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="ns-lf-label" htmlFor="propMunicipality">
                                            {t('marketplace.municipality')}
                                        </label>
                                        <select
                                            id="propMunicipality"
                                            className="form-select"
                                            value={municipality}
                                            onChange={(e) => setMunicipality(e.target.value)}
                                            disabled={!department}
                                        >
                                            <option value="">{t('listingForm.selectMunicipality')}</option>
                                            {(EL_SALVADOR_DEPARTMENTS[department] || []).map((name) => (
                                                <option key={name} value={name}>
                                                    {name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <label className="ns-lf-label" htmlFor="propAddress">
                                    {t('listingForm.address')} <span className="ns-lf-optional">{t('listingForm.optional')}</span>
                                </label>
                                <div className="ns-lf-input">
                                    <i className="bi bi-signpost"></i>
                                    <input
                                        id="propAddress"
                                        type="text"
                                        placeholder={t('listingForm.addressPlaceholder')}
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                    />
                                </div>

                                <span className="ns-lf-label">
                                    {t('listingForm.pinLabel')} <span className="ns-lf-optional">{t('listingForm.optional')}</span>
                                </span>
                                <small className="ns-lf-help d-block mb-2">{t('listingForm.pinHelp')}</small>
                                <Suspense fallback={<div className="ns-picker-map" aria-busy="true" />}>
                                    <LocationPicker value={pin} onChange={setPin} department={department} />
                                </Suspense>
                            </section>
                        )}

                        {current === 'price' && (
                            <section className="ns-lf-section">
                                <label className="ns-lf-label" htmlFor="propRent">
                                    {t('listingForm.rent')} <span className="ns-lf-optional">{t('listingForm.optional')}</span>
                                </label>
                                <div className={`ns-lf-input ns-lf-rent ${bad('rent')}`}>
                                    <span>$</span>
                                    <input
                                        id="propRent"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder={suggestion ? String(suggestion.rent) : '850'}
                                        value={monthlyRent}
                                        onChange={(e) => setMonthlyRent(e.target.value)}
                                    />
                                    <em>{t('listingForm.perMonth')}</em>
                                </div>
                                {err('rent')}
                                {!monthlyRent.trim() && (
                                    <small className="ns-lf-help">
                                        {t('listingForm.noRentHelp')}
                                    </small>
                                )}
                                {positive(monthlyRent) && (
                                    <div className="ns-lf-fee">
                                        <FeeBreakdown
                                            amount={Number(monthlyRent)}
                                            rate={feeRate}
                                            grossLabel={t('pricing.example.tenantPays')}
                                            netLabel={t('pricing.example.youReceive')}
                                            suffix={t('common.perMonth')}
                                            note={t('listingForm.feeNote', { ...BRAND_VALUES, rate: formatRate(feeRate) })}
                                        />
                                    </div>
                                )}

                                {suggestion ? (
                                    <div className="ns-lf-suggest">
                                        <span className="ns-lf-suggest-icon">
                                            <i className="bi bi-graph-up-arrow"></i>
                                        </span>
                                        <div>
                                            <strong>{t('listingForm.suggest.title', { rent: money(suggestion.rent) })}</strong>
                                            <p>
                                                {t('listingForm.suggest.text', {
                                                    scope: suggestionScope,
                                                    ppm: formatPpm(suggestion.ppm),
                                                    area,
                                                    unit: SQ_M,
                                                    rent: money(suggestion.rent),
                                                })}
                                            </p>
                                        </div>
                                        {Number(monthlyRent) !== suggestion.rent && (
                                            <button type="button" className="ns-outline-btn" onClick={() => setMonthlyRent(String(suggestion.rent))}>
                                                {t('listingForm.suggest.use')}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <p className="ns-lf-intro">
                                        <i className="bi bi-graph-up-arrow"></i>{' '}
                                        {area
                                            ? t('listingForm.suggest.notEnough', BRAND_VALUES)
                                            : t('listingForm.suggest.needSize')}
                                    </p>
                                )}

                                {insight && (
                                    <div className="ns-lf-market">
                                        <PriceMarketBar insight={insight} />
                                    </div>
                                )}
                            </section>
                        )}

                        {current === 'details' && (
                            <section className="ns-lf-section">
                                <span className="ns-lf-label">
                                    {t('listingForm.photos.title')}{' '}
                                    <span className="ns-lf-optional">
                                        {photoItems.length}/{MAX_PHOTOS} {DOT} {t('listingForm.photos.coverHint')}
                                    </span>
                                </span>
                                {photoItems.length === 0 ? (
                                    <label htmlFor="propPhoto" className={`ns-lf-drop ${dragging ? 'is-over' : ''}`} {...dropHandlers}>
                                        <i className="bi bi-cloud-arrow-up"></i>
                                        <strong>{t('listingForm.photos.drop')}</strong>
                                        <span>{t('listingForm.photos.dropHint', { dot: DOT })}</span>
                                    </label>
                                ) : (
                                    <div className={`ns-photo-grid ns-lf-photos ${dragging ? 'is-over' : ''}`} {...dropHandlers}>
                                        {photoItems.map((item, i) => (
                                            <div key={item.key} className={`ns-photo-tile ${i === 0 ? 'is-cover' : ''}`}>
                                                <img src={item.url} alt={t('listingForm.photos.alt', { n: i + 1 })} />
                                                {i === 0 ? (
                                                    <span className="ns-photo-cover-tag">{t('listingForm.photos.cover')}</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="ns-photo-tile-btn is-left"
                                                        onClick={() => makeCover(item.key)}
                                                        title={t('listingForm.photos.makeCover')}
                                                        aria-label={t('listingForm.photos.makeCover')}
                                                    >
                                                        <i className="bi bi-star"></i>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="ns-photo-tile-btn"
                                                    onClick={() => removePhoto(item.key)}
                                                    aria-label={t('listingForm.photos.remove')}
                                                >
                                                    <i className="bi bi-x-lg"></i>
                                                </button>
                                            </div>
                                        ))}
                                        {photoItems.length < MAX_PHOTOS && (
                                            <label htmlFor="propPhoto" className="ns-photo-tile ns-photo-add">
                                                <i className="bi bi-plus-lg"></i>
                                                <span>{t('listingForm.photos.add')}</span>
                                            </label>
                                        )}
                                    </div>
                                )}
                                <input id="propPhoto" type="file" accept="image/*" multiple className="d-none" onChange={handlePhotoChange} />
                                {photoError && <p className="ns-lf-error">{photoError}</p>}

                                <span className="ns-lf-label">{t('propertyCard.amenities')}</span>
                                {servicesList.length === 0 ? (
                                    <p className="ns-lf-help">{t('listingForm.loadingAmenities')}</p>
                                ) : (
                                    <div className="ns-lf-chips">
                                        {servicesList.map((service) => {
                                            const on = selectedServiceIds.includes(service.service_id)
                                            return (
                                                <button
                                                    type="button"
                                                    key={service.service_id}
                                                    className={on ? 'is-on' : ''}
                                                    onClick={() => toggleService(service.service_id)}
                                                    aria-pressed={on}
                                                >
                                                    <i className={`bi ${on ? 'bi-check-lg' : SERVICE_ICON[service.service_name] || 'bi-plus-circle'}`}></i>
                                                    {serviceLabel(service.service_name)}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                <label className="ns-lf-label" htmlFor="propDescription">
                                    {t('listings.checklist.description')}
                                    <span className={`ns-lf-count ${description.trim().length >= DESCRIPTION_GOOD ? 'is-good' : ''}`}>
                                        {t('listingForm.characters', { count: description.trim().length })}
                                        {description.trim().length < DESCRIPTION_GOOD && ` ${DOT} ${t('listingForm.recommended', { n: DESCRIPTION_GOOD })}`}
                                    </span>
                                </label>
                                <textarea
                                    id="propDescription"
                                    className="form-control ns-lf-textarea"
                                    rows={4}
                                    placeholder={t('listingForm.descriptionPlaceholder')}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                                <div className="ns-lf-tips">
                                    <span>{t('listingForm.ideas')}</span>
                                    {DESCRIPTION_TIPS.map((tip) => (
                                        <em key={tip}>{t(tip)}</em>
                                    ))}
                                </div>

                                <span className="ns-lf-label">{t('listingForm.onMarketplace')}</span>
                                {isLeased ? (
                                    <p className="ns-lf-intro">
                                        <i className="bi bi-key"></i> {t('listingForm.leasedNote')}
                                    </p>
                                ) : (
                                    <div className="ns-lf-publish">
                                        <button type="button" className={listed ? 'is-on' : ''} onClick={() => setListed(true)} aria-pressed={listed}>
                                            <i className="bi bi-broadcast"></i>
                                            <span>
                                                <strong>{t('listingForm.publishNow')}</strong>
                                                <small>{t('listingForm.publishNowHint')}</small>
                                            </span>
                                        </button>
                                        <button type="button" className={!listed ? 'is-on' : ''} onClick={() => setListed(false)} aria-pressed={!listed}>
                                            <i className="bi bi-pause-circle"></i>
                                            <span>
                                                <strong>{t('listingForm.keepPaused')}</strong>
                                                <small>{t('listingForm.keepPausedHint')}</small>
                                            </span>
                                        </button>
                                    </div>
                                )}

                                {feeAccepted !== true && (
                                    <label className={`ns-lf-fee-accept ${feeError && !feeChecked ? 'is-invalid' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={feeChecked}
                                            onChange={(e) => {
                                                setFeeChecked(e.target.checked)
                                                setFeeError(false)
                                            }}
                                        />
                                        <span>
                                            <Trans
                                                i18nKey="listingForm.feeAgree"
                                                values={{ ...BRAND_VALUES, rate: formatRate(feeRate) }}
                                                components={{ strong: <strong /> }}
                                            />
                                            {feeError && !feeChecked && <em>{t('listingForm.feeRequired', BRAND_VALUES)}</em>}
                                        </span>
                                    </label>
                                )}
                            </section>
                        )}
                    </div>

                    <aside className="ns-lf-aside">
                        <span className="ns-lf-aside-label">
                            <i className="bi bi-eye"></i> {t('listingForm.howSeen')}
                        </span>
                        <div className="ns-lf-preview" aria-hidden="true">
                            <PropertyCard property={preview} insight={insight} />
                        </div>

                        <div className="ns-lf-quality">
                            <div className="ns-lf-quality-head">
                                <strong>{t('ownerHome.listingQuality')}</strong>
                                <span className={scoreTone}>{score}%</span>
                            </div>
                            <div className="ns-lf-quality-bar">
                                <span style={{ width: `${score}%` }} className={scoreTone} />
                            </div>
                            <ul>
                                {checklist.map((c) => (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            className={c.done ? 'is-done' : ''}
                                            onClick={() => {
                                                setPreviewOpen(false)
                                                goTo(STEPS.findIndex((s) => s.id === CHECK_STEP[c.id]))
                                            }}
                                            disabled={c.done}
                                        >
                                            <i className={`bi ${c.done ? 'bi-check-circle-fill' : 'bi-circle'}`}></i> {c.label}
                                            {!c.done && <i className="bi bi-arrow-right ns-lf-go"></i>}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <small>{t('listingForm.completeHint')}</small>
                        </div>
                    </aside>
                </div>

                <footer className="ns-lf-foot">
                    {isEditMode ? (
                        <>
                            <button type="button" className="ns-outline-btn" onClick={onClose}>
                                {t('common.cancel')}
                            </button>
                            <span className="ns-lf-foot-step" />
                            <button type="button" className="ns-lf-primary" onClick={handleSubmit} disabled={saving}>
                                {saving ? t('common.saving') : t('profile.editModal.save')}
                            </button>
                        </>
                    ) : (
                        <>
                            {step > 0 ? (
                                <button type="button" className="ns-outline-btn" onClick={() => goTo(step - 1)}>
                                    <i className="bi bi-arrow-left"></i> {t('common.back')}
                                </button>
                            ) : (
                                <button type="button" className="ns-outline-btn" onClick={onClose}>
                                    {t('common.cancel')}
                                </button>
                            )}
                            <span className="ns-lf-foot-step">
                                {t('listingForm.stepOf', { step: step + 1, total: STEPS.length })}
                            </span>
                            {isLast ? (
                                <button type="button" className="ns-lf-primary" onClick={handleSubmit} disabled={saving}>
                                    {saving ? t('common.saving') : listed ? t('listingForm.publishSpace') : t('listingForm.savePaused')}
                                </button>
                            ) : (
                                <button type="button" className="ns-lf-primary" onClick={next}>
                                    {t('common.next')} <i className="bi bi-arrow-right"></i>
                                </button>
                            )}
                        </>
                    )}
                </footer>
            </div>
        </div>
    )
}
