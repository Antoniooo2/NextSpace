import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ChangePasswordModal({ onClose }) {
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [success, setSuccess] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')

        if (newPassword.length < 6) {
            setErrorMsg('Password must be at least 6 characters long.')
            return
        }
        if (newPassword !== confirmPassword) {
            setErrorMsg('Passwords do not match.')
            return
        }

        setSaving(true)
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        setSaving(false)

        if (error) {
            setErrorMsg(error.message)
            return
        }

        setSuccess(true)
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-modal-form" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">Change password</h2>
                    <p className="ns-modal-form-subtitle">Choose a new password for your account.</p>

                    {success ? (
                        <div className="alert alert-success py-2" role="alert">
                            Password updated. Use it next time you log in.
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            {errorMsg && (
                                <div className="alert alert-danger py-2" role="alert">
                                    {errorMsg}
                                </div>
                            )}

                            <div className="ns-mb-field">
                                <label className="ns-label" htmlFor="newPassword">New password</label>
                                <div className="ns-input-group input-group">
                                    <span className="input-group-text"><i className="bi bi-lock"></i></span>
                                    <input
                                        id="newPassword" type="password" className="form-control"
                                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                                        minLength={6} required
                                    />
                                </div>
                            </div>

                            <div className="ns-mb-field">
                                <label className="ns-label" htmlFor="confirmPassword">Confirm password</label>
                                <div className="ns-input-group input-group">
                                    <span className="input-group-text"><i className="bi bi-lock-fill"></i></span>
                                    <input
                                        id="confirmPassword" type="password" className="form-control"
                                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                        minLength={6} required
                                    />
                                </div>
                            </div>

                            <button type="submit" className="ns-submit-btn" disabled={saving}>
                                {saving ? 'Saving...' : 'Update password'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
