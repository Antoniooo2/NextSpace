import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function EditProfileModal({ user, onClose, onUpdated }) {
    const meta = user.user_metadata || {}
    const [firstName, setFirstName] = useState(meta.first_name || '')
    const [lastName, setLastName] = useState(meta.last_name || '')
    const [phone, setPhone] = useState(meta.phone || '')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        setErrorMsg('')

        const { error: authError } = await supabase.auth.updateUser({
            data: { first_name: firstName, last_name: lastName, phone },
        })

        if (authError) {
            setSaving(false)
            setErrorMsg(authError.message)
            return
        }

                        if (meta.dui) {
            const { data: dbData, error: dbError } = await supabase
                .from('users')
                .update({ first_name: firstName, last_name: lastName, phone_number: phone })
                .eq('dui', meta.dui)
                .select()

            if (dbError) {
                setSaving(false)
                setErrorMsg(
                    'Your profile was updated, but syncing to the database failed: ' + dbError.message
                )
                return
            }

            if (!dbData || dbData.length === 0) {
                setSaving(false)
                setErrorMsg(
                    `No matching row was found in the users table for dui "${meta.dui}". ` +
                        'This is usually caused by a Row Level Security policy blocking the update, ' +
                        'or the dui not matching exactly.'
                )
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
                        Update your basic account information. Your email and DUI can't be changed here.
                    </p>

                    {errorMsg && (
                        <div className="alert alert-danger py-2" role="alert">
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
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
                                    id="editPhone" type="text" className="form-control"
                                    value={phone} onChange={(e) => setPhone(e.target.value)}
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