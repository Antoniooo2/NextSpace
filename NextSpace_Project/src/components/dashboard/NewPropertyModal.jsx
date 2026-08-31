import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export const PROPERTY_TYPES = [
    'Café/Restaurant',
    'Store/Boutique',
    'Beauty Salon',
    'Pharmacy/Healthcare',
    'Other',
]

export const AVAILABILITY_OPTIONS = ['Available', 'Occupied', 'Reserved']

const TYPE_ICON = {
    'Café/Restaurant': 'bi-cup-hot',
    'Store/Boutique': 'bi-shop',
    'Beauty Salon': 'bi-scissors',
    'Pharmacy/Healthcare': 'bi-capsule',
    Other: 'bi-building',
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_URL_MARKER = '/property-photos/'

export function describeSupabaseError(error) {
    if (!error) return 'Something went wrong. Please try again.'
    if (error.code === '23514') {
        return 'One of the values you entered is not allowed by the database (check the property type, availability, or size/rent values).'
    }
    if (error.code === '42501') {
        return "You don't have permission to perform this action on this property."
    }
    const message = error.message || ''
    if (message.toLowerCase().includes('fetch') || message.toLowerCase().includes('network')) {
        return 'Could not reach the server. Check your internet connection and try again.'
    }
    return message || 'Something went wrong. Please try again.'
}

export default function NewPropertyModal({ property, ownerDui, onClose, onSaved }) {
    const isEditMode = Boolean(property)

    const [propertyName, setPropertyName] = useState(property?.property_name || '')
    const [propertyType, setPropertyType] = useState(property?.property_type || PROPERTY_TYPES[0])
    const [monthlyRent, setMonthlyRent] = useState(
        property?.monthly_rent != null ? String(property.monthly_rent) : ''
    )
    const [width, setWidth] = useState(
        property?.business_size_width != null ? String(property.business_size_width) : ''
    )
    const [length, setLength] = useState(
        property?.business_size_length != null ? String(property.business_size_length) : ''
    )
    const [availability, setAvailability] = useState(property?.availability || AVAILABILITY_OPTIONS[0])
    const [phoneNumber, setPhoneNumber] = useState(property?.phone_number || '')
    const [photoFile, setPhotoFile] = useState(null)
    const [photoPreview, setPhotoPreview] = useState(property?.photo_url || null)
    const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false)
    const [photoError, setPhotoError] = useState('')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const handlePhotoChange = (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        setPhotoError('')

        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
            setPhotoError('Please choose a JPG, PNG, WEBP, or GIF image.')
            e.target.value = ''
            return
        }
        if (file.size > MAX_PHOTO_BYTES) {
            setPhotoError('Image must be 5MB or smaller.')
            e.target.value = ''
            return
        }

        setPhotoFile(file)
        setRemoveExistingPhoto(false)
        setPhotoPreview(URL.createObjectURL(file))
    }

    const handleRemovePhoto = () => {
        setPhotoFile(null)
        setPhotoPreview(null)
        setPhotoError('')
        setRemoveExistingPhoto(true)
    }

    const replacePhoto = async (propertyId) => {
        const oldPhotos = property?.business_photos || []

        for (const old of oldPhotos) {
            const idx = old.photo_url?.indexOf(PHOTO_URL_MARKER)
            if (idx != null && idx !== -1) {
                const oldPath = old.photo_url.slice(idx + PHOTO_URL_MARKER.length)
                await supabase.storage.from('property-photos').remove([oldPath])
            }
        }
        if (oldPhotos.length > 0) {
            await supabase.from('business_photos').delete().eq('property_id', propertyId)
        }

        if (!photoFile) return null

        const ext = photoFile.name.split('.').pop()
        const path = `${propertyId}/${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage.from('property-photos').upload(path, photoFile)
        if (uploadError) return describeSupabaseError(uploadError)

        const {
            data: { publicUrl },
        } = supabase.storage.from('property-photos').getPublicUrl(path)

        const { error: photoRowError } = await supabase
            .from('business_photos')
            .insert({ property_id: propertyId, photo_url: publicUrl })
        if (photoRowError) return describeSupabaseError(photoRowError)

        return null
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')

        const errors = []
        if (!propertyName.trim()) errors.push('Property name is required.')
        if (!PROPERTY_TYPES.includes(propertyType)) errors.push('Select a valid property type.')
        if (!AVAILABILITY_OPTIONS.includes(availability)) errors.push('Select a valid availability status.')
        if (!phoneNumber.trim()) errors.push('Phone number is required.')

        const widthNum = Number(width)
        const lengthNum = Number(length)
        if (!width.trim() || Number.isNaN(widthNum) || widthNum <= 0) {
            errors.push('Width must be a positive number.')
        }
        if (!length.trim() || Number.isNaN(lengthNum) || lengthNum <= 0) {
            errors.push('Length must be a positive number.')
        }

        let rentNum = null
        if (monthlyRent.trim() !== '') {
            rentNum = Number(monthlyRent)
            if (Number.isNaN(rentNum) || rentNum <= 0) errors.push('Monthly rent must be a positive number.')
        }

        if (errors.length > 0) {
            setErrorMsg(errors.join(' '))
            return
        }

        setSaving(true)

        const payload = {
            property_name: propertyName.trim(),
            property_type: propertyType,
            monthly_rent: rentNum,
            business_size_width: widthNum,
            business_size_length: lengthNum,
            availability,
            phone_number: phoneNumber.trim(),
        }

        const query = isEditMode
            ? supabase.from('add_business').update(payload).eq('property_id', property.property_id).select()
            : supabase.from('add_business').insert({ ...payload, owner_id: ownerDui }).select()

        const { data, error } = await query

        if (error) {
            setSaving(false)
            setErrorMsg(describeSupabaseError(error))
            return
        }
        if (!data || data.length === 0) {
            setSaving(false)
            setErrorMsg(
                isEditMode
                    ? "The update did not apply. This is usually caused by a permissions (row-level security) rule blocking the change."
                    : "The property could not be created. This is usually caused by a permissions (row-level security) rule blocking the insert."
            )
            return
        }

        const savedProperty = data[0]

        if (photoFile || removeExistingPhoto) {
            const photoIssue = await replacePhoto(savedProperty.property_id)
            setSaving(false)
            if (photoIssue) {
                setErrorMsg(`The property was saved, but the photo could not be updated: ${photoIssue}`)
                onSaved(savedProperty)
                return
            }
        } else {
            setSaving(false)
        }

        onSaved(savedProperty)
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-modal-form" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{isEditMode ? 'Edit space' : 'Publish a new space'}</h2>
                    <p className="ns-modal-form-subtitle">
                        {isEditMode
                            ? 'Update the details of this listing.'
                            : 'This listing is saved directly to your NextSpace account.'}
                    </p>

                    {errorMsg && (
                        <div className="alert alert-danger py-2" role="alert">
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="ns-form-section">
                            <span className="ns-account-type-label"><i className="bi bi-camera"></i> Property Photo</span>
                            <label htmlFor="propPhoto" className="ns-photo-dropzone">
                                {photoPreview ? (
                                    <img src={photoPreview} alt="Property preview" />
                                ) : (
                                    <span className="ns-photo-dropzone-empty">
                                        <i className="bi bi-cloud-arrow-up"></i>
                                        <span>Upload photo</span>
                                    </span>
                                )}
                            </label>
                            <input
                                id="propPhoto" type="file" accept="image/*" className="d-none"
                                onChange={handlePhotoChange}
                            />
                            {photoPreview && (
                                <div>
                                    <button type="button" className="ns-link-btn" onClick={handleRemovePhoto}>
                                        Remove photo
                                    </button>
                                </div>
                            )}
                            {photoError && <p className="ns-photo-error">{photoError}</p>}
                        </div>

                        <div className="ns-form-section">
                            <span className="ns-account-type-label"><i className="bi bi-info-circle"></i> Basic Information</span>

                            <div className="ns-mb-field">
                                <label className="ns-label" htmlFor="propName">Property name</label>
                                <div className="ns-input-group input-group">
                                    <span className="input-group-text"><i className="bi bi-shop"></i></span>
                                    <input
                                        id="propName" type="text" className="form-control" placeholder="Local Las Flores"
                                        value={propertyName} onChange={(e) => setPropertyName(e.target.value)} required
                                    />
                                </div>
                            </div>

                            <div className="ns-mb-field">
                                <span className="ns-account-type-label">Property type</span>
                                <div className="row g-2">
                                    {PROPERTY_TYPES.map((type) => (
                                        <div className="col-6" key={type}>
                                            <div
                                                className={`ns-type-card ${propertyType === type ? 'selected' : ''}`}
                                                role="button" tabIndex={0}
                                                onClick={() => setPropertyType(type)}
                                            >
                                                <i className={`bi ${TYPE_ICON[type]} ns-type-icon`}></i>
                                                <div className="ns-type-title">{type}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="row g-2">
                                <div className="col-6">
                                    <div className="ns-mb-field">
                                        <label className="ns-label" htmlFor="propRent">Monthly rent (USD, optional)</label>
                                        <div className="ns-input-group input-group">
                                            <span className="input-group-text"><i className="bi bi-currency-dollar"></i></span>
                                            <input
                                                id="propRent" type="number" min="0" step="0.01" className="form-control" placeholder="850"
                                                value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="ns-mb-field mb-0">
                                        <label className="ns-label" htmlFor="propAvailability">Availability</label>
                                        <select
                                            id="propAvailability" className="form-select"
                                            value={availability} onChange={(e) => setAvailability(e.target.value)}
                                        >
                                            {AVAILABILITY_OPTIONS.map((opt) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="row g-2">
                                <div className="col-6">
                                    <div className="ns-mb-field mb-0">
                                        <label className="ns-label" htmlFor="propWidth">Width (m)</label>
                                        <div className="ns-input-group input-group">
                                            <span className="input-group-text"><i className="bi bi-arrows-angle-expand"></i></span>
                                            <input
                                                id="propWidth" type="number" min="0" step="0.01" className="form-control" placeholder="6"
                                                value={width} onChange={(e) => setWidth(e.target.value)} required
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="ns-mb-field mb-0">
                                        <label className="ns-label" htmlFor="propLength">Length (m)</label>
                                        <div className="ns-input-group input-group">
                                            <span className="input-group-text"><i className="bi bi-arrows-angle-expand"></i></span>
                                            <input
                                                id="propLength" type="number" min="0" step="0.01" className="form-control" placeholder="10"
                                                value={length} onChange={(e) => setLength(e.target.value)} required
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="ns-form-section">
                            <span className="ns-account-type-label"><i className="bi bi-telephone"></i> Contact</span>
                            <div className="ns-mb-field mb-0">
                                <label className="ns-label" htmlFor="propPhone">Phone number</label>
                                <div className="ns-input-group input-group">
                                    <span className="input-group-text"><i className="bi bi-telephone"></i></span>
                                    <input
                                        id="propPhone" type="text" className="form-control" placeholder="7000-0000"
                                        value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required
                                    />
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="ns-submit-btn" disabled={saving}>
                            {saving ? 'Saving...' : isEditMode ? 'Save changes' : 'Publish space'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
