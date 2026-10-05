import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SOURCE_URL =
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
const ROOT = new URL('../', import.meta.url)
const COMPONENT_FILE = fileURLToPath(new URL('src/components/ElSalvadorMap.jsx', ROOT))
const PINS_FILE = fileURLToPath(new URL('src/lib/mapPins.js', ROOT))

const MAP_WIDTH = 1000
const PADDING = 12

const CAPITALS = [
    { department: 'Ahuachap\u00e1n', capital: 'Ahuachap\u00e1n', lat: 13.9214, lon: -89.845 },
    { department: 'Santa Ana', capital: 'Santa Ana', lat: 13.9942, lon: -89.5597 },
    { department: 'Sonsonate', capital: 'Sonsonate', lat: 13.7189, lon: -89.7242 },
    { department: 'Chalatenango', capital: 'Chalatenango', lat: 14.0372, lon: -88.935 },
    { department: 'La Libertad', capital: 'Santa Tecla', lat: 13.6769, lon: -89.2797 },
    { department: 'San Salvador', capital: 'San Salvador', lat: 13.6989, lon: -89.1914 },
    { department: 'Cuscatl\u00e1n', capital: 'Cojutepeque', lat: 13.7167, lon: -88.9333 },
    { department: 'La Paz', capital: 'Zacatecoluca', lat: 13.5081, lon: -88.8697 },
    { department: 'Caba\u00f1as', capital: 'Sensuntepeque', lat: 13.8783, lon: -88.6286 },
    { department: 'San Vicente', capital: 'San Vicente', lat: 13.6403, lon: -88.7847 },
    { department: 'Usulut\u00e1n', capital: 'Usulut\u00e1n', lat: 13.3446, lon: -88.4386 },
    { department: 'San Miguel', capital: 'San Miguel', lat: 13.4833, lon: -88.1833 },
    { department: 'Moraz\u00e1n', capital: 'San Francisco Gotera', lat: 13.695, lon: -88.105 },
    { department: 'La Uni\u00f3n', capital: 'La Uni\u00f3n', lat: 13.3369, lon: -87.8439 },
]

