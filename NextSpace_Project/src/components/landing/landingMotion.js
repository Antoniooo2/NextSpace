import { useEffect } from 'react'
import { useReducedMotion } from 'motion/react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import useAccessibility from '../../hooks/useAccessibility'

const EASE = [0.22, 1, 0.36, 1]

const VIEWPORT = { once: true, margin: '0px 0px -80px 0px' }

export const fadeUp = {
    hidden: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
}

export const staggerGroup = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}

export const staggerItem = {
    hidden: { opacity: 0, y: 24 },
    visible: (index = 0) => ({
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.6,
            ease: EASE,
            delay: index * 0.12,
            staggerChildren: 0.07,
            delayChildren: 0.25 + index * 0.12,
        },
    }),
}

export const heroVisual = {
    hidden: { opacity: 0, y: 40, scale: 0.96 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.9, ease: EASE, delay: 0.25 },
    },
}

export const listItem = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
}

export const cardHover = { y: -6, transition: { duration: 0.25, ease: EASE } }

export const buttonHover = { y: -2, scale: 1.03, transition: { duration: 0.2, ease: EASE } }

export const buttonTap = { scale: 0.97 }

export function revealProps(enabled, variants = fadeUp, custom) {
    if (!enabled) return {}
    return { variants, custom, initial: 'hidden', whileInView: 'visible', viewport: VIEWPORT }
}

export function nestedProps(enabled, variants = listItem) {
    return enabled ? { variants } : {}
}

export function hoverProps(enabled, hover = cardHover, tap) {
    if (!enabled) return {}
    return tap ? { whileHover: hover, whileTap: tap } : { whileHover: hover }
}

export function useLandingMotion() {
    const prefersReduced = useReducedMotion()
    const { settings } = useAccessibility()
    return !prefersReduced && !settings.highContrast
}

export function useSmoothScroll(enabled) {
    useEffect(() => {
        if (!enabled) return undefined
        const lenis = new Lenis({
            autoRaf: true,
            duration: 1.1,
            allowNestedScroll: true,
        })
        return () => lenis.destroy()
    }, [enabled])
}
