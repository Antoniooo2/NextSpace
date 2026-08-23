const ACCOUNT_TYPE_LABEL = {
    business: 'Business',
    'property-owner': 'Property Owner',
}

export default function ProfileView({ user, accountType }) {
    const meta = user.user_metadata || {}
    const firstName = meta.first_name || ''
    const lastName = meta.last_name || ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'NextSpace User'
    const initials = ((firstName[0] || 'U') + (lastName[0] || '')).toUpperCase()

    const fields = [
        { icon: 'bi-person', label: 'Full name', value: fullName },
        { icon: 'bi-envelope', label: 'Email address', value: user.email },
        { icon: 'bi-briefcase', label: 'Account type', value: ACCOUNT_TYPE_LABEL[accountType] },
        { icon: 'bi-person-badge', label: 'DUI', value: meta.dui || '—' },
        { icon: 'bi-phone', label: 'Phone number', value: meta.phone || '—' },
    ]

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Profile</h1>
                    <p>Your basic account information on NextSpace.</p>
                </div>
            </div>

            <div className="ns-profile-card">
                <div className="ns-profile-top">
                    <span className="ns-profile-avatar">{initials}</span>
                    <div>
                        <h2>{fullName}</h2>
                        <span className="ns-profile-badge">{ACCOUNT_TYPE_LABEL[accountType]}</span>
                    </div>
                </div>

                <div className="ns-profile-fields">
                    {fields.map((field) => (
                        <div className="ns-profile-field" key={field.label}>
                            <i className={`bi ${field.icon}`}></i>
                            <div>
                                <span className="ns-profile-field-label">{field.label}</span>
                                <span className="ns-profile-field-value">{field.value}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    )
}
