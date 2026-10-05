import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useAccessibility from '../hooks/useAccessibility'

const OPTIONS = [
    { key: 'readAloud', icon: 'bi-volume-up', label: 'a11y.readAloud', hint: 'a11y.readAloudHint', needsSpeech: true },
    { key: 'largeText', icon: 'bi-fonts', label: 'a11y.largeText', hint: 'a11y.largeTextHint' },
    { key: 'highContrast', icon: 'bi-circle-half', label: 'a11y.highContrast', hint: 'a11y.highContrastHint' },
]

export default function AccessibilityMenu() {
    const { t } = useTranslation()
    const { settings, speechAvailable, speaking, toggle, stop } = useAccessibility()
    const [open, setOpen] = useState(false)
    const [panelTop, setPanelTop] = useState(null)
    const wrapRef = useRef(null)
    const buttonRef = useRef(null)
    const panelId = useId()

    const options = OPTIONS.filter((option) => !option.needsSpeech || speechAvailable)
    const anyOn = options.some((option) => settings[option.key])

    useEffect(() => {
        if (!open) return undefined
        const handlePointer = (event) => {
            if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
        }
        const handleKey = (event) => {
            if (event.key === 'Escape') {
                setOpen(false)
                if (buttonRef.current) buttonRef.current.focus()
            }
        }
        document.addEventListener('pointerdown', handlePointer)
        document.addEventListener('keydown', handleKey)
        return () => {
            document.removeEventListener('pointerdown', handlePointer)
            document.removeEventListener('keydown', handleKey)
        }
    }, [open])

    const togglePanel = () => {
        if (!open && buttonRef.current) {
            setPanelTop(Math.round(buttonRef.current.getBoundingClientRect().bottom + 8))
        }
        setOpen((value) => !value)
    }

    return (
        <div className="ns-a11y ns-a11y-menu" ref={wrapRef}>
            <button
                ref={buttonRef}
                type="button"
                className={`ns-a11y-btn${anyOn ? ' is-active' : ''}`}
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={t('a11y.open')}
                title={t('a11y.open')}
                onClick={togglePanel}
            >
                <i className="bi bi-universal-access-circle" aria-hidden="true"></i>
            </button>

            {open && (
                <div
                    id={panelId}
                    className="ns-a11y-panel"
                    role="dialog"
                    aria-label={t('a11y.title')}
                    style={panelTop != null ? { '--ns-a11y-panel-top': `${panelTop}px` } : undefined}
                >
                    <div className="ns-a11y-panel-head">
                        <strong>{t('a11y.title')}</strong>
                        <button
                            type="button"
                            className="ns-a11y-close"
                            aria-label={t('a11y.close')}
                            onClick={() => setOpen(false)}
                        >
                            <i className="bi bi-x-lg" aria-hidden="true"></i>
                        </button>
                    </div>

                    <ul className="ns-a11y-options">
                        {options.map((option) => {
                            const on = settings[option.key]
                            return (
                                <li key={option.key}>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={on}
                                        className={`ns-a11y-option${on ? ' is-on' : ''}`}
                                        onClick={() => toggle(option.key)}
                                    >
                                        <i className={`bi ${option.icon}`} aria-hidden="true"></i>
                                        <span className="ns-a11y-option-text">
                                            <span className="ns-a11y-option-label">{t(option.label)}</span>
                                            <small>{t(option.hint)}</small>
                                        </span>
                                        <span className="ns-a11y-switch" aria-hidden="true"></span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>

                    {speechAvailable && (
                        <button type="button" className="ns-a11y-stop" onClick={stop} disabled={!speaking}>
                            <i className="bi bi-stop-circle" aria-hidden="true"></i>
                            <span>{t('a11y.stop')}</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
