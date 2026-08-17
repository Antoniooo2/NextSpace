import { useState } from 'react'
import logo from '../assets/logo_ns.png'
import { supabase } from '../lib/supabaseClient'

export default function LoginForm({ onSwitchToSignup, onLogoClick, onLoginSuccess }) {
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

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        setLoading(false)

        if (error) {
            setErrorMsg(error.message)
            return
        }

        console.log('Sesión iniciada:', data.session)
        if (onLoginSuccess) onLoginSuccess()
    }

    return (
        <div className="ns-card">
            <div className="ns-logo">
                <button
                    type="button"
                    className="ns-logo-btn"
                    onClick={() => onLogoClick && onLogoClick()}
                    aria-label="Go to homepage"
                >
                    <img src={logo} alt="NextSpace" className="ns-logo-img" />
                </button>
            </div>

            <p className="ns-tagline">
                Simple rental management for entrepreneurs
            </p>
            <h1 className="ns-welcome-title">Welcome to NextSpace</h1>

            {errorMsg && (
                <div className="alert alert-danger py-2" role="alert">
                    {errorMsg}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
                <div className="ns-mb-field">
                    <label htmlFor="loginEmail" className="ns-label">
                        Your email address
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
                            placeholder="example@nextspace.com"
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
                            Your password
                        </label>
                        <a href="#" className="ns-forgot-link">
                            Forgot it?
                        </a>
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
                            placeholder="••••••••"
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
                                showPassword ? 'Hide password' : 'Show password'
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
                        Keep me signed in
                    </label>
                </div>

                <button type="submit" className="ns-submit-btn ns-submit-btn-icon" disabled={loading}>
                    {loading ? 'Signing in...' : 'Enter my space'}
                    <i className="bi bi-arrow-right"></i>
                </button>
            </form>

            <p className="ns-footer-text">
                Not part of NextSpace yet?{' '}
                <button
                    type="button"
                    className="ns-link-btn"
                    onClick={onSwitchToSignup}
                >
                    Create my account
                </button>
            </p>
        </div>
    )
}