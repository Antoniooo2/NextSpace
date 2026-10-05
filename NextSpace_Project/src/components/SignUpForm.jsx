import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import logo from '../assets/NextSpace_logo.png'
import { supabase } from '../lib/supabaseClient'
import { describeAuthError } from '../lib/supabaseErrors'
import { BRAND_NAME } from '../lib/brand'
import { PASSWORD_MASK } from '../lib/symbols'
import LanguageSwitcher from './LanguageSwitcher.jsx'

const ACCOUNT_TYPES = [
    {
        id: 'business',
        icon: 'bi-shop',
        key: 'business',
    },
    {
        id: 'property-owner',
        icon: 'bi-building',
        key: 'owner',
    },
]

export default function SignupForm({ onSwitchToLogin, onLogoClick }) {
    const { t } = useTranslation()
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [dui, setDui] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [accountType, setAccountType] = useState('business')
    const [focusedField, setFocusedField] = useState(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [successMsg, setSuccessMsg] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')
        setSuccessMsg('')
        if (!/^\d{8}-\d$/.test(dui)) {
            setErrorMsg(t('auth.signup.duiFormat'))
            return
        }
        setLoading(true)

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    dui,
                    account_type: accountType,
                },
            },
        })

        setLoading(false)

        if (error) {
            // A DUI already registered (or rejected by the database) comes
            // back as a generic database error.
            setErrorMsg(
                /database error/i.test(error.message)
                    ? t('auth.signup.couldNotCreate')
                    : describeAuthError(error)
            )
            return
        }

        setSuccessMsg(t('auth.signup.success'))
    }

    return (
        <div className="ns-card">
            <div className="ns-card-lang">
                <LanguageSwitcher />
            </div>
            <div className="ns-logo">
                <button
                    type="button"
                    className="ns-logo-btn"
                    onClick={() => onLogoClick && onLogoClick()}
                    aria-label={t('auth.goHome')}
                >
                    <img src={logo} alt={BRAND_NAME} className="ns-logo-img" />
                </button>
            </div>

            <h1 className="ns-title">{t('auth.signup.title')}</h1>
            <p className="ns-subtitle">{t('auth.signup.subtitle')}</p>

            {errorMsg && (
                <div className="alert alert-danger py-2" role="alert">
                    {errorMsg}
                </div>
            )}
            {successMsg && (
                <div className="alert alert-success py-2" role="alert">
                    {successMsg}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
                <div className="ns-mb-field">
                    <label htmlFor="firstName" className="ns-label">{t('auth.signup.firstName')}</label>
                    <div className={`ns-input-group input-group ${focusedField === 'firstName' ? 'focused' : ''}`}>
                        <span className="input-group-text"><i className="bi bi-person"></i></span>
                        <input
                            id="firstName" type="text" className="form-control" placeholder={t('auth.signup.firstNamePlaceholder')}
                            value={firstName} onChange={(e) => setFirstName(e.target.value)}
                            onFocus={() => setFocusedField('firstName')} onBlur={() => setFocusedField(null)}
                        />
                    </div>
                </div>

                <div className="ns-mb-field">
                    <label htmlFor="lastName" className="ns-label">{t('auth.signup.lastName')}</label>
                    <div className={`ns-input-group input-group ${focusedField === 'lastName' ? 'focused' : ''}`}>
                        <span className="input-group-text"><i className="bi bi-person"></i></span>
                        <input
                            id="lastName" type="text" className="form-control" placeholder={t('auth.signup.lastNamePlaceholder')}
                            value={lastName} onChange={(e) => setLastName(e.target.value)}
                            onFocus={() => setFocusedField('lastName')} onBlur={() => setFocusedField(null)}
                        />
                    </div>
                </div>

                <div className="ns-mb-field">
                    <label htmlFor="email" className="ns-label">{t('auth.signup.email')}</label>
                    <div className={`ns-input-group input-group ${focusedField === 'email' ? 'focused' : ''}`}>
                        <span className="input-group-text"><i className="bi bi-envelope"></i></span>
                        <input
                            id="email" type="email" className="form-control" placeholder={t('auth.emailPlaceholder')}
                            value={email} onChange={(e) => setEmail(e.target.value)}
                            onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                        />
                    </div>
                </div>

                <div className="ns-mb-field">
                    <label htmlFor="dui" className="ns-label">{t('auth.signup.dui')}</label>
                    <div className={`ns-input-group input-group ${focusedField === 'dui' ? 'focused' : ''}`}>
                        <span className="input-group-text"><i className="bi bi-person-badge"></i></span>
                        <input
                            id="dui" type="text" className="form-control" placeholder="00000000-0"
                            value={dui}
                            onChange={(e) => {
                                // Digits only, dash added before the last one: 00000000-0.
                                const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
                                setDui(digits.length > 8 ? `${digits.slice(0, 8)}-${digits.slice(8)}` : digits)
                            }}
                            inputMode="numeric"
                            onFocus={() => setFocusedField('dui')} onBlur={() => setFocusedField(null)}
                        />
                    </div>
                </div>

                <div className="ns-mb-field">
                    <label htmlFor="password" className="ns-label">{t('auth.signup.password')}</label>
                    <div className={`ns-input-group input-group ${focusedField === 'password' ? 'focused' : ''}`}>
                        <span className="input-group-text"><i className="bi bi-lock"></i></span>
                        <input
                            id="password" type={showPassword ? 'text' : 'password'} className="form-control" placeholder={PASSWORD_MASK}
                            value={password} onChange={(e) => setPassword(e.target.value)}
                            onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
                        />
                        <button
                            type="button" className="ns-eye-btn" onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                        >
                            <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                        </button>
                    </div>
                </div>

                <div className="ns-mb-field">
                    <span className="ns-account-type-label">{t('auth.signup.accountType')}</span>
                    <div className="row g-2">
                        {ACCOUNT_TYPES.map((type) => (
                            <div className="col-6" key={type.id}>
                                <div
                                    className={`ns-type-card ${accountType === type.id ? 'selected' : ''}`}
                                    role="button" tabIndex={0}
                                    onClick={() => setAccountType(type.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            setAccountType(type.id)
                                        }
                                    }}
                                >
                                    <i className={`bi ${type.icon} ns-type-icon`}></i>
                                    <div className="ns-type-title">{t(`auth.signup.types.${type.key}.title`)}</div>
                                    <p className="ns-type-desc">{t(`auth.signup.types.${type.key}.description`)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <button type="submit" className="ns-submit-btn" disabled={loading}>
                    {loading ? t('auth.signup.submitting') : t('auth.signup.submit')}
                </button>
            </form>

            <p className="ns-footer-text">
                {t('auth.signup.haveAccount')}{' '}
                <button type="button" className="ns-link-btn" onClick={onSwitchToLogin}>
                    {t('auth.signup.signIn')}
                </button>
            </p>
        </div>
    )
}