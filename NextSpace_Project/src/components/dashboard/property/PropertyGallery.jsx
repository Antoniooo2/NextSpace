import { useEffect, useState } from 'react'
import { typeColors, typeIcon } from '../../../lib/listings'

// Mosaic (one large + two small) when there are 3+ photos, a single photo
// otherwise. Any photo opens a full-size viewer with arrows.
export default function PropertyGallery({ property, badge }) {
    const photos = property.photos || (property.photo_url ? [{ photo_url: property.photo_url }] : [])
    const [viewer, setViewer] = useState(null)
    const [bg, fg] = typeColors(property.property_type)

    useEffect(() => {
        if (viewer == null) return undefined
        const onKey = (e) => {
            if (e.key === 'Escape') setViewer(null)
            if (e.key === 'ArrowRight') setViewer((i) => (i + 1) % photos.length)
            if (e.key === 'ArrowLeft') setViewer((i) => (i - 1 + photos.length) % photos.length)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [viewer, photos.length])

    if (photos.length === 0) {
        return (
            <div className="ns-pg ns-pg-empty" style={{ background: bg, color: fg }}>
                <i className={`bi ${typeIcon(property.property_type)}`}></i>
                <span>No photos yet</span>
                {badge}
            </div>
        )
    }

    const mosaic = photos.length >= 3
    return (
        <>
            <div className={`ns-pg ${mosaic ? 'is-mosaic' : ''}`}>
                <button type="button" className="ns-pg-main" onClick={() => setViewer(0)} aria-label="Open photos">
                    <img src={photos[0].photo_url} alt={property.property_name} />
                </button>
                {mosaic && (
                    <div className="ns-pg-side">
                        {photos.slice(1, 3).map((ph, i) => (
                            <button type="button" key={ph.photo_url} onClick={() => setViewer(i + 1)} aria-label={`Photo ${i + 2}`}>
                                <img src={ph.photo_url} alt="" />
                                {i === 1 && photos.length > 3 && <span className="ns-pg-more">+{photos.length - 3}</span>}
                            </button>
                        ))}
                    </div>
                )}
                {badge}
                {photos.length > 1 && (
                    <button type="button" className="ns-pg-all" onClick={() => setViewer(0)}>
                        <i className="bi bi-images"></i> {photos.length} photos
                    </button>
                )}
            </div>

            {viewer != null && (
                <div className="ns-pg-viewer" role="dialog" aria-modal="true" aria-label="Photos" onClick={() => setViewer(null)}>
                    <button type="button" className="ns-pg-viewer-close" aria-label="Close" onClick={() => setViewer(null)}>
                        <i className="bi bi-x-lg"></i>
                    </button>
                    <img src={photos[viewer].photo_url} alt={`Photo ${viewer + 1}`} onClick={(e) => e.stopPropagation()} />
                    {photos.length > 1 && (
                        <>
                            <button
                                type="button"
                                className="ns-pg-viewer-nav is-prev"
                                aria-label="Previous photo"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setViewer((i) => (i - 1 + photos.length) % photos.length)
                                }}
                            >
                                <i className="bi bi-chevron-left"></i>
                            </button>
                            <button
                                type="button"
                                className="ns-pg-viewer-nav is-next"
                                aria-label="Next photo"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setViewer((i) => (i + 1) % photos.length)
                                }}
                            >
                                <i className="bi bi-chevron-right"></i>
                            </button>
                            <span className="ns-pg-viewer-count">
                                {viewer + 1} / {photos.length}
                            </span>
                        </>
                    )}
                </div>
            )}
        </>
    )
}
