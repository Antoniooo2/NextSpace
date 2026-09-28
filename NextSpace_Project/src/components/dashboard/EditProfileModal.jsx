import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function EditProfileModal({ user, onClose, onUpdated }) {
    const meta = user.user_metadata || {}
    const [firstName, setFirstName] = useState(meta.first_name || '')
    const [lastName, setLastName] = useState(meta.last_name || '')
    const [phone, setPhone] = useState(meta.phone || '')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    // Salvadoran numbers: 8 digits, shown as ####-####.
    const formatPhone = (value) => {
        const digits = value.replace(/\D/g, '').slice(0, 8)
        return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const first = firstName.trim()
        const last = lastName.trim()
        if (!first || !last) {
            setErrorMsg('Please enter your first and last name.')
            return
        }
        if (phone && !/^\d{4}-\d{4}$/.test(phone)) {
            setErrorMsg('Enter an 8-digit phone number, like 7123-4567.')
            return
        }

        setSaving(true)
        setErrorMsg('')

        const { error: authError } = await supabase.auth.updateUser({
            data: { first_name: first, last_name: last, phone },
        })

        if (authError) {
            setSaving(false)
            setErrorMsg('We could not save your changes. Check your connection and try again.')
            return
        }

        if (meta.dui) {
            const { data: dbData, error: dbError } = await supabase
                .from('users')
                .update({ first_name: first, last_name: last, phone_number: phone })
                .eq('dui', meta.dui)
                .select()

            if (dbError || !dbData || dbData.length === 0) {
                console.error('Profile: users row not updated', dbError)
                setSaving(false)
                setErrorMsg('Your changes were only partly saved. Please try again in a moment.')
                return
            }
        }

        setSaving(false)
        onUpdated()
        onClose()
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-modal-form" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">Edit profile</h2>
                    <p className="ns-modal-form-subtitle">
                        {meta.account_type === 'property-owner'
                            ? 'Businesses see your name on your listings and leases.'
                            : 'Owners see your name and phone when you apply for a space or sign a lease.'}
                    </p>

                    {errorMsg && (
                        <div className="alert alert-danger py-2" role="alert">
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} noValidate>
                        <div className="ns-edit-fixed">
                            <span>
                                <i className="bi bi-envelope"></i> {user.email}
                            </span>
                            <span>
                                <i className="bi bi-person-vcard"></i> DUI {meta.dui || '—'}
                            </span>
                            <small>Email and DUI can't be changed.</small>
                        </div>

                        <div className="row g-2">
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="editFirstName">First name</label>
                                    <div className="ns-input-group input-group">
                                        <span className="input-group-text"><i className="bi bi-person"></i></span>
                                        <input
                                            id="editFirstName" type="text" className="form-control"
                                            value={firstName} onChange={(e) => setFirstName(e.target.value)} required
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="editLastName">Last name</label>
                                    <div className="ns-input-group input-group">
                                        <span className="input-group-text"><i className="bi bi-person"></i></span>
                                        <input
                                            id="editLastName" type="text" className="form-control"
                                            value={lastName} onChange={(e) => setLastName(e.target.value)} required
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="editPhone">Phone number</label>
                            <div className="ns-input-group input-group">
                                <span className="input-group-text"><i className="bi bi-phone"></i></span>
                                <input
                                    id="editPhone" type="tel" inputMode="numeric" className="form-control"
                                    placeholder="7123-4567"
                                    value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))}
                                />
                            </div>
                        </div>

                        <button type="submit" className="ns-submit-btn" disabled={saving}>
                            {saving ? 'Saving...' : 'Save changes'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}