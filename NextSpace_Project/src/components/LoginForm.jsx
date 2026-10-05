import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logo from '../assets/NextSpace_logo.png'
import { supabase } from '../lib/supabaseClient'
import { describeAuthError } from '../lib/supabaseErrors'
import { BRAND_NAME, BRAND_VALUES } from '../lib/brand'
import { PASSWORD_MASK } from '../lib/symbols'
import LanguageSwitcher from './LanguageSwitcher.jsx'

export default function LoginForm({ onSwitchToSignup, onLogoClick }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [rememberMe, setRememberMe] = useState(false)
    const [focusedField, setFocusedField] = useState(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')
        setLoading(true)

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        setLoading(false)

        if (error) {
            setErrorMsg(describeAuthError(error))
            return
        }

        navigate('/dashboard')
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

            <p className="ns-tagline">
                {t('auth.login.tagline')}
            </p>
            <h1 className="ns-welcome-title">{t('auth.login.welcome', BRAND_VALUES)}</h1>

            {errorMsg && (
                <div className="alert alert-danger py-2" role="alert">
                    {errorMsg}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
                <div className="ns-mb-field">
                    <label htmlFor="loginEmail" className="ns-label">
                        {t('auth.login.email')}
                    </label>
                    <div
                        className={`ns-input-group input-group ${focusedField === 'email' ? 'focused' : ''
                            }`}
                    >
                        <span className="input-group-text">
                            <i className="bi bi-envelope"></i>
                        </span>
                        <input
                            id="loginEmail"
                            type="email"
                            className="form-control"
                            placeholder={t('auth.emailPlaceholder')}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onFocus={() => setFocusedField('email')}
                            onBlur={() => setFocusedField(null)}
                        />
                    </div>
                </div>

                <div className="ns-mb-field">
                    <div className="ns-label-row">
                        <label htmlFor="loginPassword" className="ns-label">
                            {t('auth.login.password')}
                        </label>
                        <Link to="/forgot-password" className="ns-forgot-link">
                            {t('auth.login.forgot')}
                        </Link>
                    </div>
                    <div
                        className={`ns-input-group input-group ${focusedField === 'password' ? 'focused' : ''
                            }`}
                    >
                        <span className="input-group-text">
                            <i className="bi bi-lock"></i>
                        </span>
                        <input
                            id="loginPassword"
                            type={showPassword ? 'text' : 'password'}
                            className="form-control"
                            placeholder={PASSWORD_MASK}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onFocus={() => setFocusedField('password')}
                            onBlur={() => setFocusedField(null)}
                        />
                        <button
                            type="button"
                            className="ns-eye-btn"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={
                                showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                            }
                        >
                            <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                        </button>
                    </div>
                </div>

                <div className="ns-checkbox-field form-check">
                    <input
                        type="checkbox"
                        className="form-check-input"
                        id="rememberMe"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <label className="form-check-label ns-checkbox-label" htmlFor="rememberMe">
                        {t('auth.login.remember')}
                    </label>
                </div>

                <button type="submit" className="ns-submit-btn ns-submit-btn-icon" disabled={loading}>
                    {loading ? t('auth.login.submitting') : t('auth.login.submit')}
                    <i className="bi bi-arrow-right"></i>
                </button>
            </form>

            <p className="ns-footer-text">
                {t('auth.login.noAccount', BRAND_VALUES)}{' '}
                <button
                    type="button"
                    className="ns-link-btn"
                    onClick={onSwitchToSignup}
                >
                    {t('auth.login.createAccount')}
                </button>
            </p>
        </div>
    )
}