function ascii(text) {
    return text.replace(/[^\x20-\x7e\n]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

async function loadSource() {
    const localPath = process.argv[2]
    if (localPath) return JSON.parse(await readFile(localPath, 'utf8'))
    const response = await fetch(SOURCE_URL)
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    return response.json()
}

function polygonsOf(geometry) {
    return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
}

function makeProjection(features) {
    let minLon = Infinity
    let maxLon = -Infinity
    let minLat = Infinity
    let maxLat = -Infinity
    for (const feature of features) {
        for (const polygon of polygonsOf(feature.geometry)) {
            for (const [lon, lat] of polygon[0]) {
                minLon = Math.min(minLon, lon)
                maxLon = Math.max(maxLon, lon)
                minLat = Math.min(minLat, lat)
                maxLat = Math.max(maxLat, lat)
            }
        }
    }
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
    const scale = (MAP_WIDTH - PADDING * 2) / ((maxLon - minLon) * k)
    const height = Math.ceil((maxLat - minLat) * scale + PADDING * 2)
    const project = ([lon, lat]) => [
        (lon - minLon) * k * scale + PADDING,
        (maxLat - lat) * scale + PADDING,
    ]
    return { project, height }
}

function formatNumbers(values) {
    return values.reduce((out, value, index) => {
        const text = String(value)
        if (index === 0 || text.startsWith('-')) return out + text
        return `${out} ${text}`
    }, '')
}

function ringToPath(ring, project) {
    const points = []
    for (const coordinate of ring) {
        const [x, y] = project(coordinate).map(Math.round)
        const last = points[points.length - 1]
        if (!last || last[0] !== x || last[1] !== y) points.push([x, y])
    }
    if (points.length > 1) {
        const first = points[0]
        const last = points[points.length - 1]
        if (first[0] === last[0] && first[1] === last[1]) points.pop()
    }
    if (points.length < 3) return ''
    const [start, ...rest] = points
    const deltas = []
    let previous = start
    for (const point of rest) {
        deltas.push(point[0] - previous[0], point[1] - previous[1])
        previous = point
    }
    return `M${formatNumbers(start)}l${formatNumbers(deltas)}z`
}

function outerRings(features) {
    const key = (point) => `${point[0]},${point[1]}`
    const segments = new Map()
    for (const feature of features) {
        for (const polygon of polygonsOf(feature.geometry)) {
            for (const ring of polygon) {
                for (let i = 0; i < ring.length - 1; i += 1) {
                    const a = key(ring[i])
                    const b = key(ring[i + 1])
                    if (a === b) continue
                    const id = a < b ? `${a}|${b}` : `${b}|${a}`
                    const entry = segments.get(id)
                    if (entry) entry.count += 1
                    else segments.set(id, { a: ring[i], b: ring[i + 1], count: 1 })
                }
            }
        }
    }
    const next = new Map()
    for (const { a, b, count } of segments.values()) {
        if (count !== 1) continue
        next.set(key(a), b)
    }
    const rings = []
    while (next.size) {
        const [startKey, firstPoint] = next.entries().next().value
        const ring = [startKey.split(',').map(Number)]
        let currentKey = startKey
        let point = firstPoint
        next.delete(currentKey)
        while (point) {
            ring.push(point)
            currentKey = key(point)
            if (currentKey === startKey) break
            const following = next.get(currentKey)
            next.delete(currentKey)
            point = following
        }
        if (key(ring[ring.length - 1]) !== startKey) throw new Error('Outline ring did not close')
        rings.push(ring)
    }
    return rings
}

function insideRing([x, y], ring) {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
}

function containsPoint(feature, point) {
    return polygonsOf(feature.geometry).some(
        ([outer, ...holes]) => insideRing(point, outer) && !holes.some((hole) => insideRing(point, hole)),
    )
}

function buildComponent(departments, outline) {
    const rows = departments
        .map((d) => `    { id: '${d.id}', name: '${d.name}', d: '${d.d}' },`)
        .join('\n')
    return ascii(`import { motion } from 'motion/react'
import { MAP_HEIGHT, MAP_WIDTH } from '../lib/mapPins'

const DEPARTMENTS = [
${rows}
]

const OUTLINE = '${outline}'

export default function ElSalvadorMap({ departmentProps, outlineProps, ...svgProps }) {
    return (
        <svg viewBox={\`0 0 \${MAP_WIDTH} \${MAP_HEIGHT}\`} {...svgProps}>
            <g className="ns-map-departments">
                {DEPARTMENTS.map((department, index) => (
                    <motion.path
                        key={department.id}
                        d={department.d}
                        data-department={department.name}
                        custom={index}
                        {...departmentProps}
                    />
                ))}
            </g>
            <motion.path className="ns-map-outline" d={OUTLINE} {...outlineProps} />
        </svg>
    )
}
`)
}

function buildPins(pins, height) {
    const rows = pins
        .map(
            (p) =>
                `    { department: '${p.department}', capital: '${p.capital}', lat: ${p.lat}, lon: ${p.lon}, x: ${p.x}, y: ${p.y} },`,
        )
        .join('\n')
    return ascii(`export const MAP_WIDTH = ${MAP_WIDTH}
export const MAP_HEIGHT = ${height}

export const MAP_PINS = [
${rows}
].map((pin) => ({ ...pin, left: (pin.x / MAP_WIDTH) * 100, top: (pin.y / MAP_HEIGHT) * 100 }))
`)
}

async function main() {
    const source = await loadSource()
    const features = source.features
        .filter((feature) => feature.properties.adm0_a3 === 'SLV')
        .sort((a, b) => a.properties.longitude - b.properties.longitude)
    if (features.length !== 14) throw new Error(`Expected 14 departments, got ${features.length}`)

    const { project, height } = makeProjection(features)
    const departments = features.map((feature) => ({
        id: feature.properties.iso_3166_2,
        name: feature.properties.name.normalize('NFC'),
        d: polygonsOf(feature.geometry)
            .flatMap((polygon) => polygon.map((ring) => ringToPath(ring, project)))
            .join(''),
    }))
    const outline = outerRings(features)
        .map((ring) => ringToPath(ring, project))
        .join('')

    const pins = CAPITALS.map((pin) => {
        const feature = features.find((f) => f.properties.name.normalize('NFC') === pin.department)
        if (!feature) throw new Error(`No shape for ${pin.department}`)
        if (!containsPoint(feature, [pin.lon, pin.lat])) {
            throw new Error(`${pin.capital} falls outside ${pin.department}`)
        }
        const [x, y] = project([pin.lon, pin.lat]).map((v) => Math.round(v * 10) / 10)
        return { ...pin, x, y }
    }).sort((a, b) => a.lon - b.lon)

    await writeFile(COMPONENT_FILE, buildComponent(departments, outline))
    await writeFile(PINS_FILE, buildPins(pins, height))
    console.log(`Wrote ${departments.length} departments, ${pins.length} pins, height ${height}`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
