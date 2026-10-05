import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'
import { MAP_PINS } from '../../../lib/mapPins'
import { ES_BOUNDS, ES_CENTER, TILE_ATTRIBUTION, TILE_URL, pinIcon } from './mapUtils'
import './map.css'

function ClickToPlace({ onChange }) {
    useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) })
    return null
}

// Moves the view when the pin or the chosen department changes.
function Recenter({ pin, fallback, zoom }) {
    const map = useMap()
    const key = pin ? `${pin.lat},${pin.lng}` : fallback.join(',')
    useEffect(() => {
        if (pin) map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 15))
        else map.setView(fallback, zoom)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
    return null
}

// Tap the map (or drag the pin) to say where the space is. `value` is
// { lat, lng } or null; the owner can also use their current location.
export default function LocationPicker({ value, onChange, department }) {
    const { t } = useTranslation()
    const markerRef = useRef(null)
    const icon = useMemo(() => pinIcon(), [])
    const capital = MAP_PINS.find((p) => p.department === department)
    const fallback = capital ? [capital.lat, capital.lon] : ES_CENTER

    const locate = () => {
        navigator.geolocation.getCurrentPosition(
            (pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => {},
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    return (
        <div className="ns-picker">
            <div className="ns-picker-map">
                <MapContainer center={fallback} zoom={value ? 15 : 8} minZoom={7} maxBounds={ES_BOUNDS} scrollWheelZoom={false} className="ns-leaflet">
                    <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
                    <ClickToPlace onChange={onChange} />
                    <Recenter pin={value} fallback={fallback} zoom={capital ? 11 : 8} />
                    {value && (
                        <Marker
                            position={[value.lat, value.lng]}
                            icon={icon}
                            draggable
                            ref={markerRef}
                            eventHandlers={{
                                dragend: () => {
                                    const p = markerRef.current?.getLatLng()
                                    if (p) onChange({ lat: p.lat, lng: p.lng })
                                },
                            }}
                        />
                    )}
                </MapContainer>
            </div>
            <div className="ns-picker-bar">
                <span className={value ? 'is-set' : ''}>
                    <i className={`bi ${value ? 'bi-geo-alt-fill' : 'bi-hand-index'}`}></i>{' '}
                    {value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : t('map.picker.hint')}
                </span>
                <div>
                    {navigator.geolocation && (
                        <button type="button" className="ns-link-btn" onClick={locate}>
                            <i className="bi bi-crosshair"></i> {t('map.picker.useMine')}
                        </button>
                    )}
                    {value && (
                        <button type="button" className="ns-link-btn" onClick={() => onChange(null)}>
                            <i className="bi bi-x-circle"></i> {t('map.picker.remove')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
