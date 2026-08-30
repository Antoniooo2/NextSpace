import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import PropertyCard from './PropertyCard'
import { PROPERTY_TYPES } from './NewPropertyModal'

const PAGE_SIZE = 6
const CATEGORY_PILLS = [{ id: 'all', label: 'All' }, ...PROPERTY_TYPES.map((type) => ({ id: type, label: type }))]

export default function BusinessHome({ search, onViewProperty }) {
    const [properties, setProperties] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [category, setCategory] = useState('all')
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
    const [showFilters, setShowFilters] = useState(false)
    const [minPrice, setMinPrice] = useState('')
    const [maxPrice, setMaxPrice] = useState('')
    const [minArea, setMinArea] = useState('')
    const [maxArea, setMaxArea] = useState('')

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            setLoadError('')

            const { data, error } = await supabase
                .from('add_business')
                .select('*')
                .eq('availability', 'Available')
                .order('registration_date', { ascending: false })

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

            setProperties(data || [])
            setLoading(false)
        }

        load()

        return () => {
            cancelled = true
        }
    }, [])

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase()
        return properties.filter((property) => {
            const area = property.business_size_width * property.business_size_length
            const matchesCategory = category === 'all' || property.property_type === category
            const matchesSearch =
                !query ||
                property.property_name.toLowerCase().includes(query) ||
                property.property_type.toLowerCase().includes(query)
            const matchesMinPrice =
                !minPrice || (property.monthly_rent != null && property.monthly_rent >= Number(minPrice))
            const matchesMaxPrice =
                !maxPrice || (property.monthly_rent != null && property.monthly_rent <= Number(maxPrice))
            const matchesMinArea = !minArea || area >= Number(minArea)
            const matchesMaxArea = !maxArea || area <= Number(maxArea)
            return (
                matchesCategory &&
                matchesSearch &&
                matchesMinPrice &&
                matchesMaxPrice &&
                matchesMinArea &&
                matchesMaxArea
            )
        })
    }, [properties, category, search, minPrice, maxPrice, minArea, maxArea])

    const visible = filtered.slice(0, visibleCount)
    const activeFilterCount = [minPrice, maxPrice, minArea, maxArea].filter(Boolean).length

    const clearFilters = () => {
        setMinPrice('')
        setMaxPrice('')
        setMinArea('')
        setMaxArea('')
    }

    const handleCategoryChange = (id) => {
        setCategory(id)
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

    return (
        <>
            <div className="ns-dash-header">
                <div>
                    <h1>Explore Premises</h1>
                    <p>Find the perfect space for your next business in the most exclusive areas.</p>
                </div>
                <div className="ns-dash-header-actions">
                    <button
                        type="button"
                        className={`ns-outline-btn ${activeFilterCount > 0 ? 'active' : ''}`}
                        onClick={() => setShowFilters((v) => !v)}
                    >
                        <i className="bi bi-sliders"></i> Filters
                        {activeFilterCount > 0 && <span className="ns-filter-badge">{activeFilterCount}</span>}
                    </button>
                    <button type="button" className="ns-filled-btn">
                        <i className="bi bi-map"></i> Map
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="alert alert-danger py-2" role="alert">
                    {loadError}
                </div>
            )}

            {showFilters && (
                <div className="ns-filter-panel">
                    <div className="ns-filter-field">
                        <label>Price range (USD / mo)</label>
                        <div className="ns-filter-range">
                            <input
                                type="number" min="0" placeholder="Min"
                                value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                            />
                            <span>–</span>
                            <input
                                type="number" min="0" placeholder="Max"
                                value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="ns-filter-field">
                        <label>Area (m²)</label>
                        <div className="ns-filter-range">
                            <input
                                type="number" min="0" placeholder="Min"
                                value={minArea} onChange={(e) => setMinArea(e.target.value)}
                            />
                            <span>–</span>
                            <input
                                type="number" min="0" placeholder="Max"
                                value={maxArea} onChange={(e) => setMaxArea(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="ns-filter-actions">
                        <button type="button" className="ns-outline-btn" onClick={clearFilters}>
                            Clear filters
                        </button>
                    </div>
                </div>
            )}

            <div className="ns-pill-row">
                {CATEGORY_PILLS.map((cat) => (
                    <button
                        type="button"
                        key={cat.id}
                        className={`ns-pill ${category === cat.id ? 'active' : ''}`}
                        onClick={() => handleCategoryChange(cat.id)}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {visible.length === 0 ? (
                <div className="ns-empty-state">
                    <i className="bi bi-search"></i>
                    <h3>No properties match your search</h3>
                    <p>Try a different keyword, category, or adjust your filters.</p>
                </div>
            ) : (
                <div className="ns-prop-grid">
                    {visible.map((property) => (
                        <PropertyCard key={property.property_id} property={property} onAction={onViewProperty} />
                    ))}
                </div>
            )}

            {visibleCount < filtered.length && (
                <div className="ns-load-more">
                    <button type="button" className="ns-outline-btn" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                        Load more properties <i className="bi bi-chevron-down"></i>
                    </button>
                    <span>
                        Showing {visible.length} of {filtered.length} commercial properties
                    </span>
                </div>
            )}
        </>
    )
}
