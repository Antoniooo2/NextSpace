import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/NextSpace_logo.png'
import './AuthPages.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [status, setStatus] = useState(null) // { type: 'success' | 'error', text: string }
  const [loading, setLoading] = useState(false)

  const validate = () => {
    if (!email.trim()) {
      return 'Please enter your email address.'
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      return 'Please enter a valid email address.'
    }
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus(null)

    const validationError = validate()
    if (validationError) {
      setFieldError(validationError)
      return
    }
    setFieldError('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/new-password`,
    })

    setLoading(false)

    if (error) {
      setStatus({
        type: 'error',
        text: 'We could not process your request: ' + error.message,
      })
    } else {
      setStatus({
        type: 'success',
        text: 'Check your email for a link to reset your password.',
      })
    }
  }

  console.log('debug supabase url', import.meta.env.VITE_SUPABASE_URL)

  return (
    <div className="ns-auth-wrapper">
      <div className="ns-card">

        <img src={logo} alt="NextSpace" className="ns-logo-img" />

        <h1 className="ns-title">Forgot your password?</h1>
        <p className="ns-subtitle">
          Enter your email and we'll send you a link to reset it.
        </p>

        <form onSubmit={handleSubmit} noValidate>
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
            {loading ? 'Sending...' : 'Send reset link →'}
          </button>
        </form>

        {status && (
          <p className={`ns-message ${status.type === 'success' ? 'ns-message-success' : 'ns-message-error'}`}>
            {status.text}
          </p>
        )}

        <div className="ns-link-row">
          <Link className="ns-link" to="/">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword