import logo from '../assets/logo_ns_right.png'

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
            "Forget paperwork and endless waiting. Manage contracts and deposits digitally, with a process that's 100% online and legally valid in El Salvador.",
    },
    {
        icon: 'bi-shield-check',
        title: '3. Secure Payment',
        description:
            'Fast and protected transactions with escrow. Your investment is backed by our advanced security technology.',
    },
]

export default function LandingPage({ onLogin, onSignup }) {
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
            </main>
        </div>
    )
}