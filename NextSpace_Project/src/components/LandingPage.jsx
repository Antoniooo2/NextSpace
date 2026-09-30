import logo from '../assets/logo_ns_right.png'
import usePlatformFee from '../hooks/usePlatformFee'
import { feeSplit, formatRate } from '../lib/platformFee'
import { money } from '../lib/money'

const STATS = [
    { value: '500+', label: 'Active Spaces' },
    { value: '1,200+', label: 'Businesses Boosted' },
    { value: '300', label: 'Monthly Contracts' },
    { value: '14', label: 'Departments' },
]

const STEPS = [
    {
        icon: 'bi-search',
        title: '1. Explore',
        description:
            'Filter by area, images, and property type. Our AI matches you with the best available spaces for your business needs.',
    },
    {
        icon: 'bi-file-earmark-text',
        title: '2. Digital Contract',
        description:
            "Forget paperwork and endless waiting. Request a space, receive the owner's offer and sign it in the app. Your lease, its clauses and every change stay in one place.",
    },
    {
        icon: 'bi-shield-check',
        title: '3. Secure Payment',
        description:
            'Pay your rent each month by card through Wompi and get your receipt instantly. NextSpace collects it on the owner’s behalf and reminds you before it’s due.',
    },
]

export default function LandingPage({ onLogin, onSignup }) {
    const feeRate = usePlatformFee()
    const example = feeSplit(1000, feeRate)

    return (
        <div className="ns-landing">
            <header className="ns-navbar">
                <div className="ns-navbar-inner">
                    <div className="ns-navbar-brand">
                        <img src={logo} alt="NextSpace" className="ns-navbar-logo" />
                    </div>
                    <div className="ns-navbar-actions">
                        <button
                            type="button"
                            className="ns-nav-btn ns-nav-btn-ghost"
                            onClick={onLogin}
                        >
                            Log in
                        </button>
                        <button
                            type="button"
                            className="ns-nav-btn ns-nav-btn-filled"
                            onClick={onSignup}
                        >
                            Create account
                        </button>
                    </div>
                </div>
            </header>

            <main>
                <section className="ns-hero">
                    <div className="ns-hero-inner">
                        <div className="ns-hero-copy">
                            <span className="ns-hero-badge">
                                Leader in Commercial Real Estate
                            </span>
                            <h1 className="ns-hero-title">
                                Find the perfect space for your business,{' '}
                                <span className="ns-hero-highlight">without complications</span>
                            </h1>
                            <p className="ns-hero-subtitle">
                                Our intelligent platform connects entrepreneurs with the best
                                commercial spaces across San Salvador and the rest of El Salvador.
                            </p>
                            <div className="ns-hero-cta">
                                <button
                                    type="button"
                                    className="ns-hero-btn ns-hero-btn-filled"
                                    onClick={onLogin}
                                >
                                    Book a space
                                </button>
                                <button
                                    type="button"
                                    className="ns-hero-btn ns-hero-btn-filled"
                                    onClick={onSignup}
                                >
                                    List my space
                                </button>
                            </div>
                            <div className="ns-hero-rating">
                                <div className="ns-avatar-stack">
                                    <span className="ns-avatar">JM</span>
                                    <span className="ns-avatar">RL</span>
                                    <span className="ns-avatar">AC</span>
                                </div>
                                <span className="ns-rating-text">
                                    <strong>4.9/5</strong> rating based on +500 reviews
                                </span>
                            </div>
                        </div>

                        <div className="ns-hero-visual">
                            <div className="ns-hero-mockup">
                                <i className="bi bi-geo-alt-fill ns-mockup-pin"></i>
                                <div className="ns-mockup-card">
                                    <span className="ns-avatar ns-avatar-sm">LF</span>
                                    <div>
                                        <div className="ns-mockup-card-title">Las Cascadas Mall</div>
                                        <div className="ns-mockup-card-rating">
                                            <i className="bi bi-star-fill"></i> 5.0
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="ns-stats">
                    <div className="ns-stats-inner">
                        {STATS.map((stat) => (
                            <div className="ns-stat" key={stat.label}>
                                <div className="ns-stat-value">{stat.value}</div>
                                <div className="ns-stat-label">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="ns-steps">
                    <h2 className="ns-steps-title">
                        Finding your perfect space is this simple
                    </h2>
                    <div className="ns-steps-grid">
                        {STEPS.map((step) => (
                            <div className="ns-step" key={step.title}>
                                <div className="ns-step-icon">
                                    <i className={`bi ${step.icon}`}></i>
                                </div>
                                <h3 className="ns-step-title">{step.title}</h3>
                                <p className="ns-step-desc">{step.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="ns-pricing" aria-labelledby="ns-pricing-title">
                    <h2 className="ns-steps-title" id="ns-pricing-title">
                        How NextSpace earns: {formatRate(feeRate)} of each rent, and only when it's paid
                    </h2>
                    <div className="ns-pricing-grid">
                        <div className="ns-pricing-card">
                            <span className="ns-pricing-tag">For businesses</span>
                            <div className="ns-pricing-price">Free</div>
                            <p className="ns-pricing-sub">You pay exactly the rent in your lease. No fees on top.</p>
                            <ul>
                                <li><i className="bi bi-check2"></i> Search, compare and save spaces</li>
                                <li><i className="bi bi-check2"></i> Ask Rony, our AI advisor</li>
                                <li><i className="bi bi-check2"></i> Sign your lease and pay rent online</li>
                                <li><i className="bi bi-check2"></i> Receipts and statements for every month</li>
                            </ul>
                        </div>
                        <div className="ns-pricing-card is-featured">
                            <span className="ns-pricing-tag">For property owners</span>
                            <div className="ns-pricing-price">
                                {formatRate(feeRate)} <small>of each rent payment</small>
                            </div>
                            <p className="ns-pricing-sub">Listing is free. We only earn when your tenant pays.</p>
                            <ul>
                                <li><i className="bi bi-check2"></i> Tenants found and screened for you</li>
                                <li><i className="bi bi-check2"></i> Online contracts, renewals and reminders</li>
                                <li><i className="bi bi-check2"></i> Rent collected and sent to your bank account</li>
                                <li><i className="bi bi-check2"></i> Reports, exports and Rony’s insights</li>
                            </ul>
                        </div>
                        <div className="ns-pricing-card ns-pricing-example">
                            <span className="ns-pricing-tag">Example</span>
                            <dl>
                                <div>
                                    <dt>Your tenant pays</dt>
                                    <dd>{money(example.gross)}</dd>
                                </div>
                                <div>
                                    <dt>NextSpace fee ({formatRate(feeRate)})</dt>
                                    <dd>−{money(example.fee)}</dd>
                                </div>
                                <div className="is-net">
                                    <dt>You receive</dt>
                                    <dd>{money(example.net)}</dd>
                                </div>
                            </dl>
                            <p className="ns-pricing-sub mb-0">
                                Deposits carry no fee. No monthly plans, no listing costs.
                            </p>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}