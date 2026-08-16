import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/NextSpace_logo.png'
import './AuthPages.css'

function NewPassword() {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setMessage('Password updated successfully')
      setTimeout(() => navigate('/'), 2000)
    }
  }

  return (
    <div className="ns-auth-wrapper">
      <div className="ns-card">
        <div className="ns-logo-row">
          <img src={logo} alt="NextSpace" className="ns-logo-img" />
        </div>

        <h1 className="ns-title">Set a new password</h1>
        <p className="ns-subtitle">
          Choose a strong password for your account.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="ns-field">
            <label className="ns-label">New password</label>
            <input
              className="ns-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button className="ns-button" type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save new password →'}
          </button>
        </form>

        {message && <p className="ns-message">{message}</p>}
      </div>
    </div>
  )
}

export default NewPassword