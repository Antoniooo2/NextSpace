import { useState } from 'react'
import { CATEGORIES } from '../../data/properties'

const REAL_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'all')

const FEATURE_BY_CATEGORY = {
    retail: { icon: 'bi-snow', label: 'AC Ready' },
    office: { icon: 'bi-building', label: 'Furnished' },
    plaza: { icon: 'bi-p-square', label: 'Parking available' },
    warehouse: { icon: 'bi-box-seam', label: 'Loading dock' },
}

export default function NewPropertyModal({ onClose, onCreate }) {
    const [title, setTitle] = useState('')
    const [city, setCity] = useState('')
    const [category, setCategory] = useState('retail')
    const [price, setPrice] = useState('')
    const [area, setArea] = useState('')

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!title || !city || !price || !area) return

        onCreate({
            title,
            city,
            category,
            price: Number(price),
            area: Number(area),
            feature: FEATURE_BY_CATEGORY[category],
        })
    }

    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-modal-form" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ns-modal-close" onClick={onClose} aria-label="Close">
                    <i className="bi bi-x-lg"></i>
                </button>

                <div className="ns-modal-body">
                    <h2 className="ns-modal-form-title">Publish a new space</h2>
                    <p className="ns-modal-form-subtitle">
                        This listing is added to your dashboard for this session as a preview — connect
                        Supabase to persist it for real.
                    </p>

                    <form onSubmit={handleSubmit}>
                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="propTitle">Property name</label>
                            <div className="ns-input-group input-group">
                                <span className="input-group-text"><i className="bi bi-shop"></i></span>
                                <input
                                    id="propTitle" type="text" className="form-control" placeholder="Local Las Flores"
                                    value={title} onChange={(e) => setTitle(e.target.value)} required
                                />
                            </div>
                        </div>

                        <div className="ns-mb-field">
                            <label className="ns-label" htmlFor="propCity">City / Zone</label>
                            <div className="ns-input-group input-group">
                                <span className="input-group-text"><i className="bi bi-geo-alt"></i></span>
                                <input
                                    id="propCity" type="text" className="form-control" placeholder="Santa Tecla, La Libertad"
                                    value={city} onChange={(e) => setCity(e.target.value)} required
                                />
                            </div>
                        </div>

                        <div className="ns-mb-field">
                            <span className="ns-account-type-label">Category</span>
                            <div className="row g-2">
                                {REAL_CATEGORIES.map((cat) => (
                                    <div className="col-6" key={cat.id}>
                                        <div
                                            className={`ns-type-card ${category === cat.id ? 'selected' : ''}`}
                                            role="button" tabIndex={0}
                                            onClick={() => setCategory(cat.id)}
                                        >
                                            <div className="ns-type-title">{cat.label}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="row g-2">
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="propPrice">Price / mo (USD)</label>
                                    <div className="ns-input-group input-group">
                                        <span className="input-group-text"><i className="bi bi-currency-dollar"></i></span>
                                        <input
                                            id="propPrice" type="number" min="0" className="form-control" placeholder="850"
                                            value={price} onChange={(e) => setPrice(e.target.value)} required
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="ns-mb-field">
                                    <label className="ns-label" htmlFor="propArea">Area (m²)</label>
                                    <div className="ns-input-group input-group">
                                        <span className="input-group-text"><i className="bi bi-arrows-angle-expand"></i></span>
                                        <input
                                            id="propArea" type="number" min="0" className="form-control" placeholder="120"
                                            value={area} onChange={(e) => setArea(e.target.value)} required
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="ns-submit-btn">Publish space</button>
                    </form>
                </div>
            </div>
        </div>
    )
}
