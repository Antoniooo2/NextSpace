import { useTranslation } from 'react-i18next'
import { formatDueDate } from '../../../lib/rentSchedule'
import { BRAND_VALUES } from '../../../lib/brand'
import { DASH, DOT } from '../../../lib/symbols'
import { recordSummary } from '../../../lib/contracts'

// The business's record on NextSpace, as totals only: how many leases they
// signed and how many months they paid on time across all of them.
export default function ApplicantRecord({ record, name }) {
    const { t } = useTranslation()
    const summary = recordSummary(record)

    return (
        <section className="ns-panel ns-applicant">
            <div className="ns-panel-head">
                <h3>{t('applicant.title', { ...BRAND_VALUES, name })}</h3>
            </div>
            {!record || record.leases === 0 ? (
                <p className="ns-pay-muted mb-0">
                    {t('applicant.none', BRAND_VALUES)}
                    {record?.member_since ? ` ${t('applicant.firstRequest', { date: formatDueDate(record.member_since) })}` : ''}
                </p>
            ) : (
                <>
                    <div className="ns-applicant-top">
                        <div className={`ns-applicant-pct tone-${summary.tone}`}>
                            <strong>{summary.pct == null ? DASH : `${summary.pct}%`}</strong>
                            <small>{t('applicant.onTime')}</small>
                        </div>
                        <ul>
                            <li>
                                <strong>{record.months_on_time}</strong> {t('applicant.monthsOnTime', { count: record.months_due })}
                            </li>
                            <li>
                                <strong>{record.leases}</strong> {t('applicant.leasesSigned', { count: record.leases })} {DOT}{' '}
                                {t('applicant.activeCompleted', { active: record.active_leases, completed: record.completed_leases, dot: DOT })}
                            </li>
                            <li className={record.months_late_now > 0 ? 'is-bad' : ''}>
                                <strong>{record.months_late_now}</strong> {t('applicant.lateNow', { count: record.months_late_now })}
                            </li>
                        </ul>
                    </div>
                    <p className="ns-applicant-foot">
                        {record.member_since
                            ? t('applicant.footSince', { date: formatDueDate(record.member_since) })
                            : t('applicant.foot')}
                    </p>
                </>
            )}
        </section>
    )
}
