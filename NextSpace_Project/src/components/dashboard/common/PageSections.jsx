import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Sticky bar of in-page links ("Overview · Properties · Analysis · History").
// Tapping one scrolls to that part of the page; the part in view is
// highlighted as you scroll.
export function SectionNav({ sections, label }) {
    const { t } = useTranslation()
    const [active, setActive] = useState(sections[0]?.id)
    const ids = sections.map((s) => s.id).join('|')

    useEffect(() => {
        const targets = ids
            .split('|')
            .map((id) => document.getElementById(id))
            .filter(Boolean)
        if (targets.length === 0 || typeof IntersectionObserver === 'undefined') return undefined
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
                if (visible[0]) setActive(visible[0].target.id)
            },
            { rootMargin: '-140px 0px -55% 0px' }
        )
        targets.forEach((t) => observer.observe(t))
        return () => observer.disconnect()
    }, [ids])

    const go = (id) => {
        setActive(id)
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    return (
        <nav className="ns-section-nav" aria-label={label || t('common.sections')}>
            {sections.map((s) => (
                <button
                    type="button"
                    key={s.id}
                    className={active === s.id ? 'active' : ''}
                    aria-current={active === s.id ? 'true' : undefined}
                    onClick={() => go(s.id)}
                >
                    {s.icon && <i className={`bi ${s.icon}`}></i>}
                    {s.label}
                    {s.count != null && <span className="ns-section-nav-count">{s.count}</span>}
                </button>
            ))}
        </nav>
    )
}

// A titled group of panels ("TODAY", "YOUR PROPERTIES"...), the anchor the
// section nav scrolls to.
export function PageGroup({ id, title, hint, action, children }) {
    return (
        <section id={id} className="ns-page-group">
            <header className="ns-page-group-head">
                <h2>{title}</h2>
                {hint && <span>{hint}</span>}
                {action && <div className="ns-page-group-action">{action}</div>}
            </header>
            {children}
        </section>
    )
}
