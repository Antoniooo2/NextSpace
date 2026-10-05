import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'motion/react'
import { money } from '../../lib/money'
import AnimatedMap from './AnimatedMap.jsx'
import './heroVisual.css'

const EASE = [0.22, 1, 0.36, 1]
const DRAW_DELAY = 0.6
const DRAW_SECONDS = 1.8
const CARDS_START = DRAW_DELAY + DRAW_SECONDS
const CARD_STEP = 0.35
const PARALLAX_SPRING = { stiffness: 70, damping: 20, mass: 0.6 }
const PARALLAX_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 768px)'

function clampUnit(value) {
    return Math.max(-1, Math.min(1, value))
}

function useParallax(rootRef, enabled) {
    const pointerX = useMotionValue(0)
    const pointerY = useMotionValue(0)
    const x = useSpring(pointerX, PARALLAX_SPRING)
    const y = useSpring(pointerY, PARALLAX_SPRING)

    useEffect(() => {
        const reset = () => {
            pointerX.set(0)
            pointerY.set(0)
        }
        const hero = rootRef.current ? rootRef.current.closest('.ns-hero') : null
        if (!enabled || !hero || typeof window.matchMedia !== 'function') {
            reset()
            return undefined
        }
        const media = window.matchMedia(PARALLAX_QUERY)
        const handleMove = (event) => {
            if (event.pointerType !== 'mouse' || !media.matches) return
            const rect = hero.getBoundingClientRect()
            pointerX.set(clampUnit(((event.clientX - rect.left) / rect.width - 0.5) * 2))
            pointerY.set(clampUnit(((event.clientY - rect.top) / rect.height - 0.5) * 2))
        }
        hero.addEventListener('pointermove', handleMove)
        hero.addEventListener('pointerleave', reset)
        return () => {
            hero.removeEventListener('pointermove', handleMove)
            hero.removeEventListener('pointerleave', reset)
            reset()
        }
    }, [enabled, rootRef, pointerX, pointerY])

    return { x, y }
}

function useLayer(pointer, depth) {
    const x = useTransform(pointer.x, (value) => value * depth)
    const y = useTransform(pointer.y, (value) => value * depth)
    return { x, y }
}

function FloatingCard({ className, layer, animated, shown, order, floatSeconds, floatDelay, children }) {
    const delay = CARDS_START + order * CARD_STEP

    const floatProps = animated
        ? {
              animate: { y: [0, -7, 0] },
              transition: {
                  duration: floatSeconds,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  delay: delay + floatDelay,
              },
          }
        : {}

    const entryProps = animated
        ? {
              initial: { opacity: 0, y: 14, scale: 0.94 },
              animate: shown ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 14, scale: 0.94 },
              transition: { duration: 0.6, ease: EASE, delay },
          }
        : {}

    return (
        <motion.div className={`ns-hero-float ${className}`} style={layer}>
            <motion.div {...floatProps}>
                <motion.div className="ns-mockup-card" {...entryProps}>
                    {children}
                </motion.div>
            </motion.div>
        </motion.div>
    )
}

function StorefrontPhoto() {
    return (
        <svg className="ns-hero-photo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <rect className="ns-hero-photo-sky" width="48" height="48" />
            <rect className="ns-hero-photo-wall" x="7" y="16" width="34" height="32" />
            <path className="ns-hero-photo-awning" d="M5 14h38l-3 8H8z" />
            <path className="ns-hero-photo-stripe" d="M14 14h5l-1 8h-5zM24 14h5l1 8h-5zM34 14h5l2 8h-5z" />
            <rect className="ns-hero-photo-glass" x="11" y="27" width="14" height="12" rx="1.5" />
            <rect className="ns-hero-photo-door" x="29" y="27" width="8" height="21" rx="1" />
        </svg>
    )
}

export default function HeroVisual({ animated }) {
    const { t } = useTranslation()
    const rootRef = useRef(null)
    const inView = useInView(rootRef, { once: true })
    const shown = !animated || inView
    const pointer = useParallax(rootRef, animated)
    const dotsLayer = useLayer(pointer, -4)
    const mapLayer = useLayer(pointer, -9)
    const mallLayer = useLayer(pointer, 14)
    const propertyLayer = useLayer(pointer, 20)
    const noticeLayer = useLayer(pointer, 17)

    return (
        <div className="ns-hero-mockup" ref={rootRef}>
            <motion.div className="ns-hero-dots" aria-hidden="true" style={dotsLayer} />
            <motion.div className="ns-hero-map-layer" style={mapLayer}>
                <AnimatedMap
                    animated={animated}
                    shown={shown}
                    drawDelay={DRAW_DELAY}
                    drawSeconds={DRAW_SECONDS}
                />
            </motion.div>

            <FloatingCard
                className="is-property"
                layer={propertyLayer}
                animated={animated}
                shown={shown}
                order={1}
                floatSeconds={6.4}
                floatDelay={0.9}
            >
                <StorefrontPhoto />
                <div>
                    <div className="ns-mockup-card-title">{t('heroCards.property.zone')}</div>
                    <div className="ns-hero-card-price">
                        {t('heroCards.property.price', { price: money(850) })}
                    </div>
                </div>
            </FloatingCard>

            <FloatingCard
                className="is-notice"
                layer={noticeLayer}
                animated={animated}
                shown={shown}
                order={2}
                floatSeconds={4.8}
                floatDelay={1.7}
            >
                <span className="ns-hero-card-check" aria-hidden="true">
                    <i className="bi bi-check-lg"></i>
                </span>
                <div>
                    <div className="ns-mockup-card-title">{t('heroCards.notice.title')}</div>
                    <div className="ns-hero-card-sub">{t('heroCards.notice.time')}</div>
                </div>
            </FloatingCard>

            <FloatingCard
                className="is-mall"
                layer={mallLayer}
                animated={animated}
                shown={shown}
                order={0}
                floatSeconds={5.6}
                floatDelay={0}
            >
                <span className="ns-avatar ns-avatar-sm">LF</span>
                <div>
                    <div className="ns-mockup-card-title">Las Cascadas Mall</div>
                    <div className="ns-mockup-card-rating">
                        <i className="bi bi-star-fill"></i> 5.0
                    </div>
                </div>
            </FloatingCard>
        </div>
    )
}
