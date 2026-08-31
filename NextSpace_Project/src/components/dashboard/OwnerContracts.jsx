import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from './NewPropertyModal'
import NewContractModal, { CONTRACT_STATUSES } from './NewContractModal'
import AcceptContractModal from './AcceptContractModal'

const CONTRACT_EMBED =
    '*, add_business!contract_property_id_fkey(property_name), users!contract_tenant_dui_fkey(first_name,last_name)'

export default function OwnerContracts({ user }) {
    const [ownerDui, setOwnerDui] = useState(null)
    const [properties, setProperties] = useState([])
    const [tenants, setTenants] = useState([])
    const [contracts, setContracts] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [actionError, setActionError] = useState('')
    const [showNewModal, setShowNewModal] = useState(false)
    const [updatingId, setUpdatingId] = useState(null)
    const [acceptTarget, setAcceptTarget] = useState(null)

    const loadData = async (dui) => {
        const [
            { data: propertyRows, error: propertyError },
            { data: tenantRows, error: tenantError },
            { data: contractRows, error: contractError },
        ] = await Promise.all([
            supabase.from('add_business').select('property_id, property_name, monthly_rent').eq('owner_id', dui),
            supabase.from('users').select('dui, first_name, last_name').eq('account_type', 'business'),
            supabase.from('contract').select(CONTRACT_EMBED).order('start_date', { ascending: false }),
        ])

        const firstError = propertyError || tenantError || contractError
        if (firstError) {
            setLoadError(describeSupabaseError(firstError))
            return
        }

        setProperties(propertyRows || [])
        setTenants(tenantRows || [])
        setContracts(contractRows || [])
    }

    useEffect(() => {
        let cancelled = false

        const init = async () => {
            setLoading(true)
            setLoadError('')

            const { data: userRow, error: userError } = await supabase
                .from('users')
                .select('dui')
                .eq('id_supabase_auth', user.id)
                .single()

            if (cancelled) return

            if (userError || !userRow) {
                setLoadError("We couldn't find your account record. Please contact support.")
                setLoading(false)
                return
            }

            setOwnerDui(userRow.dui)
            await loadData(userRow.dui)

            if (!cancelled) setLoading(false)
        }

        init()

        return () => {
            cancelled = true
        }
    }, [user.id])

    const handleCreated = async () => {
        setShowNewModal(false)
        setActionError('')
        await loadData(ownerDui)
    }

    const handleStatusChange = async (contractId, nextStatus) => {
        setUpdatingId(contractId)
        setActionError('')

        const { data, error } = await supabase
            .from('contract')
            .update({ status: nextStatus })
            .eq('contract_id', contractId)
            .select()

        setUpdatingId(null)

        if (error) {
            setActionError(describeSupabaseError(error))
            return
        }
        if (!data || data.length === 0) {
            setActionError(
                "The status couldn't be updated. This is usually caused by a permissions (row-level security) rule blocking it."
            )
            return
        }

        setContracts((prev) =>
            prev.map((c) => (c.contract_id === contractId ? { ...c, status: nextStatus } : c))
        )
    }

    const handleReject = (contractId) => handleStatusChange(contractId, 'Cancelled')

    const handleAccepted = (updatedContract) => {
        setContracts((prev) =>
            prev.map((c) =>
                c.contract_id === updatedContract.contract_id
                    ? {
                          ...c,
                          status: updatedContract.status,
                          start_date: updatedContract.start_date,
                          end_date: updatedContract.end_date,
                      }
                    : c
            )
        )
        setAcceptTarget(null)
    }

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading contracts...</p>
            </div>
        )
    }

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Contracts</h1>
                    <p>Manage lease agreements for the properties you own.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button
                        type="button" className="ns-filled-btn"
                        onClick={() => setShowNewModal(true)}
                        disabled={properties.length === 0}
                    >
                        <i className="bi bi-plus-lg"></i> New contract
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}
            {actionError && (
                <div className="alert alert-danger py-2" role="alert">
                    {actionError}
                </div>
            )}

            {properties.length === 0 && (
                <p className="ns-pay-muted mb-4">Publish a property first to be able to create a contract.</p>
            )}

            {contracts.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-file-earmark-text"></i>
                    <h3>No contracts yet</h3>
                    <p>Create your first lease agreement for one of your properties.</p>
                </div>
            ) : (
                <div className="ns-pay-lease-list">
                    {contracts.map((contract) => {
                        const property = contract.add_business
                        const tenant = contract.users
                        return (
                            <div className="ns-pay-lease-row" key={contract.contract_id}>
                                <div className="ns-pay-lease-row-img">
                                    <i className="bi bi-file-earmark-text"></i>
                                </div>
                                <div className="ns-pay-lease-row-info">
                                    <span className="ns-pay-lease-row-title">{property?.property_name || 'Property'}</span>
                                    <span className="ns-pay-lease-row-tenant">
                                        Tenant: {tenant ? `${tenant.first_name} ${tenant.last_name}` : 'Not assigned'}
                                    </span>
                                </div>
                                <span className="ns-pay-lease-row-rent">
                                    ${Number(contract.monthly_rent).toLocaleString()}<small>/mo</small>
                                </span>
                                <span className="ns-pay-lease-row-due">
                                    {contract.start_date && contract.end_date
                                        ? `${contract.start_date} – ${contract.end_date}`
                                        : 'Dates pending'}
                                </span>
                                {contract.status === 'Pending' ? (
                                    <>
                                        <button
                                            type="button" className="ns-outline-btn ns-pay-reminder-btn"
                                            onClick={() => handleReject(contract.contract_id)}
                                            disabled={updatingId === contract.contract_id}
                                        >
                                            Reject
                                        </button>
                                        <button
                                            type="button" className="ns-filled-btn ns-pay-reminder-btn"
                                            onClick={() => setAcceptTarget(contract)}
                                            disabled={updatingId === contract.contract_id}
                                        >
                                            Accept
                                        </button>
                                    </>
                                ) : (
                                    <select
                                        className="form-select form-select-sm ns-contract-status-select"
                                        value={contract.status}
                                        disabled={updatingId === contract.contract_id}
                                        onChange={(e) => handleStatusChange(contract.contract_id, e.target.value)}
                                    >
                                        {CONTRACT_STATUSES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {showNewModal && (
                <NewContractModal
                    properties={properties}
                    tenants={tenants}
                    onClose={() => setShowNewModal(false)}
                    onSaved={handleCreated}
                />
            )}

            {acceptTarget && (
                <AcceptContractModal
                    contract={acceptTarget}
                    onClose={() => setAcceptTarget(null)}
                    onAccepted={handleAccepted}
                />
            )}
        </>
    )
}
