import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { describeAuthError } from '../lib/supabaseErrors'
import { BRAND_NAME } from '../lib/brand'
import { ARROW_RIGHT, PASSWORD_MASK } from '../lib/symbols'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import logo from '../assets/NextSpace_logo.png'
import './AuthPages.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ForgotPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // step 1 = pedir el código, step 2 = escribir código + nueva contraseña
  const [step, setStep] = useState(1)

  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step2Errors, setStep2Errors] = useState({})

  // --- Paso 1: pedir el código ---
  const validateEmail = () => {
    if (!email.trim()) return t('auth.forgot.emailRequired')
    if (!EMAIL_REGEX.test(email.trim())) return t('auth.forgot.emailInvalid')
    return ''
  }

  const handleSendCode = async (e) => {
    e.preventDefault()
    setStatus(null)

    const validationError = validateEmail()
    if (validationError) {
      setFieldError(validationError)
      return
    }
    setFieldError('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())

    setLoading(false)

    if (error) {
      setStatus({
        type: 'error',
        text: t('auth.forgot.requestFailed', { message: describeAuthError(error) }),
      })
    } else {
      setStep(2)
    }
  }

  // --- Paso 2: verificar código y cambiar la contraseña ---
  const validateStep2 = () => {
    const errs = {}
    if (!code.trim() || code.trim().length < 6) {
      errs.code = t('auth.forgot.codeRequired')
    }
    if (!password) {
      errs.password = t('auth.password.required')
    } else if (password.length < 6) {
      errs.password = t('auth.password.tooShort')
    }
    if (!confirmPassword) {
      errs.confirmPassword = t('auth.password.confirmRequired')
    } else if (password && confirmPassword !== password) {
      errs.confirmPassword = t('auth.password.mismatch')
    }
    return errs
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setStatus(null)

    const errs = validateStep2()
    setStep2Errors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'recovery',
    })

    if (verifyError) {
      setLoading(false)
      setStatus({
        type: 'error',
        text: t('auth.forgot.invalidCode', { message: describeAuthError(verifyError) }),
      })
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (updateError) {
      setStatus({
        type: 'error',
        text: t('auth.password.updateFailed', { message: describeAuthError(updateError) }),
      })
    } else {
      setStatus({ type: 'success', text: t('auth.password.updated') })
      setTimeout(() => navigate('/'), 2000)
    }
  }

  return (
    <div className="ns-auth-wrapper">
      <div className="ns-card">
        <div className="ns-card-lang">
          <LanguageSwitcher />
        </div>

        <img src={logo} alt={BRAND_NAME} className="ns-logo-img" />

        {step === 1 ? (
          <>
            <h1 className="ns-title">{t('auth.forgot.title')}</h1>
            <p className="ns-subtitle">
              {t('auth.forgot.subtitle')}
            </p>

            <form onSubmit={handleSendCode} noValidate>
              <div className="ns-field">
                <label className="ns-label" htmlFor="email">{t('auth.login.email')}</label>
                <div className="ns-input-wrap">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  <input
                    id="email"
                    className={`ns-input ${fieldError ? 'ns-input-error' : ''}`}
                    type="email"
                    placeholder={t('auth.forgot.emailPlaceholder')}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (fieldError) setFieldError('')
                    }}
                  />
                </div>
                {fieldError && <span className="ns-error-text">{fieldError}</span>}
              </div>

              <button className="ns-button" type="submit" disabled={loading}>
                {loading ? t('common.sending') : `${t('auth.forgot.sendCode')} ${ARROW_RIGHT}`}
              </button>
            </form>

            <div className="ns-link-row">
              <Link className="ns-link" to="/">{t('auth.forgot.backToSignIn')}</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="ns-title">{t('auth.forgot.codeTitle')}</h1>
            <p className="ns-subtitle">
              {t('auth.forgot.codeSubtitle', { email })}
            </p>

            <form onSubmit={handleResetPassword} noValidate>
              <div className="ns-field">
                <label className="ns-label" htmlFor="code">{t('auth.forgot.codeLabel')}</label>
                <div className="ns-input-wrap">
                  <input
                    id="code"
                    className={`ns-input ${step2Errors.code ? 'ns-input-error' : ''}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, ''))
                      if (step2Errors.code) setStep2Errors((p) => ({ ...p, code: '' }))
                    }}
                  />
                </div>
                {step2Errors.code && <span className="ns-error-text">{step2Errors.code}</span>}
              </div>

              <div className="ns-field">
                <label className="ns-label" htmlFor="password">{t('auth.password.new')}</label>
                <div className="ns-input-wrap">
                  <input
                    id="password"
                    className={`ns-input ${step2Errors.password ? 'ns-input-error' : ''}`}
                    type="password"
                    placeholder={PASSWORD_MASK}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (step2Errors.password) setStep2Errors((p) => ({ ...p, password: '' }))
                    }}
                  />
                </div>
                {step2Errors.password && <span className="ns-error-text">{step2Errors.password}</span>}
              </div>

              <div className="ns-field">
                <label className="ns-label" htmlFor="confirmPassword">{t('auth.password.confirm')}</label>
                <div className="ns-input-wrap">
                  <input
                    id="confirmPassword"
                    className={`ns-input ${step2Errors.confirmPassword ? 'ns-input-error' : ''}`}
                    type="password"
                    placeholder={PASSWORD_MASK}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (step2Errors.confirmPassword) setStep2Errors((p) => ({ ...p, confirmPassword: '' }))
                    }}
                  />
                </div>
                {step2Errors.confirmPassword && <span className="ns-error-text">{step2Errors.confirmPassword}</span>}
              </div>

              <button className="ns-button" type="submit" disabled={loading}>
                {loading ? t('common.saving') : `${t('auth.forgot.reset')} ${ARROW_RIGHT}`}
              </button>
            </form>

            <div className="ns-link-row">
              <button
                type="button"
                className="ns-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setStep(1)}
              >
                {t('auth.forgot.differentEmail')}
              </button>
            </div>
          </>
        )}

        {status && (
          <p className={`ns-message ${status.type === 'success' ? 'ns-message-success' : 'ns-message-error'}`}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  )
}

export default ForgotPassword