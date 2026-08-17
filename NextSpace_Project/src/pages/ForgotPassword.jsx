import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/NextSpace_logo.png'
import './AuthPages.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ForgotPassword() {
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
    if (!email.trim()) return 'Please enter your email address.'
    if (!EMAIL_REGEX.test(email.trim())) return 'Please enter a valid email address.'
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
        text: 'We could not process your request: ' + error.message,
      })
    } else {
      setStep(2)
    }
  }

  // --- Paso 2: verificar código y cambiar la contraseña ---
  const validateStep2 = () => {
    const errs = {}
    if (!code.trim() || code.trim().length < 6) {
      errs.code = 'Enter the 6-digit code from your email.'
    }
    if (!password) {
      errs.password = 'Please enter a new password.'
    } else if (password.length < 6) {
      errs.password = 'Password must be at least 6 characters.'
    }
    if (!confirmPassword) {
      errs.confirmPassword = 'Please confirm your new password.'
    } else if (password && confirmPassword !== password) {
      errs.confirmPassword = 'Passwords do not match.'
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
        text: 'Invalid or expired code: ' + verifyError.message,
      })
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (updateError) {
      setStatus({
        type: 'error',
        text: 'We could not update your password: ' + updateError.message,
      })
    } else {
      setStatus({ type: 'success', text: 'Password updated successfully. Redirecting...' })
      setTimeout(() => navigate('/'), 2000)
    }
  }

  return (
    <div className="ns-auth-wrapper">
      <div className="ns-card">

        <img src={logo} alt="NextSpace" className="ns-logo-img" />

        {step === 1 ? (
          <>
            <h1 className="ns-title">Forgot your password?</h1>
            <p className="ns-subtitle">
              Enter your email and we'll send you a 6-digit code.
            </p>

            <form onSubmit={handleSendCode} noValidate>
              <div className="ns-field">
                <label className="ns-label" htmlFor="email">Your email address</label>
                <div className="ns-input-wrap">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  <input
                    id="email"
                    className={`ns-input ${fieldError ? 'ns-input-error' : ''}`}
                    type="email"
                    placeholder="example@yourproperty.com"
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
                {loading ? 'Sending...' : 'Send code →'}
              </button>
            </form>

            <div className="ns-link-row">
              <Link className="ns-link" to="/">Back to sign in</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="ns-title">Enter your code</h1>
            <p className="ns-subtitle">
              We sent a 6-digit code to {email}. Enter it below along with your new password.
            </p>

            <form onSubmit={handleResetPassword} noValidate>
              <div className="ns-field">
                <label className="ns-label" htmlFor="code">6-digit code</label>
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
                <label className="ns-label" htmlFor="password">New password</label>
                <div className="ns-input-wrap">
                  <input
                    id="password"
                    className={`ns-input ${step2Errors.password ? 'ns-input-error' : ''}`}
                    type="password"
                    placeholder="••••••••"
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
                <label className="ns-label" htmlFor="confirmPassword">Confirm new password</label>
                <div className="ns-input-wrap">
                  <input
                    id="confirmPassword"
                    className={`ns-input ${step2Errors.confirmPassword ? 'ns-input-error' : ''}`}
                    type="password"
                    placeholder="••••••••"
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
                {loading ? 'Saving...' : 'Reset password →'}
              </button>
            </form>

            <div className="ns-link-row">
              <button
                type="button"
                className="ns-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setStep(1)}
              >
                Use a different email
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