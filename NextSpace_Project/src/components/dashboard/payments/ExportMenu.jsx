import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// "Export" button with a small menu of download options. Each option's
// onSelect may be async; the menu shows progress and any error.
export default function ExportMenu({ options, label }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(null)
    const [error, setError] = useState('')
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        const close = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', close)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', close)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const run = async (option) => {
        setBusy(option.id)
        setError('')
        try {
            await option.onSelect()
            setOpen(false)
        } catch (err) {
            console.error('Export failed', err)
            setError(t('exportMenu.error'))
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="ns-export" ref={ref}>
            <button
                type="button"
                className="ns-outline-btn"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <i className="bi bi-download"></i> {busy ? t('contractDetail.quiet.preparing') : label || t('exportMenu.label')}{' '}
                <i className="bi bi-chevron-down ns-export-caret"></i>
            </button>
            {open && (
                <div className="ns-export-menu" role="menu">
                    {options.map((option) => (
                        <button
                            type="button"
                            role="menuitem"
                            key={option.id}
                            onClick={() => run(option)}
                            disabled={Boolean(busy)}
                        >
                            <i className={`bi ${option.icon}`}></i>
                            <span>
                                <strong>{busy === option.id ? t('contractDetail.quiet.preparing') : option.label}</strong>
                                <small>{option.description}</small>
                            </span>
                        </button>
                    ))}
                    {error && <p className="ns-export-error">{error}</p>}
                </div>
            )}
        </div>
    )
}
