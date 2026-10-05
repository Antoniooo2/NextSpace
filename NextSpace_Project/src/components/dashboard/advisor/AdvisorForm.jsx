import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { propertyTypeLabel, serviceLabel } from '../../../lib/displayValues'
import { PROPERTY_TYPES } from '../../../lib/propertyTypes'
import { EL_SALVADOR_DEPARTMENTS, EL_SALVADOR_DEPARTMENT_NAMES } from '../../../lib/elSalvadorLocations'

export default function AdvisorForm({ initialFilter, servicesCatalog, onSubmit }) {
    const { t } = useTranslation()
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
            .map((s) => serviceLabel(s.service_name))

        const parts = [propertyType ? t('advisor.form.typeSpace', { type: propertyTypeLabel(propertyType) }) : t('advisor.form.anySpace')]
        if (municipality) parts.push(t('advisor.form.inPlace', { place: municipality }))
        else if (department) parts.push(t('advisor.form.inPlace', { place: department }))
        if (filter.budget_max != null) parts.push(t('advisor.form.budget', { amount: `$${filter.budget_max}` }))
        if (serviceNames.length > 0) parts.push(t('advisor.form.needing', { services: serviceNames.join(', ') }))

        onSubmit(filter, t('advisor.form.message', { parts: parts.join(', ') }))
    }

    return (
        <form className="advisor-form" onSubmit={handleSubmit}>
            <p className="advisor-form-lead">
                {t('advisor.form.lead')}
            </p>
            <div className="advisor-form-grid">
                <div className="advisor-form-field">
                    <label>{t('advisor.form.budgetLabel')}</label>
                    <input
                        type="number"
                        min="0"
                        step="10"
                        placeholder={t('advisor.form.noLimit')}
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                    />
                </div>
                <div className="advisor-form-field">
                    <label>{t('advisor.form.businessType')}</label>
                    <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                        <option value="">{t('advisor.filter.anyType')}</option>
                        {PROPERTY_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {propertyTypeLabel(type)}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="advisor-form-field">
                    <label>{t('listingForm.department')}</label>
                    <select value={department} onChange={(e) => handleDepartmentChange(e.target.value)}>
                        <option value="">{t('marketplace.anyDepartment')}</option>
                        {EL_SALVADOR_DEPARTMENT_NAMES.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="advisor-form-field">
                    <label>{t('marketplace.municipality')}</label>
                    <select
                        value={municipality}
                        onChange={(e) => setMunicipality(e.target.value)}
                        disabled={!department}
                    >
                        <option value="">{t('marketplace.anyMunicipality')}</option>
                        {(EL_SALVADOR_DEPARTMENTS[department] || []).map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="advisor-form-field advisor-form-services">
                <label>{t('advisor.form.mustHave')}</label>
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
                            {serviceLabel(service.service_name)}
                        </button>
                    ))}
                </div>
            </div>
            <button type="submit" className="advisor-cta">
                {t('advisor.form.find')}
            </button>
        </form>
    )
}
