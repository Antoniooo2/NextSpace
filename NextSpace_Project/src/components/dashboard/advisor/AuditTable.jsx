import { useTranslation } from 'react-i18next'

const ISSUE_KEYS = {
    no_photos: 'noPhotos',
    short_description: 'shortDescription',
    no_services: 'noServices',
    no_municipality: 'noLocation',
    no_rent: 'noRent',
}

export default function AuditTable({ audit, onRewrite, disabled }) {
    const { t } = useTranslation()
    const incomplete = (audit || []).filter((row) => row.issues.length > 0)
    if (incomplete.length === 0) return null

    return (
        <div className="advisor-compare">
            <table>
                <thead>
                    <tr>
                        <th>{t('common.property')}</th>
                        <th>{t('advisor.audit.issues')}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {incomplete.map((row) => (
                        <tr key={row.property_id}>
                            <td>{row.property_name}</td>
                            <td>{row.issues.map((code) => (ISSUE_KEYS[code] ? t(`advisor.audit.${ISSUE_KEYS[code]}`) : code)).join(', ')}</td>
                            <td>
                                <button
                                    type="button"
                                    className="advisor-audit-rewrite"
                                    onClick={() => onRewrite(row)}
                                    disabled={disabled}
                                >
                                    {t('advisor.audit.rewrite')}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
