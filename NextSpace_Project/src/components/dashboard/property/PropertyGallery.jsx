import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { typeColors, typeIcon } from '../../../lib/listings'

// Mosaic (one large + two small) when there are 3+ photos, a single photo
// otherwise. Any photo opens a full-size viewer with arrows.
export default function PropertyGallery({ property, badge }) {
    const { t } = useTranslation()
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
                <span>{t('gallery.noPhotos')}</span>
                {badge}
            </div>
        )
    }

    const mosaic = photos.length >= 3
    return (
        <>
            <div className={`ns-pg ${mosaic ? 'is-mosaic' : ''}`}>
                <button type="button" className="ns-pg-main" onClick={() => setViewer(0)} aria-label={t('gallery.open')}>
                    <img src={photos[0].photo_url} alt={property.property_name} />
                </button>
                {mosaic && (
                    <div className="ns-pg-side">
                        {photos.slice(1, 3).map((ph, i) => (
                            <button type="button" key={ph.photo_url} onClick={() => setViewer(i + 1)} aria-label={t('listingForm.photos.alt', { n: i + 2 })}>
                                <img src={ph.photo_url} alt="" />
                                {i === 1 && photos.length > 3 && <span className="ns-pg-more">+{photos.length - 3}</span>}
                            </button>
                        ))}
                    </div>
                )}
                {badge}
                {photos.length > 1 && (
                    <button type="button" className="ns-pg-all" onClick={() => setViewer(0)}>
                        <i className="bi bi-images"></i> {t('gallery.count', { count: photos.length })}
                    </button>
                )}
            </div>

            {viewer != null && (
                <div className="ns-pg-viewer" role="dialog" aria-modal="true" aria-label={t('listingForm.photos.title')} onClick={() => setViewer(null)}>
                    <button type="button" className="ns-pg-viewer-close" aria-label={t('common.close')} onClick={() => setViewer(null)}>
                        <i className="bi bi-x-lg"></i>
                    </button>
                    <img src={photos[viewer].photo_url} alt={t('listingForm.photos.alt', { n: viewer + 1 })} onClick={(e) => e.stopPropagation()} />
                    {photos.length > 1 && (
                        <>
                            <button
                                type="button"
                                className="ns-pg-viewer-nav is-prev"
                                aria-label={t('gallery.previous')}
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
                                aria-label={t('gallery.next')}
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
