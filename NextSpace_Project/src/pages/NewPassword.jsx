import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/NextSpace_logo.png'
import './AuthPages.css'

function NewPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({ password: '', confirmPassword: '' })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const validate = () => {
    const newErrors = { password: '', confirmPassword: '' }

    if (!password) {
      newErrors.password = 'Please enter a new password.'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.'
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password.'
    } else if (password && confirmPassword !== password) {
      newErrors.confirmPassword = 'Passwords do not match.'
    }

    return newErrors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus(null)

    const newErrors = validate()
    setErrors(newErrors)
    if (newErrors.password || newErrors.confirmPassword) {
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setStatus({
        type: 'error',
        text: 'We could not update your password: ' + error.message,
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

        <h1 className="ns-title">Set a new password</h1>
        <p className="ns-subtitle">Choose a strong password for your account.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="ns-field">
            <label className="ns-label" htmlFor="password">New password</label>
            <div className="ns-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <input
                id="password"
                className={`ns-input ${errors.password ? 'ns-input-error' : ''}`}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (errors.password) setErrors((prev) => ({ ...prev, password: '' }))
                }}
              />
            </div>
            {errors.password && <span className="ns-error-text">{errors.password}</span>}
          </div>

          <div className="ns-field">
            <label className="ns-label" htmlFor="confirmPassword">Confirm new password</label>
            <div className="ns-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <input
                id="confirmPassword"
                className={`ns-input ${errors.confirmPassword ? 'ns-input-error' : ''}`}
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }))
                }}
              />
            </div>
            {errors.confirmPassword && <span className="ns-error-text">{errors.confirmPassword}</span>}
          </div>

          <button className="ns-button" type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save new password →'}
          </button>
        </form>

        {status && (
          <p className={`ns-message ${status.type === 'success' ? 'ns-message-success' : 'ns-message-error'}`}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  )
}

export default NewPassword