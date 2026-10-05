import { useTranslation } from 'react-i18next'
import logo from '../assets/logo_ns_right.png'
import usePlatformFee from '../hooks/usePlatformFee'
import { feeSplit, formatRate } from '../lib/platformFee'
import { money } from '../lib/money'
import { ADVISOR_NAME, BRAND_NAME, PAYMENT_PROVIDER } from '../lib/brand'
import LanguageSwitcher from './LanguageSwitcher.jsx'

const STATS = [
    { value: '500+', labelKey: 'stats.activeSpaces' },
    { value: '1,200+', labelKey: 'stats.businessesBoosted' },
    { value: '300', labelKey: 'stats.monthlyContracts' },
    { value: '14', labelKey: 'stats.departments' },
]

const STEPS = [
    { icon: 'bi-search', key: 'steps.explore' },
    { icon: 'bi-file-earmark-text', key: 'steps.contract' },
    { icon: 'bi-shield-check', key: 'steps.payment' },
]

const BRAND_VALUES = {
    brand: BRAND_NAME,
    advisor: ADVISOR_NAME,
    provider: PAYMENT_PROVIDER,
}

export default function LandingPage({ onLogin, onSignup }) {
    const { t } = useTranslation()
    const feeRate = usePlatformFee()
    const example = feeSplit(1000, feeRate)
    const rate = formatRate(feeRate)

    return (
        <div className="ns-landing">
            <header className="ns-navbar">
                <div className="ns-navbar-inner">
                    <div className="ns-navbar-brand">
                        <img src={logo} alt={BRAND_NAME} className="ns-navbar-logo" />
                    </div>
                    <div className="ns-navbar-actions">
                        <LanguageSwitcher />
                        <button
                            type="button"
                            className="ns-nav-btn ns-nav-btn-ghost"
                            onClick={onLogin}
                        >
                            {t('navbar.login')}
                        </button>
                        <button
                            type="button"
                            className="ns-nav-btn ns-nav-btn-filled"
                            onClick={onSignup}
                        >
                            {t('navbar.signup')}
                        </button>
                    </div>
                </div>
            </header>

            <main>
                <section className="ns-hero">
                    <div className="ns-hero-inner">
                        <div className="ns-hero-copy">
                            <span className="ns-hero-badge">
                                {t('hero.badge')}
                            </span>
                            <h1 className="ns-hero-title">
                                {t('hero.titleStart')}{' '}
                                <span className="ns-hero-highlight">{t('hero.titleHighlight')}</span>
                            </h1>
                            <p className="ns-hero-subtitle">
                                {t('hero.subtitle')}
                            </p>
                            <div className="ns-hero-cta">
                                <button
                                    type="button"
                                    className="ns-hero-btn ns-hero-btn-filled"
                                    onClick={onLogin}
                                >
                                    {t('hero.bookSpace')}
                                </button>
                                <button
                                    type="button"
                                    className="ns-hero-btn ns-hero-btn-filled"
                                    onClick={onSignup}
                                >
                                    {t('hero.listSpace')}
                                </button>
                            </div>
                            <div className="ns-hero-rating">
                                <div className="ns-avatar-stack">
                                    <span className="ns-avatar">JM</span>
                                    <span className="ns-avatar">RL</span>
                                    <span className="ns-avatar">AC</span>
                                </div>
                                <span className="ns-rating-text">
                                    <strong>4.9/5</strong> {t('hero.ratingText')}
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
                            <div className="ns-stat" key={stat.labelKey}>
                                <div className="ns-stat-value">{stat.value}</div>
                                <div className="ns-stat-label">{t(stat.labelKey)}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="ns-steps">
                    <h2 className="ns-steps-title">
                        {t('steps.title')}
                    </h2>
                    <div className="ns-steps-grid">
                        {STEPS.map((step) => (
                            <div className="ns-step" key={step.key}>
                                <div className="ns-step-icon">
                                    <i className={`bi ${step.icon}`}></i>
                                </div>
                                <h3 className="ns-step-title">{t(`${step.key}.title`)}</h3>
                                <p className="ns-step-desc">{t(`${step.key}.description`, BRAND_VALUES)}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="ns-pricing" aria-labelledby="ns-pricing-title">
                    <h2 className="ns-steps-title" id="ns-pricing-title">
                        {t('pricing.title', { ...BRAND_VALUES, rate })}
                    </h2>
                    <div className="ns-pricing-grid">
                        <div className="ns-pricing-card">
                            <span className="ns-pricing-tag">{t('pricing.businesses.tag')}</span>
                            <div className="ns-pricing-price">{t('pricing.businesses.price')}</div>
                            <p className="ns-pricing-sub">{t('pricing.businesses.sub')}</p>
                            <ul>
                                <li><i className="bi bi-check2"></i> {t('pricing.businesses.features.search')}</li>
                                <li><i className="bi bi-check2"></i> {t('pricing.businesses.features.advisor', BRAND_VALUES)}</li>
                                <li><i className="bi bi-check2"></i> {t('pricing.businesses.features.lease')}</li>
                                <li><i className="bi bi-check2"></i> {t('pricing.businesses.features.receipts')}</li>
                            </ul>
                        </div>
                        <div className="ns-pricing-card is-featured">
                            <span className="ns-pricing-tag">{t('pricing.owners.tag')}</span>
                            <div className="ns-pricing-price">
                                {rate} <small>{t('pricing.owners.priceSuffix')}</small>
                            </div>
                            <p className="ns-pricing-sub">{t('pricing.owners.sub')}</p>
                            <ul>
                                <li><i className="bi bi-check2"></i> {t('pricing.owners.features.tenants')}</li>
                                <li><i className="bi bi-check2"></i> {t('pricing.owners.features.contracts')}</li>
                                <li><i className="bi bi-check2"></i> {t('pricing.owners.features.collection')}</li>
                                <li><i className="bi bi-check2"></i> {t('pricing.owners.features.reports', BRAND_VALUES)}</li>
                            </ul>
                        </div>
                        <div className="ns-pricing-card ns-pricing-example">
                            <span className="ns-pricing-tag">{t('pricing.example.tag')}</span>
                            <dl>
                                <div>
                                    <dt>{t('pricing.example.tenantPays')}</dt>
                                    <dd>{money(example.gross)}</dd>
                                </div>
                                <div>
                                    <dt>{t('pricing.example.fee', { ...BRAND_VALUES, rate })}</dt>
                                    <dd>{'\u2212'}{money(example.fee)}</dd>
                                </div>
                                <div className="is-net">
                                    <dt>{t('pricing.example.youReceive')}</dt>
                                    <dd>{money(example.net)}</dd>
                                </div>
                            </dl>
                            <p className="ns-pricing-sub mb-0">
                                {t('pricing.example.note')}
                            </p>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}
