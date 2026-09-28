import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { EL_SALVADOR_DEPARTMENTS, EL_SALVADOR_DEPARTMENT_NAMES } from '../../lib/elSalvadorLocations'
import { SERVICE_ICON, listingChecklist, listingScore } from '../../lib/listings'
import { formatPpm, loadMarketStats, priceInsight } from '../../lib/market'
import { PROPERTY_TYPES, TYPE_ICON } from '../../lib/propertyTypes'
import { describeSupabaseError } from '../../lib/supabaseErrors'
import PropertyCard from './PropertyCard'
import PriceMarketBar from './property/PriceMarketBar'
import './listings.css'
import './property/property.css'
import './listingForm.css'

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_URL_MARKER = '/property-photos/'
const MAX_PHOTOS = 6
const DESCRIPTION_GOOD = 40

const STEPS = [
    { id: 'basics', label: 'Basics', icon: 'bi-shop', fields: ['name', 'width', 'length'] },
    { id: 'location', label: 'Location', icon: 'bi-geo-alt', fields: [] },
    { id: 'price', label: 'Price', icon: 'bi-currency-dollar', fields: ['rent'] },
    { id: 'details', label: 'Photos & details', icon: 'bi-images', fields: [] },
]

// Where each quality-checklist item is filled in.
const CHECK_STEP = { photo: 'details', 'more-photos': 'details', rent: 'price', description: 'details', location: 'location', services: 'details' }

const DESCRIPTION_TIPS = ['Foot traffic and nearby businesses', 'Condition and finishes', 'Access, parking and hours']

function positive(value) {
    const n = Number(value)
    return value.trim() !== '' && !Number.isNaN(n) && n > 0
}

