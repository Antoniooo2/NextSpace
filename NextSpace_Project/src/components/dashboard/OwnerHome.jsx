import { useMemo, useState } from 'react'
import { DEMO_OWNER_ID, PROPERTIES } from '../../data/properties'
import PropertyCard from './PropertyCard'
import NewPropertyModal from './NewPropertyModal'

export default function OwnerHome({ firstName, search, onViewProperty }) {
    const [ownProperties, setOwnProperties] = useState(() =>
        PROPERTIES.filter((p) => p.ownerId === DEMO_OWNER_ID)
    )
    const [showNewModal, setShowNewModal] = useState(false)

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return ownProperties
        return ownProperties.filter(
            (p) => p.title.toLowerCase().includes(query) || p.city.toLowerCase().includes(query)
        )
    }, [ownProperties, search])

    const totalMonthly = ownProperties.reduce((sum, p) => sum + p.price, 0)

    const handleCreate = (newProperty) => {
        setOwnProperties((prev) => [
            {
                id: `local-${Date.now()}`,
                image: null,
                ownerId: DEMO_OWNER_ID,
                ownerName: firstName,
                ...newProperty,
            },
            ...prev,
        ])
        setShowNewModal(false)
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>My Properties</h1>
                    <p>Manage the commercial spaces you've published on NextSpace, {firstName}.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button type="button" className="ns-filled-btn" onClick={() => setShowNewModal(true)}>
                        <i className="bi bi-plus-lg"></i> Publish new space
                    </button>
                </div>
            </div>

            <div className="ns-stats-row">
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{ownProperties.length}</span>
                    <span className="ns-stat-card-label">Published listings</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">${totalMonthly.toLocaleString()}</span>
                    <span className="ns-stat-card-label">Potential monthly income</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{ownProperties.length}</span>
                    <span className="ns-stat-card-label">Active on marketplace</span>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-buildings"></i>
                    <h3>{ownProperties.length === 0 ? "You haven't published any spaces yet" : 'No properties match your search'}</h3>
                    <p>
                        {ownProperties.length === 0
                            ? 'List your first commercial space and start reaching entrepreneurs across El Salvador.'
                            : 'Try a different keyword.'}
                    </p>
                    {ownProperties.length === 0 && (
                        <button type="button" className="ns-filled-btn" onClick={() => setShowNewModal(true)}>
                            <i className="bi bi-plus-lg"></i> Publish new space
                        </button>
                    )}
                </div>
            ) : (
                <div className="ns-prop-grid">
                    {filtered.map((property) => (
                        <PropertyCard
                            key={property.id}
                            property={property}
                            onAction={onViewProperty}
                            secondaryAction={{
                                icon: 'bi-pencil',
                                label: 'Edit listing',
                                onClick: onViewProperty,
                            }}
                        />
                    ))}
                </div>
            )}

            {showNewModal && (
                <NewPropertyModal onClose={() => setShowNewModal(false)} onCreate={handleCreate} />
            )}
        </>
    )
}