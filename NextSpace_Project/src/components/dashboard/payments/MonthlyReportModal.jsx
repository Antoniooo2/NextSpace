import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND_VALUES } from '../../../lib/brand'
import { supabase } from '../../../lib/supabaseClient'
import { todayInElSalvador } from '../../../lib/rentSchedule'
import { monthKeyShift, monthLabel } from '../../../lib/leaseInsights'
import { downloadOwnerMonthlyReportPdf } from '../../../lib/paymentReports'

// Owner picks a month and whether Rony should write the analysis paragraph,
// then downloads the monthly rent report PDF.
export default function MonthlyReportModal({ leases, allRows, ownerName, feeRate, onClose }) {
    const { t } = useTranslation()
    const current = todayInElSalvador().slice(0, 7)
    const months = Array.from({ length: 12 }, (_, i) => monthKeyShift(current, -i))
    const [monthKey, setMonthKey] = useState(current)
    const [withRony, setWithRony] = useState(true)
    const [busy, setBusy] = useState('')
    const [note, setNote] = useState('')

    const fetchSummary = async () => {
        try {
            const { data: sessionData } = await supabase.auth.getSession()
            const response = await fetch('/api/advisor', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${sessionData?.session?.access_token}`,
                },
                body: JSON.stringify({ role: 'property-owner', action: 'report_summary', monthKey }),
            })
            const result = await response.json().catch(() => ({}))
            if (!response.ok || !result.summary) throw new Error(result.error || 'unavailable')
            return result.summary
        } catch {
            return null
        }
    }

    const generate = async () => {
        setNote('')
        let summary = null
        if (withRony) {
            setBusy(t('reportModal.writing', BRAND_VALUES))
            summary = await fetchSummary()
        }
        setBusy(t('reportModal.building'))
        try {
            await downloadOwnerMonthlyReportPdf({ monthKey, leases, allRows, ownerName, summary, feeRate })
            if (withRony && !summary) {
                setNote(t('reportModal.noRony', BRAND_VALUES))
                setBusy('')
                return
            }
            onClose()
        } catch (err) {
            console.error('Could not build the report', err)
            setNote(t('reportModal.error'))
        } finally {
            setBusy('')
        }
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div
                className="ns-modal ns-modal-form ns-notice-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t('reportModal.title')}
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label={t('common.close')}>
                    <i className="bi bi-x-lg"></i>
                </button>
                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">{t('reportModal.title')}</h2>
                    <p className="ns-modal-form-subtitle">
                        {t('reportModal.subtitle')}
                    </p>

                    <label className="ns-label" htmlFor="reportMonth">
                        {t('docs.reports.month')}
                    </label>
                    <select
                        id="reportMonth"
                        className="form-select mb-3"
                        value={monthKey}
                        onChange={(e) => setMonthKey(e.target.value)}
                    >
                        {months.map((key) => (
                            <option key={key} value={key}>
                                {monthLabel(key, 'long')}
                                {key === current ? ` (${t('reportModal.thisMonth')})` : ''}
                            </option>
                        ))}
                    </select>

                    <label className="ns-report-check">
                        <input type="checkbox" checked={withRony} onChange={(e) => setWithRony(e.target.checked)} />
                        <span>
                            <strong>
                                <i className="bi bi-stars"></i> {t('reportModal.include', BRAND_VALUES)}
                            </strong>
                            <small>{t('reportModal.includeHint')}</small>
                        </span>
                    </label>

                    {note && <p className="ns-notice-note">{note}</p>}

                    <button type="button" className="ns-submit-btn" onClick={generate} disabled={Boolean(busy)}>
                        <i className="bi bi-file-earmark-pdf"></i> {busy || t('reportModal.download')}
                    </button>
                </div>
            </div>
        </div>
    )
}
