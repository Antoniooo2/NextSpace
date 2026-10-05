import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'
import { money } from '../../../lib/money'
import { propertyTypeLabel } from '../../../lib/displayValues'
import { areaOf, locationOf, typeColors, typeIcon } from '../../../lib/listings'
import { DOT, SQ_M } from '../../../lib/symbols'
import { ES_BOUNDS, ES_CENTER, TILE_ATTRIBUTION, TILE_URL, hasPin, priceIcon } from './mapUtils'
import './map.css'

function FitToPins({ points }) {
    const map = useMap()
    useEffect(() => {
        if (points.length === 0) return
        if (points.length === 1) map.setView(points[0], 14)
        else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 })
    }, [map, points])
    return null
}

// Keeps the map sized right when its container changes (toggle, rotation).
function Resize() {
    const map = useMap()
    useEffect(() => {
        const ro = new ResizeObserver(() => map.invalidateSize())
        ro.observe(map.getContainer())
        return () => ro.disconnect()
    }, [map])
    return null
}

// The filtered spaces as price markers; tapping one opens a card with a link
// to the detail page. Spaces without a pin are counted, not hidden silently.
export default function ListingsMap({ properties, onOpen }) {
    const { t } = useTranslation()
    const [selectedId, setSelectedId] = useState(null)
    const pinned = useMemo(() => properties.filter(hasPin), [properties])
    const points = useMemo(() => pinned.map((p) => [Number(p.latitude), Number(p.longitude)]), [pinned])
    const selected = pinned.find((p) => p.property_id === selectedId) || null
    const missing = properties.length - pinned.length
    const [bg, fg] = selected ? typeColors(selected.property_type) : []
    const area = selected ? areaOf(selected) : null

    return (
        <div className="ns-lmap">
            <div className="ns-lmap-frame">
                <MapContainer center={ES_CENTER} zoom={8} minZoom={7} maxBounds={ES_BOUNDS} className="ns-leaflet" scrollWheelZoom>
                    <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
                    <Resize />
                    <FitToPins points={points} />
                    {pinned.map((p) => (
                        <Marker
                            key={p.property_id}
                            position={[Number(p.latitude), Number(p.longitude)]}
                            icon={priceIcon(p, p.property_id === selectedId)}
                            zIndexOffset={p.property_id === selectedId ? 1000 : 0}
                            eventHandlers={{ click: () => setSelectedId(p.property_id) }}
                            title={p.property_name}
                        />
                    ))}
                </MapContainer>

                {pinned.length === 0 && (
                    <div className="ns-lmap-empty">
                        <i className="bi bi-geo-alt"></i>
                        <span>{t('map.noPins')}</span>
                    </div>
                )}

                {selected && (
                    <article className="ns-lmap-card" role="dialog" aria-label={selected.property_name}>
                        <button type="button" className="ns-lmap-close" onClick={() => setSelectedId(null)} aria-label={t('common.close')}>
                            <i className="bi bi-x-lg"></i>
                        </button>
                        <div className="ns-lmap-media">
                            {selected.photo_url ? (
                                <img src={selected.photo_url} alt="" />
                            ) : (
                                <span style={{ background: bg, color: fg }}>
                                    <i className={`bi ${typeIcon(selected.property_type)}`}></i>
                                </span>
                            )}
                        </div>
                        <div className="ns-lmap-info">
                            <strong>{selected.monthly_rent != null ? `${money(selected.monthly_rent)}${t('common.perMonth')}` : t('map.priceOnRequest')}</strong>
                            <h3>{selected.property_name}</h3>
                            <p>
                                {propertyTypeLabel(selected.property_type)}
                                {area ? ` ${DOT} ${area} ${SQ_M}` : ''}
                            </p>
                            {locationOf(selected) && <p>{locationOf(selected)}</p>}
                            <button type="button" className="ns-filled-btn" onClick={() => onOpen?.(selected)}>
                                {t('map.viewDetails')} <i className="bi bi-arrow-right"></i>
                            </button>
                        </div>
                    </article>
                )}
            </div>
            {missing > 0 && pinned.length > 0 && (
                <p className="ns-lmap-note">
                    <i className="bi bi-info-circle"></i> {t('map.missing', { count: missing })}
                </p>
            )}
        </div>
    )
}
