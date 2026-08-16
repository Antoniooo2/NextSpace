import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/NextSpace_logo.png'
import './AuthPages.css'

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/new-password`,
    })

    setLoading(false)

    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setMessage('Check your email for a link to reset your password.')
    }
  }

  return (
    <div className="ns-auth-wrapper">
      <div className="ns-card">
        <div className="ns-logo-row">
          <img src={logo} alt="NextSpace" className="ns-logo-img" />
        </div>

        <h1 className="ns-title">Forgot your password?</h1>
        <p className="ns-subtitle">
          Enter your email and we'll send you a link to reset it.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="ns-field">
            <label className="ns-label">Your email address</label>
            <input
              className="ns-input"
              type="email"
              placeholder="example@yourproperty.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button className="ns-button" type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send reset link →'}
          </button>
        </form>

        {message && <p className="ns-message">{message}</p>}

        <div className="ns-link-row">
          <Link className="ns-link" to="/">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword