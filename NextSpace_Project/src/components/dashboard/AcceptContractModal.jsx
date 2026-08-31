import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { describeSupabaseError } from './NewPropertyModal'

export default function AcceptContractModal({ contract, onClose, onAccepted }) {
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')

        const errors = []
        if (!startDate) errors.push('Start date is required.')
        if (!endDate) errors.push('End date is required.')
        if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
            errors.push('End date must be after the start date.')
        }

        if (errors.length > 0) {
            setErrorMsg(errors.join(' '))
            return
        }

        setSaving(true)

        const { data, error } = await supabase
            .from('contract')
            .update({ status: 'Active', start_date: startDate, end_date: endDate })
            .eq('contract_id', contract.contract_id)
            .select()

        setSaving(false)

        if (error) {
            setErrorMsg(describeSupabaseError(error))
            return
        }
        if (!data || data.length === 0) {
            setErrorMsg(
                "The contract could not be accepted. This is usually caused by a permissions (row-level security) rule blocking it."
            )
            return
        }

        onAccepted(data[0])
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-modal-form" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">Accept contract request</h2>
                    <p className="ns-modal-form-subtitle">
                        Set the lease dates for {contract.add_business?.property_name || 'this property'}.
                    </p>

                    {errorMsg && (
                        <div className="alert alert-danger py-2" role="alert">
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="row g-2">
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="acceptStart">Start date</label>
                                    <input
                                        id="acceptStart" type="date" className="form-control"
                                        value={startDate} onChange={(e) => setStartDate(e.target.value)} required
                                    />
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="acceptEnd">End date</label>
                                    <input
                                        id="acceptEnd" type="date" className="form-control"
                                        value={endDate} onChange={(e) => setEndDate(e.target.value)} required
                                    />
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="ns-submit-btn" disabled={saving}>
                            {saving ? 'Saving...' : 'Accept and activate'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
