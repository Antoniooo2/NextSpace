import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { formatDueDate } from '../../../lib/rentSchedule'

// Tenant asks the owner to renew a lease in its last 60 days. Sent as an
// in-app notification through send_renewal_request.
export default function RenewalRequestModal({ contract, stats, tenantFirstName, onClose, onSent, onAskRony }) {
    const property = contract.add_business?.property_name || 'the space'
    const ownerFirst = contract.add_business?.users?.first_name || 'there'
    const record =
        stats.monthsDue > 0 && stats.paidOnTime === stats.monthsDue
            ? `I've paid all ${stats.monthsDue} months on time so far, and `
            : ''
    const [message, setMessage] = useState(
        `Hi ${ownerFirst}, my lease for ${property} ends on ${formatDueDate(contract.end_date)}. ${record}I'd like to renew it. Could we talk about the terms for the next period?` +
            (tenantFirstName ? `\n\n— ${tenantFirstName}` : '')
    )
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')

    const send = async () => {
        setSending(true)
        setError('')
        const { error: rpcError } = await supabase.rpc('send_renewal_request', {
            p_contract_id: contract.contract_id,
            p_message: message,
        })
        setSending(false)
        if (rpcError) {
            setError(rpcError.message || 'Could not send the request.')
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
                aria-label="Ask to renew your lease"
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">Ask to renew your lease</h2>
                    <p className="ns-modal-form-subtitle">
                        Your owner gets this in their Notifications. Edit it however you like.
                    </p>

                    <label className="ns-label" htmlFor="renewalMessage">
                        Message
                    </label>
                    <textarea
                        id="renewalMessage"
                        className="form-control ns-notice-text"
                        rows={6}
                        maxLength={1200}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                    />
                    <div className="ns-notice-tools">
                        {onAskRony ? (
                            <button
                                type="button"
                                className="ns-rony-write"
                                onClick={() =>
                                    onAskRony({
                                        text: `My lease for ${property} ends on ${contract.end_date}. Should I renew, and what should I ask the owner about before I do?`,
                                    })
                                }
                            >
                                <i className="bi bi-stars"></i> Ask Rony for advice first
                            </button>
                        ) : (
                            <span />
                        )}
                        <span className="ns-pay-muted">{message.length}/1200</span>
                    </div>

                    {error && (
                        <div className="alert alert-danger py-2" role="alert">
                            {error}
                        </div>
                    )}

                    <button type="button" className="ns-submit-btn" onClick={send} disabled={sending || message.trim().length < 10}>
                        <i className="bi bi-send"></i> {sending ? 'Sending...' : 'Send request'}
                    </button>
                </div>
            </div>
        </div>
    )
}
