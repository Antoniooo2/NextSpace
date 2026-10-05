import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ACCESSIBILITY_STORAGE_KEY,
    AccessibilityContext,
    DEFAULT_ACCESSIBILITY,
} from '../hooks/useAccessibility'
import { readableText, speak, speechLangFor, speechSupported, stopSpeaking } from '../lib/speech'
import './accessibility.css'

const CARD_SELECTOR =
    '.ns-mk-card, .ns-own-card, .ns-pf-saved-card, .ns-contract-card, .ns-lease-card, .advisor-prop-card'
const TEXT_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption'
const CONTROL_SELECTOR =
    'button, a, input, select, textarea, label, summary, [role="button"], [role="switch"], [contenteditable="true"]'
const IGNORE_SELECTOR = '.ns-a11y'
const SPEAKING_ATTR = 'data-ns-speaking'

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(ACCESSIBILITY_STORAGE_KEY) || 'null')
        if (saved && typeof saved === 'object') {
            return Object.fromEntries(
                Object.keys(DEFAULT_ACCESSIBILITY).map((key) => [key, saved[key] === true]),
            )
        }
    } catch (error) {
        console.warn('Could not read the accessibility preferences:', error)
    }
    return DEFAULT_ACCESSIBILITY
}

function elementFrom(target) {
    if (target instanceof Element) return target
    return target && target.parentElement ? target.parentElement : null
}

export default function AccessibilityProvider({ children }) {
    const { t, i18n } = useTranslation()
    const [settings, setSettings] = useState(loadSettings)
    const [speaking, setSpeaking] = useState(false)
    const activeRef = useRef(null)
    const armedRef = useRef(null)
    const sessionRef = useRef(0)

    const readActive = speechSupported && settings.readAloud
    const lang = speechLangFor(i18n.resolvedLanguage)

    useLayoutEffect(() => {
        const root = document.documentElement
        root.classList.toggle('ns-a11y-read', readActive)
        root.classList.toggle('ns-a11y-large', settings.largeText)
        root.classList.toggle('ns-a11y-contrast', settings.highContrast)
    }, [readActive, settings.largeText, settings.highContrast])

    useEffect(() => {
        try {
            localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(settings))
        } catch (error) {
            console.warn('Could not save the accessibility preferences:', error)
        }
    }, [settings])

    const clearHighlight = useCallback(() => {
        if (activeRef.current) activeRef.current.removeAttribute(SPEAKING_ATTR)
        activeRef.current = null
    }, [])

    const stop = useCallback(() => {
        sessionRef.current += 1
        armedRef.current = null
        stopSpeaking()
        clearHighlight()
        setSpeaking(false)
    }, [clearHighlight])

    const readElement = useCallback(
        (element) => {
            const text = readableText(element)
            if (!text) return
            clearHighlight()
            sessionRef.current += 1
            const session = sessionRef.current
            const started = speak(text, lang, () => {
                if (sessionRef.current !== session) return
                clearHighlight()
                setSpeaking(false)
            })
            if (!started) {
                setSpeaking(false)
                return
            }
            element.setAttribute(SPEAKING_ATTR, 'true')
            activeRef.current = element
            setSpeaking(true)
        },
        [clearHighlight, lang],
    )

    useEffect(() => {
        if (!readActive) return undefined

        const handleClick = (event) => {
            const target = elementFrom(event.target)
            if (!target || target.closest(IGNORE_SELECTOR)) return

            const card = target.closest(CARD_SELECTOR)
            if (card) {
                if (armedRef.current === card) {
                    armedRef.current = null
                    return
                }
                event.preventDefault()
                event.stopPropagation()
                armedRef.current = card
                readElement(card)
                return
            }

            armedRef.current = null
            if (target.closest(CONTROL_SELECTOR)) return
            const block = target.closest(TEXT_SELECTOR)
            if (block) readElement(block)
        }

        const handleKey = (event) => {
            if (event.key === 'Escape') stop()
        }

        document.addEventListener('click', handleClick, true)
        document.addEventListener('keydown', handleKey)
        return () => {
            document.removeEventListener('click', handleClick, true)
            document.removeEventListener('keydown', handleKey)
            stop()
        }
    }, [readActive, readElement, stop])

    useEffect(() => {
        window.addEventListener('pagehide', stopSpeaking)
        return () => {
            window.removeEventListener('pagehide', stopSpeaking)
            stopSpeaking()
        }
    }, [])

    const toggle = useCallback((key) => {
        setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
    }, [])

    const value = useMemo(
        () => ({ settings, speechAvailable: speechSupported, speaking, toggle, stop }),
        [settings, speaking, toggle, stop],
    )

    return (
        <AccessibilityContext.Provider value={value}>
            {children}
            {speaking && (
                <button type="button" className="ns-a11y ns-a11y-stop-float" onClick={stop}>
                    <i className="bi bi-stop-fill" aria-hidden="true"></i>
                    <span>{t('a11y.stop')}</span>
                </button>
            )}
        </AccessibilityContext.Provider>
    )
}
