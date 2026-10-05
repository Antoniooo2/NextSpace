import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabaseClient'
import { describeAuthError } from '../../lib/supabaseErrors'

export default function ChangePasswordModal({ onClose }) {
    const { t } = useTranslation()
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [success, setSuccess] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')

        if (newPassword.length < 6) {
            setErrorMsg(t('auth.password.tooShort'))
            return
        }
        if (newPassword !== confirmPassword) {
            setErrorMsg(t('auth.password.mismatch'))
            return
        }

        setSaving(true)
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        setSaving(false)

        if (error) {
            setErrorMsg(describeAuthError(error))
            return
        }

        setSuccess(true)
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-modal-form" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{t('profile.settings.password')}</h2>
                    <p className="ns-modal-form-subtitle">{t('profile.passwordModal.subtitle')}</p>

                    {success ? (
                        <div className="alert alert-success py-2" role="alert">
                            {t('profile.passwordModal.success')}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            {errorMsg && (
                                <div className="alert alert-danger py-2" role="alert">
                                    {errorMsg}
                                </div>
                            )}

                            <div className="ns-mb-field">
                                <label className="ns-label" htmlFor="newPassword">{t('auth.password.new')}</label>
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
                                <label className="ns-label" htmlFor="confirmPassword">{t('profile.passwordModal.confirm')}</label>
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
                                {saving ? t('common.saving') : t('profile.passwordModal.submit')}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
