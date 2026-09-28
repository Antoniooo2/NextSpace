import { formatDueDate } from '../../../lib/rentSchedule'
import { recordSummary } from '../../../lib/contracts'

// The business's record on NextSpace, as totals only: how many leases they
// signed and how many months they paid on time across all of them.
export default function ApplicantRecord({ record, name }) {
    const summary = recordSummary(record)

    return (
        <section className="ns-panel ns-applicant">
            <div className="ns-panel-head">
                <h3>{name}’s record on NextSpace</h3>
            </div>
            {!record || record.leases === 0 ? (
                <p className="ns-pay-muted mb-0">
                    No signed leases on NextSpace yet, so there is no payment record to show.
                    {record?.member_since ? ` First request ${formatDueDate(record.member_since)}.` : ''}
                </p>
            ) : (
                <>
                    <div className="ns-applicant-top">
                        <div className={`ns-applicant-pct tone-${summary.tone}`}>
                            <strong>{summary.pct == null ? '—' : `${summary.pct}%`}</strong>
                            <small>on time</small>
                        </div>
                        <ul>
                            <li>
                                <strong>{record.months_on_time}</strong> of {record.months_due} months paid on time
                            </li>
                            <li>
                                <strong>{record.leases}</strong> {record.leases === 1 ? 'lease' : 'leases'} signed ·{' '}
                                {record.active_leases} active · {record.completed_leases} completed
                            </li>
                            <li className={record.months_late_now > 0 ? 'is-bad' : ''}>
                                <strong>{record.months_late_now}</strong> {record.months_late_now === 1 ? 'month' : 'months'} late right now
                            </li>
                        </ul>
                    </div>
                    <p className="ns-applicant-foot">
                        Totals across all their leases{record.member_since ? ` since ${formatDueDate(record.member_since)}` : ''}. Amounts
                        and other owners are not shown.
                    </p>
                </>
            )}
        </section>
    )
}
