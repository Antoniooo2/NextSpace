import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { formatDueDate } from '../../../lib/rentSchedule'
import { money } from '../../../lib/leaseInsights'

// Starting text before (or instead of) Rony's draft, built from real numbers.
function templateFor({ kind, tone, contract, stats, ownerFirstName }) {
    const first = contract.users?.first_name || 'there'
    const property = contract.add_business?.property_name || 'your space'
    const sign = ownerFirstName ? `\n\n— ${ownerFirstName}` : ''

    if (kind === 'renewal_offer') {
        const onTime =
            stats.monthsDue > 0 && stats.paidOnTime === stats.monthsDue
                ? `Thank you for paying every month on time. `
                : 'Thank you for renting with me. '
        return `Hi ${first}, your lease for ${property} ends on ${formatDueDate(contract.end_date)}. ${onTime}I'd be glad to renew it with you — let me know if you're interested.${sign}`
    }

    const oldest = stats.owedMonths.find((p) => p.status === 'Late') || stats.owedMonths[0]
    const due = oldest ? formatDueDate(oldest.payment_date) : ''
    const days = stats.oldestLateDays
    if (tone === 'firm') {
        return `Hi ${first}, your rent of ${money(stats.owedNow)} for ${property} is now ${days} days overdue (due ${due}). Please pay it as soon as possible from the Payments section of NextSpace, and let me know if there is a problem.${sign}`
    }
    return `Hi ${first}, just a friendly reminder that your rent of ${money(stats.owedNow)} for ${property} is ${days} days late (due ${due}). You can pay it anytime from the Payments section of NextSpace. Thanks!${sign}`
}

// Owner writes (or asks Rony to write) a reminder or renewal offer and sends
// it to the tenant as an in-app notification through send_tenant_notice.
export default function NoticeComposerModal({ kind, contract, stats, ownerFirstName, onClose, onSent }) {
    const [tone, setTone] = useState('friendly')
    const [message, setMessage] = useState(() => templateFor({ kind, tone: 'friendly', contract, stats, ownerFirstName }))
    const [edited, setEdited] = useState(false)
    const [drafting, setDrafting] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [note, setNote] = useState('')

    const isReminder = kind === 'reminder'
    const tenantFirst = contract.users?.first_name || 'the tenant'

    const changeTone = (next) => {
        setTone(next)
        // Keep the owner's own edits; otherwise swap to the matching template.
        if (!edited) setMessage(templateFor({ kind, tone: next, contract, stats, ownerFirstName }))
    }

    const draftWithRony = async () => {
        setDrafting(true)
        setError('')
        setNote('')
        try {
            const { data: sessionData } = await supabase.auth.getSession()
            const accessToken = sessionData?.session?.access_token
            const response = await fetch('/api/advisor', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({
                    role: 'property-owner',
                    action: 'draft_notice',
                    kind,
                    tone,
                    contractId: contract.contract_id,
                }),
            })
            const result = await response.json().catch(() => ({}))
            if (!response.ok || !result.message) throw new Error(result.error || 'Rony is not available')
            setMessage(result.message)
            setEdited(true)
            setNote('Written by Rony from this lease’s real numbers. Review it before sending.')
        } catch {
            setNote("Rony isn't available right now. You can edit the message above and send it yourself.")
        } finally {
            setDrafting(false)
        }
    }

    const send = async () => {
        setSending(true)
        setError('')
        const { error: rpcError } = await supabase.rpc('send_tenant_notice', {
            p_contract_id: contract.contract_id,
            p_kind: kind,
            p_message: message,
            p_tone: isReminder ? tone : null,
        })
        setSending(false)
        if (rpcError) {
            setError(rpcError.message || 'Could not send the message.')
            return
        }
        onSent()
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div
                className="ns-modal ns-modal-form ns-notice-modal"
                role="dialog"
                aria-modal="true"
                aria-label={isReminder ? 'Send a rent reminder' : 'Offer a renewal'}
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{isReminder ? 'Send a rent reminder' : 'Offer a lease renewal'}</h2>
                    <p className="ns-modal-form-subtitle">
                        {tenantFirst} gets this in their Notifications
                        {isReminder ? ' and can pay from their Payments screen.' : '.'}
                    </p>

                    {isReminder && (
                        <div className="ns-tone-toggle" role="radiogroup" aria-label="Tone">
                            {[
                                { id: 'friendly', label: 'Friendly', icon: 'bi-emoji-smile' },
                                { id: 'firm', label: 'Firm', icon: 'bi-megaphone' },
                            ].map((t) => (
                                <button
                                    type="button"
                                    key={t.id}
                                    role="radio"
                                    aria-checked={tone === t.id}
                                    className={tone === t.id ? 'active' : ''}
                                    onClick={() => changeTone(t.id)}
                                >
                                    <i className={`bi ${t.icon}`}></i> {t.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <label className="ns-label" htmlFor="noticeMessage">
                        Message
                    </label>
                    <textarea
                        id="noticeMessage"
                        className="form-control ns-notice-text"
                        rows={6}
                        maxLength={1200}
                        value={message}
                        onChange={(e) => {
                            setMessage(e.target.value)
                            setEdited(true)
                        }}
                    />
                    <div className="ns-notice-tools">
                        <button type="button" className="ns-rony-write" onClick={draftWithRony} disabled={drafting}>
                            <i className="bi bi-stars"></i> {drafting ? 'Rony is writing...' : 'Write it with Rony'}
                        </button>
                        <span className="ns-pay-muted">{message.length}/1200</span>
                    </div>
                    {note && <p className="ns-notice-note">{note}</p>}

                    {error && (
                        <div className="alert alert-danger py-2" role="alert">
                            {error}
                        </div>
                    )}

                    <button
                        type="button"
                        className="ns-submit-btn"
                        onClick={send}
                        disabled={sending || message.trim().length < 10}
                    >
                        <i className="bi bi-send"></i> {sending ? 'Sending...' : `Send to ${tenantFirst}`}
                    </button>
                </div>
            </div>
        </div>
    )
}
