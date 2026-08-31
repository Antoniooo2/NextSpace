import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useOwnerProperties } from '../../hooks/useOwnerProperties'
import PropertyCard from './PropertyCard'
import NewPropertyModal, { describeSupabaseError } from './NewPropertyModal'
import ConfirmDialog from './ConfirmDialog'

export default function OwnerHome({ user, firstName, search, onViewProperty }) {
    const { ownerDui, properties, setProperties, loading, error: loadError, reload } = useOwnerProperties(user)
    const [showFormModal, setShowFormModal] = useState(false)
    const [editingProperty, setEditingProperty] = useState(null)
    const [deleteTarget, setDeleteTarget] = useState(null)
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState('')

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return properties
        return properties.filter(
            (p) =>
                p.property_name.toLowerCase().includes(query) ||
                p.property_type.toLowerCase().includes(query)
        )
    }, [properties, search])

    const totalMonthly = properties.reduce((sum, p) => sum + (p.monthly_rent || 0), 0)
    const activeCount = properties.filter((p) => p.availability === 'Available').length

    const openCreateModal = () => {
        setEditingProperty(null)
        setShowFormModal(true)
    }

    const openEditModal = (property) => {
        setEditingProperty(property)
        setShowFormModal(true)
    }

    const handleSaved = async () => {
        setShowFormModal(false)
        setEditingProperty(null)
        await reload()
    }

    const handleDelete = async () => {
        setDeleting(true)
        setDeleteError('')

        const { data, error } = await supabase
            .from('add_business')
            .delete()
            .eq('property_id', deleteTarget.property_id)
            .select()

        setDeleting(false)

        if (error) {
            setDeleteError(describeSupabaseError(error))
            setDeleteTarget(null)
            return
        }

        if (!data || data.length === 0) {
            setDeleteError(
                "The property could not be deleted. This is usually caused by a permissions (row-level security) rule blocking it."
            )
            setDeleteTarget(null)
            return
        }

        setProperties((prev) => prev.filter((p) => p.property_id !== deleteTarget.property_id))
        setDeleteTarget(null)
    }

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading your properties...</p>
            </div>
        )
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>My Properties</h1>
                    <p>Manage the commercial spaces you've published on NextSpace, {firstName}.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button type="button" className="ns-filled-btn" onClick={openCreateModal}>
                        <i className="bi bi-plus-lg"></i> Publish new space
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            {deleteError && (
                <div className="alert alert-danger py-2" role="alert">
                    {deleteError}
                </div>
            )}

            <div className="ns-stats-row">
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{properties.length}</span>
                    <span className="ns-stat-card-label">Published listings</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">${totalMonthly.toLocaleString()}</span>
                    <span className="ns-stat-card-label">Potential monthly income</span>
                </div>
                <div className="ns-stat-card">
                    <span className="ns-stat-card-value">{activeCount}</span>
                    <span className="ns-stat-card-label">Active on marketplace</span>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-buildings"></i>
                    <h3>{properties.length === 0 ? "You haven't published any spaces yet" : 'No properties match your search'}</h3>
                    <p>
                        {properties.length === 0
                            ? 'List your first commercial space and start reaching entrepreneurs across El Salvador.'
                            : 'Try a different keyword.'}
                    </p>
                    {properties.length === 0 && (
                        <button type="button" className="ns-filled-btn" onClick={openCreateModal}>
                            <i className="bi bi-plus-lg"></i> Publish new space
                        </button>
                    )}
                </div>
            ) : (
                <div className="ns-prop-grid">
                    {filtered.map((property) => (
                        <PropertyCard
                            key={property.property_id}
                            property={property}
                            onAction={onViewProperty}
                            secondaryActions={[
                                {
                                    icon: 'bi-pencil',
                                    label: 'Edit listing',
                                    onClick: openEditModal,
                                },
                                {
                                    icon: 'bi-trash',
                                    label: 'Delete listing',
                                    onClick: (p) => {
                                        setDeleteError('')
                                        setDeleteTarget(p)
                                    },
                                },
                            ]}
                        />
                    ))}
                </div>
            )}

            {showFormModal && (
                <NewPropertyModal
                    property={editingProperty}
                    ownerDui={ownerDui}
                    onClose={() => {
                        setShowFormModal(false)
                        setEditingProperty(null)
                    }}
                    onSaved={handleSaved}
                />
            )}

            {deleteTarget && (
                <ConfirmDialog
                    icon="bi-trash"
                    title="Delete this property?"
                    description={`"${deleteTarget.property_name}" will be permanently removed from your listings. This can't be undone.`}
                    confirmLabel={deleting ? 'Deleting...' : 'Delete'}
                    cancelLabel="Cancel"
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </>
    )
}
