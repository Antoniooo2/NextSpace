import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_VALUES } from '../../../lib/brand'

const ICON = {
    low: 'bi-shield-check',
    medium: 'bi-eye',
    high: 'bi-exclamation-triangle-fill',
    new: 'bi-stars',
}

// Tenant payment-risk badge. Clicking it explains the reasons and offers to
// ask Rony for a deeper read.
export default function RiskBadge({ risk, onAskRony }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        const close = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [open])

    return (
        <span className="ns-risk-wrap" ref={ref}>
            <button
                type="button"
                className={`ns-risk-badge risk-${risk.level}`}
                onClick={(e) => {
                    e.stopPropagation()
                    setOpen((v) => !v)
                }}
                aria-expanded={open}
                title={t('riskBadge.why')}
            >
                <i className={`bi ${ICON[risk.level]}`}></i> {risk.label}
            </button>
            {open && (
                <span className="ns-risk-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
                    <strong>{t('riskBadge.title', { label: risk.label })}</strong>
                    <ul>
                        {risk.reasons.map((r) => (
                            <li key={r}>{r}</li>
                        ))}
                    </ul>
                    {onAskRony && (
                        <button
                            type="button"
                            className="ns-risk-ask"
                            onClick={() => {
                                setOpen(false)
                                onAskRony()
                            }}
                        >
                            <i className="bi bi-stars"></i> {t('riskBadge.ask', BRAND_VALUES)}
                        </button>
                    )}
                </span>
            )}
        </span>
    )
}
