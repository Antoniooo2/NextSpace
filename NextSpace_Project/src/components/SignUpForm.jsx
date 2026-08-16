import { useState } from 'react'
import logo from '../assets/logo_ns.png'

const ACCOUNT_TYPES = [
    {
        id: 'business',
        icon: 'bi-shop',
        title: 'Business',
        description: 'I want to open or find my business',
    },
    {
        id: 'property-owner',
        icon: 'bi-building',
        title: 'Property Owner',
        description: 'I want to rent my property',
    },
]

export default function SignupForm({ onSwitchToLogin, onLogoClick }) {
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [dui, setDui] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [accountType, setAccountType] = useState('business')
    const [focusedField, setFocusedField] = useState(null)

    const handleSubmit = (e) => {
        e.preventDefault()
        console.log({ firstName, lastName, dui, phone, email, password, accountType })
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

            <h1 className="ns-title">Create your account</h1>
            <p className="ns-subtitle">It's free and takes less than 2 minutes.</p>

            <form onSubmit={handleSubmit} noValidate>
                <div className="ns-mb-field">
                    <label htmlFor="firstName" className="ns-label">
                        First name
                    </label>
                    <div
                        className={`ns-input-group input-group ${focusedField === 'firstName' ? 'focused' : ''
                            }`}
                    >
                        <span className="input-group-text">
                            <i className="bi bi-person"></i>
                        </span>
                        <input
                            id="firstName"
                            type="text"
                            className="form-control"
                            placeholder="Ronaldo"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            onFocus={() => setFocusedField('firstName')}
                            onBlur={() => setFocusedField(null)}
                        />
                    </div>
                </div>

                <div className="ns-mb-field">
                    <label htmlFor="lastName" className="ns-label">
                        Last name
                    </label>
                    <div
                        className={`ns-input-group input-group ${focusedField === 'lastName' ? 'focused' : ''
                            }`}
                    >
                        <span className="input-group-text">
                            <i className="bi bi-person"></i>
                        </span>
                        <input
                            id="lastName"
                            type="text"
                            className="form-control"
                            placeholder="Mendoza"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            onFocus={() => setFocusedField('lastName')}
                            onBlur={() => setFocusedField(null)}
                        />
                    </div>
                </div>

                <div className="ns-mb-field">
                    <label htmlFor="email" className="ns-label">
                        Email address
                    </label>
                    <div
                        className={`ns-input-group input-group ${focusedField === 'email' ? 'focused' : ''
                            }`}
                    >
                        <span className="input-group-text">
                            <i className="bi bi-envelope"></i>
                        </span>
                        <input
                            id="email"
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
                    <label htmlFor="dui" className="ns-label">
                        DUI
                    </label>
                    <div
                        className={`ns-input-group input-group ${focusedField === 'dui' ? 'focused' : ''
                            }`}
                    >
                        <span className="input-group-text">
                            <i class="bi bi-person-badge"></i>
                        </span>
                        <input
                            id="dui"
                            type="text"
                            className="form-control"
                            placeholder="00000000-0"
                            value={dui}
                            onChange={(e) => setDui(e.target.value)}
                            onFocus={() => setFocusedField('dui')}
                            onBlur={() => setFocusedField(null)}
                        />
                    </div>
                </div>

                <div className="ns-mb-field">
                    <label htmlFor="phone" className="ns-label">
                        Phone Number
                    </label>
                    <div
                        className={`ns-input-group input-group ${focusedField === 'phone' ? 'focused' : ''
                            }`}
                    >
                        <span className="input-group-text">
                            <i class="bi bi-phone"></i>
                        </span>
                        <input
                            id="phone"
                            type="text"
                            className="form-control"
                            placeholder="7517-1234"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            onFocus={() => setFocusedField('phone')}
                            onBlur={() => setFocusedField(null)}
                        />
                    </div>
                </div>

                <div className="ns-mb-field">
                    <label htmlFor="password" className="ns-label">
                        Password
                    </label>
                    <div
                        className={`ns-input-group input-group ${focusedField === 'password' ? 'focused' : ''
                            }`}
                    >
                        <span className="input-group-text">
                            <i className="bi bi-lock"></i>
                        </span>
                        <input
                            id="password"
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

                <div className="ns-mb-field">
                    <span className="ns-account-type-label">Account type</span>
                    <div className="row g-2">
                        {ACCOUNT_TYPES.map((type) => (
                            <div className="col-6" key={type.id}>
                                <div
                                    className={`ns-type-card ${accountType === type.id ? 'selected' : ''
                                        }`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setAccountType(type.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            setAccountType(type.id)
                                        }
                                    }}
                                >
                                    <i className={`bi ${type.icon} ns-type-icon`}></i>
                                    <div className="ns-type-title">{type.title}</div>
                                    <p className="ns-type-desc">{type.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <button type="submit" className="ns-submit-btn">
                    Create my account
                </button>
            </form>

            <p className="ns-footer-text">
                Already have an account?{' '}
                <button
                    type="button"
                    className="ns-link-btn"
                    onClick={onSwitchToLogin}
                >
                    Sign in
                </button>
            </p>
        </div>
    )
}
