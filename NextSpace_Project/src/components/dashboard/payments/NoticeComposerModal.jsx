import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../../i18n'
import { BRAND_VALUES } from '../../../lib/brand'
import { DASH } from '../../../lib/symbols'
import { supabase } from '../../../lib/supabaseClient'
import { formatDueDate } from '../../../lib/rentSchedule'
import { money } from '../../../lib/leaseInsights'

// Starting text before (or instead of) Rony's draft, built from real numbers.
function templateFor({ kind, tone, contract, stats, ownerFirstName }) {
    const t = (key, values) => i18n.t(`notice.template.${key}`, { ...BRAND_VALUES, ...values })
    const first = contract.users?.first_name || t('there')
    const property = contract.add_business?.property_name || t('yourSpace')
    const sign = ownerFirstName ? `\n\n${DASH} ${ownerFirstName}` : ''

    if (kind === 'renewal_offer') {
        const onTime = stats.monthsDue > 0 && stats.paidOnTime === stats.monthsDue ? t('thanksOnTime') : t('thanksRenting')
        return t('renewal', { first, name: property, date: formatDueDate(contract.end_date), thanks: onTime }) + sign
    }

    const oldest = stats.owedMonths.find((p) => p.status === 'Late') || stats.owedMonths[0]
    const due = oldest ? formatDueDate(oldest.payment_date) : ''
    const days = stats.oldestLateDays
    if (tone === 'firm') {
        return t('firm', { first, amount: money(stats.owedNow), name: property, count: days, due }) + sign
    }
    return t('friendly', { first, amount: money(stats.owedNow), name: property, count: days, due }) + sign
}

// Owner writes (or asks Rony to write) a reminder or renewal offer and sends
// it to the tenant as an in-app notification through send_tenant_notice.
export default function NoticeComposerModal({ kind, contract, stats, ownerFirstName, onClose, onSent }) {
    const { t } = useTranslation()
    const [tone, setTone] = useState('friendly')
    const [message, setMessage] = useState(() => templateFor({ kind, tone: 'friendly', contract, stats, ownerFirstName }))
    const [edited, setEdited] = useState(false)
    const [drafting, setDrafting] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [note, setNote] = useState('')

    const isReminder = kind === 'reminder'
    const tenantFirst = contract.users?.first_name || t('paymentDetail.theTenant')

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
            if (!response.ok || !result.message) throw new Error(result.error || t('notice.ronyUnavailableShort', BRAND_VALUES))
            setMessage(result.message)
            setEdited(true)
            setNote(t('notice.writtenByRony', BRAND_VALUES))
        } catch {
            setNote(t('notice.ronyUnavailable', BRAND_VALUES))
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
            setError(rpcError.message || t('notice.sendError'))
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
                aria-label={isReminder ? t('notice.reminderTitle') : t('renewal.offer.title')}
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{isReminder ? t('notice.reminderTitle') : t('notice.renewalTitle')}</h2>
                    <p className="ns-modal-form-subtitle">
                        {isReminder ? t('notice.subtitleReminder', { name: tenantFirst }) : t('notice.subtitleRenewal', { name: tenantFirst })}
                    </p>

                    {isReminder && (
                        <div className="ns-tone-toggle" role="radiogroup" aria-label={t('notice.tone')}>
                            {[
                                { id: 'friendly', icon: 'bi-emoji-smile' },
                                { id: 'firm', icon: 'bi-megaphone' },
                            ].map((option) => (
                                <button
                                    type="button"
                                    key={option.id}
                                    role="radio"
                                    aria-checked={tone === option.id}
                                    className={tone === option.id ? 'active' : ''}
                                    onClick={() => changeTone(option.id)}
                                >
                                    <i className={`bi ${option.icon}`}></i> {t(`notice.tones.${option.id}`)}
                                </button>
                            ))}
                        </div>
                    )}

                    <label className="ns-label" htmlFor="noticeMessage">
                        {t('notice.message')}
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
                            <i className="bi bi-stars"></i> {drafting ? t('notice.ronyWriting', BRAND_VALUES) : t('notice.writeWithRony', BRAND_VALUES)}
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
                        <i className="bi bi-send"></i> {sending ? t('common.sending') : t('notice.sendTo', { name: tenantFirst })}
                    </button>
                </div>
            </div>
        </div>
    )
}
