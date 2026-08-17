import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/NextSpace_logo.png'
import './AuthPages.css'

function Welcome() {
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser()

      if (error || !data?.user) {
        // No hay sesión activa, regresa al login
        navigate('/')
        return
      }

      const name = data.user.user_metadata?.first_name || data.user.email
      setFirstName(name)
      setLoading(false)
    }

    loadUser()
  }, [navigate])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading) {
    return (
      <div className="ns-auth-wrapper">
        <div className="ns-card">
          <p className="ns-subtitle">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ns-auth-wrapper">
      <div className="ns-card" style={{ textAlign: 'center' }}>
        <img src={logo} alt="NextSpace" className="ns-logo-img" />

        <h1 className="ns-title">Welcome, {firstName}!</h1>
        <p className="ns-subtitle">You have successfully logged in.</p>

        <button className="ns-button" type="button" onClick={handleLogout}>
          Log out
        </button>

        <div className="ns-link-row">
          <Link className="ns-link" to="/">Back to home</Link>
        </div>
      </div>
    </div>
  )
}

export default Welcome