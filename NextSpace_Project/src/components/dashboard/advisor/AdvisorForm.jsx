import { useState } from 'react'
import { PROPERTY_TYPES } from '../../../lib/propertyTypes'
import { EL_SALVADOR_DEPARTMENTS, EL_SALVADOR_DEPARTMENT_NAMES } from '../../../lib/elSalvadorLocations'

export default function AdvisorForm({ initialFilter, servicesCatalog, onSubmit }) {
    const [budget, setBudget] = useState(
        initialFilter?.budget_max != null ? String(initialFilter.budget_max) : ''
    )
    const [propertyType, setPropertyType] = useState(initialFilter?.property_type?.[0] || '')
    const [department, setDepartment] = useState(initialFilter?.department || '')
    const [municipality, setMunicipality] = useState(initialFilter?.municipality || '')
    const [selectedServiceIds, setSelectedServiceIds] = useState(initialFilter?.required_services || [])

    const handleDepartmentChange = (value) => {
        setDepartment(value)
        setMunicipality(value ? EL_SALVADOR_DEPARTMENTS[value]?.[0] || '' : '')
    }

    const toggleService = (serviceId) => {
        setSelectedServiceIds((prev) =>
            prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
        )
    }

    const handleSubmit = (e) => {
        e.preventDefault()

        const budgetNumber = budget.trim() ? Number(budget) : null
        const filter = {
            budget_max: Number.isFinite(budgetNumber) ? budgetNumber : null,
            budget_min: null,
            property_type: propertyType ? [propertyType] : [],
            department: department || null,
            municipality: municipality || null,
            required_services: selectedServiceIds,
        }

        const serviceNames = servicesCatalog
            .filter((s) => selectedServiceIds.includes(s.service_id))
            .map((s) => s.service_name)

        const parts = [propertyType ? `a ${propertyType} space` : 'a commercial space']
        if (municipality) parts.push(`in ${municipality}`)
        else if (department) parts.push(`in ${department}`)
        if (filter.budget_max != null) parts.push(`with a budget up to $${filter.budget_max} per month`)
        if (serviceNames.length > 0) parts.push(`needing ${serviceNames.join(', ')}`)

        onSubmit(filter, `I am looking for ${parts.join(', ')}.`)
    }

    return (
        <form className="advisor-form" onSubmit={handleSubmit}>
            <p className="advisor-form-lead">
                Tell me what you are looking for and I will search the listings. You can change any of
                this later just by asking.
            </p>
            <div className="advisor-form-grid">
                <div className="advisor-form-field">
                    <label>Monthly budget (USD)</label>
                    <input
                        type="number"
                        min="0"
                        step="10"
                        placeholder="No limit"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                    />
                </div>
                <div className="advisor-form-field">
                    <label>Business type</label>
                    <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                        <option value="">Any type</option>
                        {PROPERTY_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {type}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="advisor-form-field">
                    <label>Department</label>
                    <select value={department} onChange={(e) => handleDepartmentChange(e.target.value)}>
                        <option value="">Any department</option>
                        {EL_SALVADOR_DEPARTMENT_NAMES.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="advisor-form-field">
                    <label>Municipality</label>
                    <select
                        value={municipality}
                        onChange={(e) => setMunicipality(e.target.value)}
                        disabled={!department}
                    >
                        <option value="">Any municipality</option>
                        {(EL_SALVADOR_DEPARTMENTS[department] || []).map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="advisor-form-field advisor-form-services">
                <label>Must-have services</label>
                <div className="advisor-form-chips">
                    {servicesCatalog.map((service) => (
                        <button
                            key={service.service_id}
                            type="button"
                            className={
                                'advisor-service-chip' +
                                (selectedServiceIds.includes(service.service_id) ? ' advisor-service-chip-on' : '')
                            }
                            onClick={() => toggleService(service.service_id)}
                        >
                            {service.service_name}
                        </button>
                    ))}
                </div>
            </div>
            <button type="submit" className="advisor-cta">
                Find spaces
            </button>
        </form>
    )
}
