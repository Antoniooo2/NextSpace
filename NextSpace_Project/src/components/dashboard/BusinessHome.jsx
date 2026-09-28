import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import PropertyCard from './PropertyCard'
import { PROPERTY_TYPES } from '../../lib/propertyTypes'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../../lib/propertyPhotos'
import { PROPERTY_SERVICES_FULL_EMBED, withServices } from '../../lib/propertyServices'
import { EL_SALVADOR_DEPARTMENTS, EL_SALVADOR_DEPARTMENT_NAMES } from '../../lib/elSalvadorLocations'
import { SERVICE_ICON, areaOf, typeIcon } from '../../lib/listings'
import { loadSavedIds, setSaved } from '../../lib/savedProperties'
import './listings.css'

const PAGE_SIZE = 9

const SORTS = [
    { id: 'newest', label: 'Newest first' },
    { id: 'price-asc', label: 'Price: low to high' },
    { id: 'price-desc', label: 'Price: high to low' },
    { id: 'size-desc', label: 'Size: largest first' },
]

const EMPTY_FILTERS = { department: '', municipality: '', minPrice: '', maxPrice: '', minArea: '', maxArea: '', services: [] }

function matchesText(property, query) {
    if (!query) return true
    return [property.property_name, property.property_type, property.municipality, property.department, property.address]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(query))
}

