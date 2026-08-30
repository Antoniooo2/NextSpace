import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from './NewPropertyModal'
import { CONTRACT_STATUS_TAG } from './NewContractModal'

const CONTRACT_EMBED =
    '*, add_business!contract_property_id_fkey(property_name, users!add_business_owner_id_fkey(first_name,last_name))'

export default function BusinessContracts({ user }) {
    const [contracts, setContracts] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            setLoadError('')

            const { data, error } = await supabase
                .from('contract')
                .select(CONTRACT_EMBED)
                .order('start_date', { ascending: false })

            if (cancelled) return

            if (error) {
                setLoadError(describeSupabaseError(error))
                setLoading(false)
                return
            }

            setContracts(data || [])
            setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [user.id])

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
                    <p>Lease agreements you've signed with property owners.</p>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            {contracts.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-file-earmark-text"></i>
                    <h3>No contracts yet</h3>
                    <p>Once a property owner sets you up with a lease, it'll show up here.</p>
                </div>
            ) : (
                <div className="ns-pay-lease-list">
                    {contracts.map((contract) => {
                        const property = contract.add_business
                        const owner = property?.users
                        return (
                            <div className="ns-pay-lease-row" key={contract.contract_id}>
                                <div className="ns-pay-lease-row-img">
                                    <i className="bi bi-file-earmark-text"></i>
                                </div>
                                <div className="ns-pay-lease-row-info">
                                    <span className="ns-pay-lease-row-title">{property?.property_name || 'Property'}</span>
                                    <span className="ns-pay-lease-row-tenant">
                                        Owner: {owner ? `${owner.first_name} ${owner.last_name}` : '—'}
                                    </span>
                                </div>
                                <span className="ns-pay-lease-row-rent">
                                    ${Number(contract.monthly_rent).toLocaleString()}<small>/mo</small>
                                </span>
                                <span className="ns-pay-lease-row-due">
                                    {contract.start_date} – {contract.end_date}
                                </span>
                                <span className={`ns-pay-tag ${CONTRACT_STATUS_TAG[contract.status] || 'tag-pending'}`}>
                                    {contract.status}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </>
    )
}
