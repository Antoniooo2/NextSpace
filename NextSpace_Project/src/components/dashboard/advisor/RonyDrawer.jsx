import { useEffect } from 'react'
import RonyAvatar from '../../RonyAvatar'
import AdvisorRouter from './AdvisorRouter'
import './advisor.css'

// Rony in a side panel, so a question from the Payments screen doesn't take
// the user away from it. It's the same conversation as the AI Advisor page
// (history is shared), just in a narrower layout.
export default function RonyDrawer({ open, accountType, seed, onSeedConsumed, onClose, onOpenFullChat, onViewProperty, onNavigate }) {
    useEffect(() => {
        if (!open) return
        const onKey = (e) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null

    return (
        <>
            <div className="ns-rony-drawer-scrim" onClick={onClose} aria-hidden="true" />
            <aside className="ns-rony-drawer" role="dialog" aria-modal="false" aria-label="Rony, AI advisor">
                <header className="ns-rony-drawer-head">
                    <RonyAvatar size={32} />
                    <div>
                        <strong>Rony</strong>
                        <span>Knows your rent schedule and leases</span>
                    </div>
                    <button type="button" className="ns-link-btn" onClick={onOpenFullChat} title="Open the full AI Advisor page">
                        Full chat <i className="bi bi-box-arrow-up-right"></i>
                    </button>
                    <button type="button" className="ns-rony-drawer-close" onClick={onClose} aria-label="Close Rony">
                        <i className="bi bi-x-lg"></i>
                    </button>
                </header>
                <div className="ns-rony-drawer-body">
                    <AdvisorRouter
                        accountType={accountType}
                        seed={seed}
                        onSeedConsumed={onSeedConsumed}
                        onViewProperty={onViewProperty}
                        onNavigate={onNavigate}
                        compact
                    />
                </div>
            </aside>
        </>
    )
}