// Marketplace: every listed space, with location/price/size/amenity filters,
// sorting, and the active filters as chips you can remove one by one.
export default function BusinessHome({ user, search, onViewProperty, onAskRony }) {
    const [properties, setProperties] = useState([])
    const [serviceCatalog, setServiceCatalog] = useState([])
    const [savedIds, setSavedIds] = useState(() => new Set())
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [category, setCategory] = useState('all')
    const [filters, setFilters] = useState(EMPTY_FILTERS)
    const [sort, setSort] = useState('newest')
    const [showFilters, setShowFilters] = useState(false)
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            setLoadError('')

            const [{ data, error }, { data: services }, saved] = await Promise.all([
                supabase
                    .from('add_business')
                    .select(`*, ${PROPERTY_PHOTO_EMBED}, ${PROPERTY_SERVICES_FULL_EMBED}`)
                    .eq('availability', 'Available')
                    .order('registration_date', { ascending: false }),
                supabase.from('services').select('service_id, service_name').order('service_id'),
                loadSavedIds(user?.id),
            ])

            if (cancelled) return

            if (error) {
                const message = error.message || ''
                setLoadError(
                    message.toLowerCase().includes('fetch') || message.toLowerCase().includes('network')
                        ? 'Could not reach the server. Check your internet connection and try again.'
                        : message || 'Something went wrong while loading properties.'
                )
                setLoading(false)
                return
            }

            setProperties((data || []).map((row) => withServices(withCoverPhoto(row))))
            setServiceCatalog(services || [])
            setSavedIds(saved)
            setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [user?.id])

    const setFilter = (key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
        setVisibleCount(PAGE_SIZE)
    }

    // Everything but the category, so the category counts reflect the rest.
    const baseFiltered = useMemo(() => {
        const query = search.trim().toLowerCase()
        const f = filters
        return properties.filter((p) => {
            const area = areaOf(p)
            const rent = p.monthly_rent != null ? Number(p.monthly_rent) : null
            return (
                matchesText(p, query) &&
                (!f.department || p.department === f.department) &&
                (!f.municipality || p.municipality === f.municipality) &&
                (!f.minPrice || (rent != null && rent >= Number(f.minPrice))) &&
                (!f.maxPrice || (rent != null && rent <= Number(f.maxPrice))) &&
                (!f.minArea || (area != null && area >= Number(f.minArea))) &&
                (!f.maxArea || (area != null && area <= Number(f.maxArea))) &&
                f.services.every((id) => p.service_ids.includes(id))
            )
        })
    }, [properties, search, filters])

    const categoryCounts = useMemo(() => {
        const counts = { all: baseFiltered.length }
        for (const p of baseFiltered) counts[p.property_type] = (counts[p.property_type] || 0) + 1
        return counts
    }, [baseFiltered])

    const results = useMemo(() => {
        const list = category === 'all' ? baseFiltered : baseFiltered.filter((p) => p.property_type === category)
        const price = (p) => (p.monthly_rent == null ? null : Number(p.monthly_rent))
        const sorted = [...list]
        if (sort === 'price-asc') sorted.sort((a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity))
        if (sort === 'price-desc') sorted.sort((a, b) => (price(b) ?? -1) - (price(a) ?? -1))
        if (sort === 'size-desc') sorted.sort((a, b) => (areaOf(b) ?? 0) - (areaOf(a) ?? 0))
        return sorted
    }, [baseFiltered, category, sort])

    // Active filters as removable chips.
    const chips = []
    if (filters.department) {
        chips.push({
            id: 'location',
            label: filters.municipality ? `${filters.municipality}, ${filters.department}` : filters.department,
            clear: () => setFilters((p) => ({ ...p, department: '', municipality: '' })),
        })
    }
    if (filters.minPrice || filters.maxPrice) {
        chips.push({
            id: 'price',
            label: `$${filters.minPrice || '0'} – ${filters.maxPrice ? `$${filters.maxPrice}` : 'any'}`,
            clear: () => setFilters((p) => ({ ...p, minPrice: '', maxPrice: '' })),
        })
    }
    if (filters.minArea || filters.maxArea) {
        chips.push({
            id: 'area',
            label: `${filters.minArea || '0'} – ${filters.maxArea || 'any'} m²`,
            clear: () => setFilters((p) => ({ ...p, minArea: '', maxArea: '' })),
        })
    }
    for (const id of filters.services) {
        const name = serviceCatalog.find((s) => s.service_id === id)?.service_name || 'Amenity'
        chips.push({ id: `svc-${id}`, label: name, clear: () => setFilter('services', filters.services.filter((x) => x !== id)) })
    }

    const toggleService = (id) =>
        setFilter('services', filters.services.includes(id) ? filters.services.filter((x) => x !== id) : [...filters.services, id])

    const toggleSave = async (property) => {
        if (!user?.id) return
        const next = !savedIds.has(property.property_id)
        setSavedIds((prev) => {
            const copy = new Set(prev)
            if (next) copy.add(property.property_id)
            else copy.delete(property.property_id)
            return copy
        })
        const ok = await setSaved(user.id, property.property_id, next)
        if (!ok) {
            setSavedIds((prev) => {
                const copy = new Set(prev)
                if (next) copy.delete(property.property_id)
                else copy.add(property.property_id)
                return copy
            })
        }
    }

    const clearAll = () => {
        setFilters(EMPTY_FILTERS)
        setCategory('all')
        setVisibleCount(PAGE_SIZE)
    }

    if (loading) {
        return (
            <div className="ns-dash-loading">
                <div className="ns-dash-spinner" />
                <p>Loading properties...</p>
            </div>
        )
    }

    const visible = results.slice(0, visibleCount)
    const municipalities = filters.department ? EL_SALVADOR_DEPARTMENTS[filters.department] || [] : []

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Marketplace</h1>
                    <p>Commercial spaces for rent across El Salvador. Request a lease and the owner answers in Contracts.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button
                        type="button"
                        className={`ns-outline-btn ${showFilters || chips.length > 0 ? 'active' : ''}`}
                        onClick={() => setShowFilters((v) => !v)}
                        aria-expanded={showFilters}
                    >
                        <i className="bi bi-sliders"></i> Filters
                        {chips.length > 0 && <span className="ns-filter-badge">{chips.length}</span>}
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            <div className="ns-mk-cats" role="tablist" aria-label="Type of space">
                {[{ id: 'all', label: 'All spaces', icon: 'bi-grid' }, ...PROPERTY_TYPES.map((t) => ({ id: t, label: t, icon: typeIcon(t) }))].map(
                    (cat) => (
                        <button
                            type="button"
                            key={cat.id}
                            role="tab"
                            aria-selected={category === cat.id}
                            className={`${category === cat.id ? 'active' : ''} ${cat.id !== 'all' && !categoryCounts[cat.id] ? 'is-empty' : ''}`}
                            onClick={() => {
                                setCategory(cat.id)
                                setVisibleCount(PAGE_SIZE)
                            }}
                        >
                            <i className={`bi ${cat.icon}`}></i>
                            <span>{cat.label}</span>
                            <em>{categoryCounts[cat.id] || 0}</em>
                        </button>
                    )
                )}
            </div>

            {showFilters && (
                <section className="ns-mk-filters" aria-label="Filters">
                    <div className="ns-mk-filter">
                        <label htmlFor="mkDept">Location</label>
                        <div className="ns-mk-filter-row">
                            <select
                                id="mkDept"
                                className="form-select"
                                value={filters.department}
                                onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value, municipality: '' }))}
                            >
                                <option value="">Any department</option>
                                {EL_SALVADOR_DEPARTMENT_NAMES.map((d) => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="form-select"
                                aria-label="Municipality"
                                value={filters.municipality}
                                onChange={(e) => setFilter('municipality', e.target.value)}
                                disabled={!filters.department}
                            >
                                <option value="">Any municipality</option>
                                {municipalities.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="ns-mk-filter">
                        <label>Monthly rent (USD)</label>
                        <div className="ns-mk-filter-row">
                            <input
                                type="number"
                                min="0"
                                className="form-control"
                                placeholder="Min"
                                aria-label="Minimum rent"
                                value={filters.minPrice}
                                onChange={(e) => setFilter('minPrice', e.target.value)}
                            />
                            <input
                                type="number"
                                min="0"
                                className="form-control"
                                placeholder="Max"
                                aria-label="Maximum rent"
                                value={filters.maxPrice}
                                onChange={(e) => setFilter('maxPrice', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="ns-mk-filter">
                        <label>Size (m²)</label>
                        <div className="ns-mk-filter-row">
                            <input
                                type="number"
                                min="0"
                                className="form-control"
                                placeholder="Min"
                                aria-label="Minimum size"
                                value={filters.minArea}
                                onChange={(e) => setFilter('minArea', e.target.value)}
                            />
                            <input
                                type="number"
                                min="0"
                                className="form-control"
                                placeholder="Max"
                                aria-label="Maximum size"
                                value={filters.maxArea}
                                onChange={(e) => setFilter('maxArea', e.target.value)}
                            />
                        </div>
                    </div>
                    {serviceCatalog.length > 0 && (
                        <div className="ns-mk-filter ns-mk-filter-wide">
                            <label>Must have</label>
                            <div className="ns-mk-amenities">
                                {serviceCatalog
                                    .filter((s) => s.service_name !== 'Others')
                                    .map((s) => (
                                        <button
                                            type="button"
                                            key={s.service_id}
                                            className={filters.services.includes(s.service_id) ? 'active' : ''}
                                            aria-pressed={filters.services.includes(s.service_id)}
                                            onClick={() => toggleService(s.service_id)}
                                        >
                                            <i className={`bi ${SERVICE_ICON[s.service_name] || 'bi-check2'}`}></i> {s.service_name}
                                        </button>
                                    ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            <div className="ns-mk-resultbar">
                <div className="ns-mk-resultbar-left">
                    <strong>
                        {results.length} {results.length === 1 ? 'space' : 'spaces'}
                    </strong>
                    {search.trim() && <span className="ns-mk-searching">for “{search.trim()}”</span>}
                    {chips.map((chip) => (
                        <button type="button" key={chip.id} className="ns-mk-chip" onClick={chip.clear} aria-label={`Remove filter ${chip.label}`}>
                            {chip.label} <i className="bi bi-x"></i>
                        </button>
                    ))}
                    {(chips.length > 0 || category !== 'all') && (
                        <button type="button" className="ns-link-btn" onClick={clearAll}>
                            Clear all
                        </button>
                    )}
                </div>
                <label className="ns-mk-sort">
                    <span>Sort</span>
                    <select className="form-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                        {SORTS.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {visible.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-search"></i>
                    <h3>No spaces match</h3>
                    <p>Try another area or remove a filter.</p>
                    <div className="d-flex gap-2 justify-content-center flex-wrap">
                        {(chips.length > 0 || category !== 'all') && (
                            <button type="button" className="ns-outline-btn" onClick={clearAll}>
                                Clear filters
                            </button>
                        )}
                        {onAskRony && (
                            <button
                                type="button"
                                className="ns-filled-btn"
                                onClick={() => onAskRony({ text: search.trim() ? `Find me a space: ${search.trim()}` : 'Help me find a commercial space for my business.' })}
                            >
                                <i className="bi bi-stars"></i> Describe it to Rony
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="ns-mk-grid">
                    {visible.map((property) => (
                        <PropertyCard
                            key={property.property_id}
                            property={property}
                            onOpen={onViewProperty}
                            saved={savedIds.has(property.property_id)}
                            onToggleSave={user?.id ? toggleSave : undefined}
                        />
                    ))}
                </div>
            )}

            {visibleCount < results.length && (
                <div className="ns-load-more">
                    <button type="button" className="ns-outline-btn" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                        Show more spaces <i className="bi bi-chevron-down"></i>
                    </button>
                    <span>
                        Showing {visible.length} of {results.length}
                    </span>
                </div>
            )}
        </>
    )
}
