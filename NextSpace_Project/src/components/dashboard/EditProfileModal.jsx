import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabaseClient'
import { DASH } from '../../lib/symbols'

export default function EditProfileModal({ user, onClose, onUpdated }) {
    const { t } = useTranslation()
    const meta = user.user_metadata || {}
    const [firstName, setFirstName] = useState(meta.first_name || '')
    const [lastName, setLastName] = useState(meta.last_name || '')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        const first = firstName.trim()
        const last = lastName.trim()
        if (!first || !last) {
            setErrorMsg(t('profile.editModal.nameRequired'))
            return
        }

        setSaving(true)
        setErrorMsg('')

        // The users row first (it's what owners, tenants and Rony read), then
        // the account metadata, so a failure never leaves the two different.
        const { data: authData } = await supabase.auth.getUser()
        const { data: dbData, error: dbError } = await supabase
            .from('users')
            .update({ first_name: first, last_name: last })
            .eq('id_supabase_auth', authData?.user?.id || user.id)
            .select('dui')

        if (dbError || !dbData || dbData.length === 0) {
            console.error('Profile: users row not updated', dbError)
            setSaving(false)
            setErrorMsg(t('profile.editModal.saveError'))
            return
        }

        const { error: authError } = await supabase.auth.updateUser({
            data: { first_name: first, last_name: last },
        })

        setSaving(false)
        if (authError) {
            setErrorMsg(t('profile.editModal.saveError'))
            return
        }

        onUpdated()
        onClose()
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-modal-form" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{t('profile.edit')}</h2>
                    <p className="ns-modal-form-subtitle">
                        {meta.account_type === 'property-owner'
                            ? t('profile.editModal.subtitleOwner')
                            : t('profile.editModal.subtitleBusiness')}
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
                                <i className="bi bi-person-vcard"></i> DUI {meta.dui || DASH}
                            </span>
                            <small>{t('profile.editModal.fixed')}</small>
                        </div>

                        <div className="row g-2">
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="editFirstName">{t('auth.signup.firstName')}</label>
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
                                    <label className="ns-label" htmlFor="editLastName">{t('auth.signup.lastName')}</label>
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

                        <button type="submit" className="ns-submit-btn" disabled={saving}>
                            {saving ? t('common.saving') : t('profile.editModal.save')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}