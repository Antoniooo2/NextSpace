import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import logo from '../assets/logo_ns_right.png'
import usePlatformFee from '../hooks/usePlatformFee'
import { feeSplit, formatRate } from '../lib/platformFee'
import { money } from '../lib/money'
import { ADVISOR_NAME, BRAND_NAME, PAYMENT_PROVIDER } from '../lib/brand'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import AccessibilityMenu from './AccessibilityMenu.jsx'
import CountUp from './landing/CountUp.jsx'
import {
    buttonHover,
    buttonTap,
    fadeUp,
    heroMockupCard,
    heroVisual,
    hoverProps,
    nestedProps,
    revealProps,
    staggerGroup,
    staggerItem,
    useLandingMotion,
    useSmoothScroll,
} from './landing/landingMotion'

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
    const animated = useLandingMotion()
    useSmoothScroll(animated)
    const buttonMotion = hoverProps(animated, buttonHover, buttonTap)
    const cardMotion = hoverProps(animated)
    const item = nestedProps(animated)
    const heroItem = nestedProps(animated, fadeUp)

    return (
        <div className="ns-landing">
            <motion.header
                className="ns-navbar"
                initial={animated ? { opacity: 0, y: -16 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="ns-navbar-inner">
                    <div className="ns-navbar-brand">
                        <img src={logo} alt={BRAND_NAME} className="ns-navbar-logo" />
                    </div>
                    <div className="ns-navbar-actions">
                        <LanguageSwitcher />
                        <AccessibilityMenu />
                        <motion.button
                            {...buttonMotion}
                            type="button"
                            className="ns-nav-btn ns-nav-btn-ghost"
                            onClick={onLogin}
                        >
                            {t('navbar.login')}
                        </motion.button>
                        <motion.button
                            {...buttonMotion}
                            type="button"
                            className="ns-nav-btn ns-nav-btn-filled"
                            onClick={onSignup}
                        >
                            {t('navbar.signup')}
                        </motion.button>
                    </div>
                </div>
            </motion.header>

            <main key={animated ? 'animated' : 'static'}>
                <section className="ns-hero">
                    <div className="ns-hero-inner">
                        <motion.div className="ns-hero-copy" {...revealProps(animated, staggerGroup)}>
                            <motion.span className="ns-hero-badge" {...heroItem}>
                                {t('hero.badge')}
                            </motion.span>
                            <motion.h1 className="ns-hero-title" {...heroItem}>
                                {t('hero.titleStart')}{' '}
                                <span className="ns-hero-highlight">{t('hero.titleHighlight')}</span>
                            </motion.h1>
                            <motion.p className="ns-hero-subtitle" {...heroItem}>
                                {t('hero.subtitle')}
                            </motion.p>
                            <motion.div className="ns-hero-cta" {...heroItem}>
                                <motion.button
                                    {...buttonMotion}
                                    type="button"
                                    className="ns-hero-btn ns-hero-btn-filled"
                                    onClick={onLogin}
                                >
                                    {t('hero.bookSpace')}
                                </motion.button>
                                <motion.button
                                    {...buttonMotion}
                                    type="button"
                                    className="ns-hero-btn ns-hero-btn-filled"
                                    onClick={onSignup}
                                >
                                    {t('hero.listSpace')}
                                </motion.button>
                            </motion.div>
                            <motion.div className="ns-hero-rating" {...heroItem}>
                                <div className="ns-avatar-stack">
                                    <span className="ns-avatar">JM</span>
                                    <span className="ns-avatar">RL</span>
                                    <span className="ns-avatar">AC</span>
                                </div>
                                <span className="ns-rating-text">
                                    <strong>4.9/5</strong> {t('hero.ratingText')}
                                </span>
                            </motion.div>
                        </motion.div>

                        <motion.div className="ns-hero-visual" {...revealProps(animated, heroVisual)}>
                            <div className="ns-hero-mockup">
                                <motion.i
                                    className="bi bi-geo-alt-fill ns-mockup-pin"
                                    animate={animated ? { y: [0, -8, 0] } : undefined}
                                    transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
                                ></motion.i>
                                <motion.div className="ns-mockup-card" {...nestedProps(animated, heroMockupCard)}>
                                    <span className="ns-avatar ns-avatar-sm">LF</span>
                                    <div>
                                        <div className="ns-mockup-card-title">Las Cascadas Mall</div>
                                        <div className="ns-mockup-card-rating">
                                            <i className="bi bi-star-fill"></i> 5.0
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                <motion.section className="ns-stats" {...revealProps(animated)}>
                    <div className="ns-stats-inner">
                        {STATS.map((stat, index) => (
                            <motion.div
                                className="ns-stat"
                                key={stat.labelKey}
                                {...revealProps(animated, staggerItem, index)}
                            >
                                <CountUp className="ns-stat-value" value={stat.value} enabled={animated} />
                                <div className="ns-stat-label">{t(stat.labelKey)}</div>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                <section className="ns-steps">
                    <motion.h2 className="ns-steps-title" {...revealProps(animated)}>
                        {t('steps.title')}
                    </motion.h2>
                    <div className="ns-steps-grid">
                        {STEPS.map((step, index) => (
                            <motion.div
                                className="ns-step"
                                key={step.key}
                                {...revealProps(animated, staggerItem, index)}
                                {...cardMotion}
                            >
                                <div className="ns-step-icon">
                                    <i className={`bi ${step.icon}`}></i>
                                </div>
                                <h3 className="ns-step-title">{t(`${step.key}.title`)}</h3>
                                <p className="ns-step-desc">{t(`${step.key}.description`, BRAND_VALUES)}</p>
                            </motion.div>
                        ))}
                    </div>
                </section>

                <section className="ns-pricing" aria-labelledby="ns-pricing-title">
                    <motion.h2 className="ns-steps-title" id="ns-pricing-title" {...revealProps(animated)}>
                        {t('pricing.title', { ...BRAND_VALUES, rate })}
                    </motion.h2>
                    <div className="ns-pricing-grid">
                        <motion.div
                            className="ns-pricing-card"
                            {...revealProps(animated, staggerItem, 0)}
                            {...cardMotion}
                        >
                            <span className="ns-pricing-tag">{t('pricing.businesses.tag')}</span>
                            <div className="ns-pricing-price">{t('pricing.businesses.price')}</div>
                            <p className="ns-pricing-sub">{t('pricing.businesses.sub')}</p>
                            <ul>
                                <motion.li {...item}><i className="bi bi-check2"></i> {t('pricing.businesses.features.search')}</motion.li>
                                <motion.li {...item}><i className="bi bi-check2"></i> {t('pricing.businesses.features.advisor', BRAND_VALUES)}</motion.li>
                                <motion.li {...item}><i className="bi bi-check2"></i> {t('pricing.businesses.features.lease')}</motion.li>
                                <motion.li {...item}><i className="bi bi-check2"></i> {t('pricing.businesses.features.receipts')}</motion.li>
                            </ul>
                        </motion.div>
                        <motion.div
                            className="ns-pricing-card is-featured"
                            {...revealProps(animated, staggerItem, 1)}
                            {...cardMotion}
                        >
                            <span className="ns-pricing-tag">{t('pricing.owners.tag')}</span>
                            <div className="ns-pricing-price">
                                {rate} <small>{t('pricing.owners.priceSuffix')}</small>
                            </div>
                            <p className="ns-pricing-sub">{t('pricing.owners.sub')}</p>
                            <ul>
                                <motion.li {...item}><i className="bi bi-check2"></i> {t('pricing.owners.features.tenants')}</motion.li>
                                <motion.li {...item}><i className="bi bi-check2"></i> {t('pricing.owners.features.contracts')}</motion.li>
                                <motion.li {...item}><i className="bi bi-check2"></i> {t('pricing.owners.features.collection')}</motion.li>
                                <motion.li {...item}><i className="bi bi-check2"></i> {t('pricing.owners.features.reports', BRAND_VALUES)}</motion.li>
                            </ul>
                        </motion.div>
                        <motion.div
                            className="ns-pricing-card ns-pricing-example"
                            {...revealProps(animated, staggerItem, 2)}
                            {...cardMotion}
                        >
                            <span className="ns-pricing-tag">{t('pricing.example.tag')}</span>
                            <dl>
                                <motion.div {...item}>
                                    <dt>{t('pricing.example.tenantPays')}</dt>
                                    <dd>{money(example.gross)}</dd>
                                </motion.div>
                                <motion.div {...item}>
                                    <dt>{t('pricing.example.fee', { ...BRAND_VALUES, rate })}</dt>
                                    <dd>{'\u2212'}{money(example.fee)}</dd>
                                </motion.div>
                                <motion.div className="is-net" {...item}>
                                    <dt>{t('pricing.example.youReceive')}</dt>
                                    <dd>{money(example.net)}</dd>
                                </motion.div>
                            </dl>
                            <p className="ns-pricing-sub mb-0">
                                {t('pricing.example.note')}
                            </p>
                        </motion.div>
                    </div>
                </section>
            </main>
        </div>
    )
}
