import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useInView } from 'motion/react'
import ElSalvadorMap from '../ElSalvadorMap.jsx'
import { MAP_PINS } from '../../lib/mapPins'
import { departmentKey, loadDepartmentCounts } from '../../lib/departmentSpaces'
import { BRAND_NAME } from '../../lib/brand'
import { revealProps } from './landingMotion'
import './mapSection.css'

const EASE = [0.22, 1, 0.36, 1]
const OUTLINE_SECONDS = 2.2
const PINS_START = 1.9
const PIN_STEP = 0.14

const departmentVariants = {
    hidden: { opacity: 0 },
    visible: (index = 0) => ({
        opacity: 1,
        transition: { duration: 0.5, ease: EASE, delay: 0.9 + index * 0.06 },
    }),
}

const CROWDED_PINS = new Set(
    MAP_PINS.filter((pin) =>
        MAP_PINS.some(
            (other) =>
                other !== pin &&
                other.left - pin.left > 0 &&
                other.left - pin.left < 6 &&
                Math.abs(other.top - pin.top) < 8,
        ),
    ).map((pin) => pin.department),
)

function tooltipShift(left) {
    if (left < 25) return '-15%'
    if (left > 75) return '-85%'
    return '-50%'
}

function useDepartmentCounts() {
    const [counts, setCounts] = useState(null)

    useEffect(() => {
        let cancelled = false
        loadDepartmentCounts().then((result) => {
            if (!cancelled) setCounts(result)
        })
        return () => {
            cancelled = true
        }
    }, [])

    return counts
}

function MapPin({ pin, index, count, hasData, animated, shown, active, onShow, onHide }) {
    const { t } = useTranslation()
    const delay = PINS_START + index * PIN_STEP
    const detail = hasData ? (count > 0 ? t('map.spaces', { count }) : t('map.noSpaces')) : null
    const label = detail ? `${pin.department}. ${detail}` : pin.department

    const dropProps = animated
        ? {
              initial: { opacity: 0, y: -36 },
              animate: shown ? { opacity: 1, y: 0 } : { opacity: 0, y: -36 },
              transition: { type: 'spring', bounce: 0.35, duration: 0.8, delay },
          }
        : {}

    const tooltipProps = animated
        ? {
              initial: { opacity: 0, y: 6 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: 6 },
              transition: { duration: 0.18, ease: EASE },
          }
        : {}

    return (
        <div
            className={`ns-map-pin${active ? ' is-active' : ''}`}
            style={{ left: `${pin.left}%`, top: `${pin.top}%` }}
        >
            {animated && shown && (
                <motion.span
                    className="ns-map-pin-pulse"
                    aria-hidden="true"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: [0.45, 0], scale: [0.6, 2] }}
                    transition={{
                        duration: 2,
                        ease: 'easeOut',
                        repeat: Infinity,
                        repeatDelay: 0.6,
                        delay: delay + 0.6,
                    }}
                />
            )}
            <motion.button
                type="button"
                className="ns-map-pin-btn"
                aria-label={label}
                onMouseEnter={onShow}
                onMouseLeave={onHide}
                onFocus={onShow}
                onBlur={onHide}
                onClick={onShow}
                {...dropProps}
            >
                <i className="bi bi-geo-alt-fill" aria-hidden="true"></i>
                {hasData && count > 0 && (
                    <span className={`ns-map-pin-count${CROWDED_PINS.has(pin.department) ? ' is-left' : ''}`}>
                        {count}
                    </span>
                )}
            </motion.button>
            <AnimatePresence>
                {active && (
                    <motion.span
                        className="ns-map-tooltip"
                        role="tooltip"
                        style={{ x: tooltipShift(pin.left) }}
                        {...tooltipProps}
                    >
                        <strong>{pin.department}</strong>
                        <span>{t('map.capital', { capital: pin.capital })}</span>
                        {detail && <span className="ns-map-tooltip-count">{detail}</span>}
                    </motion.span>
                )}
            </AnimatePresence>
        </div>
    )
}

export default function MapSection({ animated }) {
    const { t } = useTranslation()
    const counts = useDepartmentCounts()
    const canvasRef = useRef(null)
    const inView = useInView(canvasRef, { once: true, margin: '0px 0px -120px 0px' })
    const shown = !animated || inView
    const [activePin, setActivePin] = useState(null)

    useEffect(() => {
        if (!activePin) return undefined
        const handlePointer = (event) => {
            if (!(event.target instanceof Element) || !event.target.closest('.ns-map-pin')) {
                setActivePin(null)
            }
        }
        const handleKey = (event) => {
            if (event.key === 'Escape') setActivePin(null)
        }
        document.addEventListener('pointerdown', handlePointer)
        document.addEventListener('keydown', handleKey)
        return () => {
            document.removeEventListener('pointerdown', handlePointer)
            document.removeEventListener('keydown', handleKey)
        }
    }, [activePin])

    const outlineProps = animated
        ? {
              initial: { pathLength: 0, opacity: 0 },
              animate: shown ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 },
              transition: {
                  pathLength: { duration: OUTLINE_SECONDS, ease: 'easeInOut' },
                  opacity: { duration: 0.2 },
              },
          }
        : {}

    const departmentProps = animated
        ? { variants: departmentVariants, initial: 'hidden', animate: shown ? 'visible' : 'hidden' }
        : {}

    return (
        <section className="ns-map" aria-labelledby="ns-map-title">
            <motion.h2 className="ns-steps-title" id="ns-map-title" {...revealProps(animated)}>
                {t('map.title')}
            </motion.h2>
            <motion.p className="ns-map-subtitle" {...revealProps(animated)}>
                {t('map.subtitle', { brand: BRAND_NAME })}
            </motion.p>
            <div className="ns-map-canvas" ref={canvasRef}>
                <ElSalvadorMap
                    className="ns-map-svg"
                    role="img"
                    aria-label={t('map.ariaLabel')}
                    outlineProps={outlineProps}
                    departmentProps={departmentProps}
                />
                {MAP_PINS.map((pin, index) => (
                    <MapPin
                        key={pin.department}
                        pin={pin}
                        index={index}
                        count={counts ? counts.get(departmentKey(pin.department)) || 0 : 0}
                        hasData={Boolean(counts)}
                        animated={animated}
                        shown={shown}
                        active={activePin === pin.department}
                        onShow={() => setActivePin(pin.department)}
                        onHide={() => setActivePin((current) => (current === pin.department ? null : current))}
                    />
                ))}
            </div>
        </section>
    )
}