export default function NewPropertyModal({ property, template, ownerDui, onClose, onSaved }) {
    // "Duplicate" starts a new listing from another one's details (no photos).
    const base = property || template || null
    const isEditMode = Boolean(property)

    const [propertyName, setPropertyName] = useState(template && !property ? `${template.property_name} (copy)` : property?.property_name || '')
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
        const onKey = (e) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    // Field problems, shown under each field once the owner tries to move on.
    const fieldErrors = useMemo(() => {
        const errors = {}
        if (!propertyName.trim()) errors.name = 'Give your space a name.'
        if (!positive(width)) errors.width = 'Enter the width in meters.'
        if (!positive(length)) errors.length = 'Enter the length in meters.'
        if (monthlyRent.trim() !== '' && !positive(monthlyRent)) errors.rent = 'The rent must be more than $0.'
        return errors
    }, [propertyName, width, length, monthlyRent])

    const stepValid = (i) => STEPS[i].fields.every((f) => !fieldErrors[f])

    const area = positive(width) && positive(length) ? Math.round(Number(width) * Number(length)) : null
    const serviceNames = servicesList.filter((s) => selectedServiceIds.includes(s.service_id)).map((s) => s.service_name)

    // The listing as it will look on the Marketplace, rebuilt as the owner types.
    const preview = {
        property_id: property?.property_id ?? 0,
        property_name: propertyName.trim() || 'Your space',
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
            scope: local ? `${propertyType} spaces in ${department}` : `${propertyType} spaces on NextSpace`,
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
                setPhotoError('Please choose JPG, PNG, WEBP, or GIF images.')
                continue
            }
            if (file.size > MAX_PHOTO_BYTES) {
                setPhotoError('Each image must be 5MB or smaller.')
                continue
            }
            accepted.push(file)
        }
        if (accepted.length > room) setPhotoError(`A space can have up to ${MAX_PHOTOS} photos.`)

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

        setSaving(true)

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
                    : `We couldn't ${isEditMode ? 'save your changes' : 'publish this space'}. Please try again.`
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
            if (photoIssue) issues.push('photos')
        }

        const servicesIssue = await syncServices(savedProperty.business_id)
        if (servicesIssue) issues.push('amenities')

        // Amenities are saved now, so alert businesses whose saved search matches.
        if (!isLeased && listed) {
            await supabase.rpc('notify_saved_searches', { p_property_id: savedProperty.property_id })
        }

        setSaving(false)
        if (issues.length > 0) {
            window.alert(`The space was saved, but the ${issues.join(' and ')} couldn't be updated. Open it again to retry.`)
        }
        onSaved(savedProperty)
    }

    const err = (field) =>
        showErrors && fieldErrors[field] ? (
            <p className="ns-lf-error">
                <i className="bi bi-exclamation-circle"></i> {fieldErrors[field]}
            </p>
        ) : null

    const bad = (field) => (showErrors && fieldErrors[field] ? 'is-bad' : '')

    const current = STEPS[step].id
    const isLast = step === STEPS.length - 1
    const title = isEditMode ? 'Edit space' : template ? 'Publish a similar space' : 'Publish a new space'

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-lf-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
                <header className="ns-lf-head">
                    <div>
                        <h2>{title}</h2>
                        <p>
                            {isEditMode
                                ? 'Jump to any section, change what you need and save.'
                                : 'Four quick steps. You can change everything later.'}
                        </p>
                    </div>
                    <button type="button" className="ns-lf-preview-toggle" onClick={() => setPreviewOpen((v) => !v)}>
                        <i className={`bi ${previewOpen ? 'bi-pencil' : 'bi-eye'}`}></i> {previewOpen ? 'Edit' : 'Preview'}
                    </button>
                    <button type="button" className="ns-lf-close" onClick={onClose} aria-label="Close">
                        <i className="bi bi-x-lg"></i>
                    </button>
                </header>

                <nav className="ns-lf-steps" aria-label="Steps">
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
                                <span className="ns-lf-step-label">{s.label}</span>
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
                                    Name of the space
                                </label>
                                <div className={`ns-lf-input ${bad('name')}`}>
                                    <i className="bi bi-shop"></i>
                                    <input
                                        id="propName"
                                        type="text"
                                        placeholder="Local Las Flores"
                                        value={propertyName}
                                        onChange={(e) => setPropertyName(e.target.value)}
                                    />
                                </div>
                                {err('name')}

                                <span className="ns-lf-label">What kind of space is it?</span>
                                <div className="ns-lf-chips">
                                    {PROPERTY_TYPES.map((type) => (
                                        <button
                                            type="button"
                                            key={type}
                                            className={propertyType === type ? 'is-on' : ''}
                                            onClick={() => setPropertyType(type)}
                                            aria-pressed={propertyType === type}
                                        >
                                            <i className={`bi ${TYPE_ICON[type]}`}></i> {type}
                                        </button>
                                    ))}
                                </div>

                                <span className="ns-lf-label">Size</span>
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
                                                aria-label="Width in meters"
                                            />
                                            <em>m wide</em>
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
                                                aria-label="Length in meters"
                                            />
                                            <em>m long</em>
                                        </div>
                                        {err('length')}
                                    </div>
                                    <span className={`ns-lf-area ${area ? 'is-on' : ''}`}>
                                        <strong>{area ?? '—'}</strong> m²
                                    </span>
                                </div>
                            </section>
                        )}

                        {current === 'location' && (
                            <section className="ns-lf-section">
                                <p className="ns-lf-intro">
                                    <i className="bi bi-info-circle"></i> Businesses filter the Marketplace by department and municipality,
                                    so spaces with a location show up in more searches.
                                </p>
                                <div className="ns-lf-two">
                                    <div>
                                        <label className="ns-lf-label" htmlFor="propDepartment">
                                            Department
                                        </label>
                                        <select
                                            id="propDepartment"
                                            className="form-select"
                                            value={department}
                                            onChange={(e) => handleDepartmentChange(e.target.value)}
                                        >
                                            <option value="">Select a department</option>
                                            {EL_SALVADOR_DEPARTMENT_NAMES.map((name) => (
                                                <option key={name} value={name}>
                                                    {name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="ns-lf-label" htmlFor="propMunicipality">
                                            Municipality
                                        </label>
                                        <select
                                            id="propMunicipality"
                                            className="form-select"
                                            value={municipality}
                                            onChange={(e) => setMunicipality(e.target.value)}
                                            disabled={!department}
                                        >
                                            <option value="">Select a municipality</option>
                                            {(EL_SALVADOR_DEPARTMENTS[department] || []).map((name) => (
                                                <option key={name} value={name}>
                                                    {name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <label className="ns-lf-label" htmlFor="propAddress">
                                    Address <span className="ns-lf-optional">optional</span>
                                </label>
                                <div className="ns-lf-input">
                                    <i className="bi bi-signpost"></i>
                                    <input
                                        id="propAddress"
                                        type="text"
                                        placeholder="e.g., 125 El Mirador Street, Escalón"
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                    />
                                </div>
                            </section>
                        )}

                        {current === 'price' && (
                            <section className="ns-lf-section">
                                <label className="ns-lf-label" htmlFor="propRent">
                                    Monthly rent <span className="ns-lf-optional">optional</span>
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
                                    <em>/ month</em>
                                </div>
                                {err('rent')}
                                {!monthlyRent.trim() && (
                                    <small className="ns-lf-help">
                                        Without a rent the space shows "Price on request" and gets fewer requests.
                                    </small>
                                )}

                                {suggestion ? (
                                    <div className="ns-lf-suggest">
                                        <span className="ns-lf-suggest-icon">
                                            <i className="bi bi-graph-up-arrow"></i>
                                        </span>
                                        <div>
                                            <strong>Suggested: about ${suggestion.rent.toLocaleString()}/month</strong>
                                            <p>
                                                {suggestion.scope} rent for around {formatPpm(suggestion.ppm)}. For your {area} m² that is about $
                                                {suggestion.rent.toLocaleString()}.
                                            </p>
                                        </div>
                                        {Number(monthlyRent) !== suggestion.rent && (
                                            <button type="button" className="ns-outline-btn" onClick={() => setMonthlyRent(String(suggestion.rent))}>
                                                Use it
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <p className="ns-lf-intro">
                                        <i className="bi bi-graph-up-arrow"></i>{' '}
                                        {area
                                            ? 'There are not enough similar spaces on NextSpace yet to suggest a price.'
                                            : 'Add the size in Basics to get a suggested rent from similar spaces.'}
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
                                    Photos{' '}
                                    <span className="ns-lf-optional">
                                        {photoItems.length}/{MAX_PHOTOS} · the first one is the cover
                                    </span>
                                </span>
                                {photoItems.length === 0 ? (
                                    <label htmlFor="propPhoto" className={`ns-lf-drop ${dragging ? 'is-over' : ''}`} {...dropHandlers}>
                                        <i className="bi bi-cloud-arrow-up"></i>
                                        <strong>Drag photos here or click to upload</strong>
                                        <span>Up to 6 · JPG, PNG or WEBP · 5MB each. Spaces with 3+ photos get more requests.</span>
                                    </label>
                                ) : (
                                    <div className={`ns-photo-grid ns-lf-photos ${dragging ? 'is-over' : ''}`} {...dropHandlers}>
                                        {photoItems.map((item, i) => (
                                            <div key={item.key} className={`ns-photo-tile ${i === 0 ? 'is-cover' : ''}`}>
                                                <img src={item.url} alt={`Photo ${i + 1}`} />
                                                {i === 0 ? (
                                                    <span className="ns-photo-cover-tag">Cover</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="ns-photo-tile-btn is-left"
                                                        onClick={() => makeCover(item.key)}
                                                        title="Make cover"
                                                        aria-label="Make cover"
                                                    >
                                                        <i className="bi bi-star"></i>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="ns-photo-tile-btn"
                                                    onClick={() => removePhoto(item.key)}
                                                    aria-label="Remove photo"
                                                >
                                                    <i className="bi bi-x-lg"></i>
                                                </button>
                                            </div>
                                        ))}
                                        {photoItems.length < MAX_PHOTOS && (
                                            <label htmlFor="propPhoto" className="ns-photo-tile ns-photo-add">
                                                <i className="bi bi-plus-lg"></i>
                                                <span>Add</span>
                                            </label>
                                        )}
                                    </div>
                                )}
                                <input id="propPhoto" type="file" accept="image/*" multiple className="d-none" onChange={handlePhotoChange} />
                                {photoError && <p className="ns-lf-error">{photoError}</p>}

                                <span className="ns-lf-label">Amenities</span>
                                {servicesList.length === 0 ? (
                                    <p className="ns-lf-help">Loading amenities...</p>
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
                                                    {service.service_name}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                <label className="ns-lf-label" htmlFor="propDescription">
                                    Description
                                    <span className={`ns-lf-count ${description.trim().length >= DESCRIPTION_GOOD ? 'is-good' : ''}`}>
                                        {description.trim().length} characters
                                        {description.trim().length < DESCRIPTION_GOOD && ` · ${DESCRIPTION_GOOD}+ recommended`}
                                    </span>
                                </label>
                                <textarea
                                    id="propDescription"
                                    className="form-control ns-lf-textarea"
                                    rows={4}
                                    placeholder="What makes this space a good fit for a business?"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                                <div className="ns-lf-tips">
                                    <span>Ideas:</span>
                                    {DESCRIPTION_TIPS.map((t) => (
                                        <em key={t}>{t}</em>
                                    ))}
                                </div>

                                <span className="ns-lf-label">On the Marketplace</span>
                                {isLeased ? (
                                    <p className="ns-lf-intro">
                                        <i className="bi bi-key"></i> Leased — it returns to the Marketplace when the lease ends.
                                    </p>
                                ) : (
                                    <div className="ns-lf-publish">
                                        <button type="button" className={listed ? 'is-on' : ''} onClick={() => setListed(true)} aria-pressed={listed}>
                                            <i className="bi bi-broadcast"></i>
                                            <span>
                                                <strong>Publish now</strong>
                                                <small>Businesses can find and request it</small>
                                            </span>
                                        </button>
                                        <button type="button" className={!listed ? 'is-on' : ''} onClick={() => setListed(false)} aria-pressed={!listed}>
                                            <i className="bi bi-pause-circle"></i>
                                            <span>
                                                <strong>Keep paused</strong>
                                                <small>Hidden until you publish it</small>
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </section>
                        )}
                    </div>

                    <aside className="ns-lf-aside">
                        <span className="ns-lf-aside-label">
                            <i className="bi bi-eye"></i> How businesses will see it
                        </span>
                        <div className="ns-lf-preview" aria-hidden="true">
                            <PropertyCard property={preview} insight={insight} />
                        </div>

                        <div className="ns-lf-quality">
                            <div className="ns-lf-quality-head">
                                <strong>Listing quality</strong>
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
                            <small>Complete listings get more requests.</small>
                        </div>
                    </aside>
                </div>

                <footer className="ns-lf-foot">
                    {isEditMode ? (
                        <>
                            <button type="button" className="ns-outline-btn" onClick={onClose}>
                                Cancel
                            </button>
                            <span className="ns-lf-foot-step" />
                            <button type="button" className="ns-lf-primary" onClick={handleSubmit} disabled={saving}>
                                {saving ? 'Saving...' : 'Save changes'}
                            </button>
                        </>
                    ) : (
                        <>
                            {step > 0 ? (
                                <button type="button" className="ns-outline-btn" onClick={() => goTo(step - 1)}>
                                    <i className="bi bi-arrow-left"></i> Back
                                </button>
                            ) : (
                                <button type="button" className="ns-outline-btn" onClick={onClose}>
                                    Cancel
                                </button>
                            )}
                            <span className="ns-lf-foot-step">
                                Step {step + 1} of {STEPS.length}
                            </span>
                            {isLast ? (
                                <button type="button" className="ns-lf-primary" onClick={handleSubmit} disabled={saving}>
                                    {saving ? 'Saving...' : listed ? 'Publish space' : 'Save paused'}
                                </button>
                            ) : (
                                <button type="button" className="ns-lf-primary" onClick={next}>
                                    Next <i className="bi bi-arrow-right"></i>
                                </button>
                            )}
                        </>
                    )}
                </footer>
            </div>
        </div>
    )
}
