import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import ElSalvadorMap from '../ElSalvadorMap.jsx'
import { MAP_PINS } from '../../lib/mapPins'
import { departmentKey, loadDepartmentCounts } from '../../lib/departmentSpaces'
import './animatedMap.css'

const EASE = [0.22, 1, 0.36, 1]
const PIN_STEP = 0.08

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

function MapPin({ pin, count, hasData, animated, shown, delay, active, onShow, onHide }) {
    const { t } = useTranslation()
    const detail = hasData ? (count > 0 ? t('map.spaces', { count }) : t('map.noSpaces')) : null
    const label = detail ? `${pin.department}. ${detail}` : pin.department

    const dropProps = animated
        ? {
              initial: { opacity: 0, y: -28 },
              animate: shown ? { opacity: 1, y: 0 } : { opacity: 0, y: -28 },
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

export default function AnimatedMap({ animated, shown, drawDelay = 0, drawSeconds = 2 }) {
    const { t } = useTranslation()
    const counts = useDepartmentCounts()
    const [activePin, setActivePin] = useState(null)
    const pinsStart = drawDelay + drawSeconds - 0.2

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

    const departmentVariants = useMemo(
        () => ({
            hidden: { opacity: 0 },
            visible: (index = 0) => ({
                opacity: 1,
                transition: { duration: 0.5, ease: EASE, delay: drawDelay + 0.4 + index * 0.05 },
            }),
        }),
        [drawDelay],
    )

    const outlineProps = animated
        ? {
              initial: { pathLength: 0, opacity: 0 },
              animate: shown ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 },
              transition: {
                  pathLength: { duration: drawSeconds, ease: 'easeInOut', delay: drawDelay },
                  opacity: { duration: 0.2, delay: drawDelay },
              },
          }
        : {}

    const departmentProps = animated
        ? { variants: departmentVariants, initial: 'hidden', animate: shown ? 'visible' : 'hidden' }
        : {}

    return (
        <div className={`ns-map-canvas${activePin ? ' has-active' : ''}`}>
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
                    count={counts ? counts.get(departmentKey(pin.department)) || 0 : 0}
                    hasData={Boolean(counts)}
                    animated={animated}
                    shown={shown}
                    delay={pinsStart + index * PIN_STEP}
                    active={activePin === pin.department}
                    onShow={() => setActivePin(pin.department)}
                    onHide={() => setActivePin((current) => (current === pin.department ? null : current))}
                />
            ))}
        </div>
    )
}
