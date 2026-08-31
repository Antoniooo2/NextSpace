import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from './NewPropertyModal'

export const CONTRACT_STATUSES = ['Pending', 'Active', 'Expired', 'Cancelled']

export const CONTRACT_STATUS_TAG = {
    Pending: 'tag-pending',
    Active: 'tag-active',
    Expired: 'tag-expired',
    Cancelled: 'tag-cancelled',
}

export default function NewContractModal({ properties, tenants, onClose, onSaved }) {
    const [propertyId, setPropertyId] = useState(properties[0]?.property_id ?? '')
    const [tenantDui, setTenantDui] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [monthlyRent, setMonthlyRent] = useState(
        properties[0]?.monthly_rent != null ? String(properties[0].monthly_rent) : ''
    )
    const [status, setStatus] = useState('Pending')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const handlePropertyChange = (value) => {
        setPropertyId(value)
        const property = properties.find((p) => String(p.property_id) === value)
        if (property?.monthly_rent != null) setMonthlyRent(String(property.monthly_rent))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')

        const errors = []
        if (!propertyId) errors.push('Select a property.')
        if (!tenantDui) errors.push('Select a tenant.')
        if (!startDate) errors.push('Start date is required.')
        if (!endDate) errors.push('End date is required.')
        if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
            errors.push('End date must be after the start date.')
        }
        if (!CONTRACT_STATUSES.includes(status)) errors.push('Select a valid status.')

        const rentNum = Number(monthlyRent)
        if (!monthlyRent.trim() || Number.isNaN(rentNum) || rentNum <= 0) {
            errors.push('Monthly rent must be a positive number.')
        }

        if (errors.length > 0) {
            setErrorMsg(errors.join(' '))
            return
        }

        setSaving(true)

        const { data, error } = await supabase
            .from('contract')
            .insert({
                property_id: Number(propertyId),
                business_id: Number(propertyId),
                tenant_dui: tenantDui,
                start_date: startDate,
                end_date: endDate,
                monthly_rent: rentNum,
                status,
            })
            .select()

        setSaving(false)

        if (error) {
            setErrorMsg(describeSupabaseError(error))
            return
        }
        if (!data || data.length === 0) {
            setErrorMsg(
                "The contract could not be created. This is usually caused by a permissions (row-level security) rule blocking the insert."
            )
            return
        }

        onSaved(data[0])
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-modal-form" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">New contract</h2>
                    <p className="ns-modal-form-subtitle">Create a lease agreement between you and a tenant.</p>

                    {errorMsg && (
                        <div className="alert alert-danger py-2" role="alert">
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="contractProperty">Property</label>
                            <select
                                id="contractProperty" className="form-select"
                                value={propertyId} onChange={(e) => handlePropertyChange(e.target.value)}
                            >
                                {properties.map((p) => (
                                    <option key={p.property_id} value={p.property_id}>{p.property_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="contractTenant">Tenant</label>
                            <select
                                id="contractTenant" className="form-select"
                                value={tenantDui} onChange={(e) => setTenantDui(e.target.value)}
                            >
                                <option value="">Select a business account</option>
                                {tenants.map((t) => (
                                    <option key={t.dui} value={t.dui}>{t.first_name} {t.last_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="row g-2">
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="contractStart">Start date</label>
                                    <input
                                        id="contractStart" type="date" className="form-control"
                                        value={startDate} onChange={(e) => setStartDate(e.target.value)} required
                                    />
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="contractEnd">End date</label>
                                    <input
                                        id="contractEnd" type="date" className="form-control"
                                        value={endDate} onChange={(e) => setEndDate(e.target.value)} required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="row g-2">
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="contractRent">Monthly rent (USD)</label>
                                    <div className="ns-input-group input-group">
                                        <span className="input-group-text"><i className="bi bi-currency-dollar"></i></span>
                                        <input
                                            id="contractRent" type="number" min="0" step="0.01" className="form-control"
                                            value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} required
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="contractStatus">Status</label>
                                    <select
                                        id="contractStatus" className="form-select"
                                        value={status} onChange={(e) => setStatus(e.target.value)}
                                    >
                                        {CONTRACT_STATUSES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="ns-submit-btn" disabled={saving}>
                            {saving ? 'Saving...' : 'Create contract'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
