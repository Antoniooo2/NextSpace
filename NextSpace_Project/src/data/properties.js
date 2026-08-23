import plazaLasRamblas from '../assets/properties/plaza-las-ramblas.jpg'
import edificioAvante from '../assets/properties/edificio-avante.jpg'
import centroCorporativoRoma from '../assets/properties/centro-corporativo-roma.jpg'
import boutiqueCorner from '../assets/properties/boutique-corner.jpg'
import logisticsCenterS3 from '../assets/properties/logistics-center-s3.jpg'
import escalonSkySuite from '../assets/properties/escalon-sky-suite.jpg'
import cuscatlanBusinessPlaza from '../assets/properties/cuscatlan-business-plaza.jpg'
import santaAnaComercial from '../assets/properties/santa-ana-comercial.jpg'
import sanMiguelBodegaExpress from '../assets/properties/san-miguel-bodega-express.jpg'

export const CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'retail', label: 'Retail Space' },
    { id: 'office', label: 'Office' },
    { id: 'plaza', label: 'Plaza' },
    { id: 'warehouse', label: 'Warehouse' },
]
export const DEMO_OWNER_ID = 'owner-demo'

export const PROPERTIES = [
    {
        id: 1,
        title: 'Plaza Las Ramblas',
        category: 'plaza',
        city: 'Santa Tecla, La Libertad',
        price: 850,
        area: 120,
        feature: { icon: 'bi-p-square', label: '4 Parking spots' },
        image: plazaLasRamblas,
        ownerId: 'owner-market-1',
        ownerName: 'Roberto Meléndez',
    },
    {
        id: 2,
        title: 'Edificio Avante',
        category: 'office',
        city: 'San Benito, San Salvador',
        price: 1200,
        area: 340,
        feature: { icon: 'bi-building', label: 'Floor 4' },
        image: edificioAvante,
        ownerId: DEMO_OWNER_ID,
        ownerName: 'Demo Owner',
    },
    {
        id: 3,
        title: 'Centro Corporativo Roma',
        category: 'office',
        city: 'Zona Rosa, San Salvador',
        price: 950,
        area: 210,
        feature: { icon: 'bi-shield-check', label: '24/7 Security' },
        image: centroCorporativoRoma,
        ownerId: 'owner-market-2',
        ownerName: 'Ana Lissette Portillo',
    },
    {
        id: 4,
        title: 'Boutique Corner',
        category: 'retail',
        city: 'Antiguo Cuscatlán, La Libertad',
        price: 450,
        area: 45,
        feature: { icon: 'bi-snow', label: 'AC Ready' },
        image: boutiqueCorner,
        ownerId: DEMO_OWNER_ID,
        ownerName: 'Demo Owner',
    },
    {
        id: 5,
        title: 'Logistics Center S3',
        category: 'warehouse',
        city: 'Soyapango, San Salvador',
        price: 1100,
        area: 580,
        feature: { icon: 'bi-box-seam', label: 'Loading dock' },
        image: logisticsCenterS3,
        ownerId: DEMO_OWNER_ID,
        ownerName: 'Demo Owner',
    },
    {
        id: 6,
        title: 'Escalón Sky Suite',
        category: 'retail',
        city: 'Colonia Escalón, San Salvador',
        price: 750,
        area: 88,
        feature: { icon: 'bi-router', label: 'Fiber Optic' },
        image: escalonSkySuite,
        ownerId: 'owner-market-3',
        ownerName: 'Jorge Alberto Quintanilla',
    },
    {
        id: 7,
        title: 'Cuscatlán Business Plaza',
        category: 'plaza',
        city: 'Antiguo Cuscatlán, La Libertad',
        price: 990,
        area: 260,
        feature: { icon: 'bi-p-square', label: '6 Parking spots' },
        image: cuscatlanBusinessPlaza,
        ownerId: 'owner-market-1',
        ownerName: 'Roberto Meléndez',
    },
    {
        id: 8,
        title: 'Santa Ana Comercial',
        category: 'retail',
        city: 'Santa Ana Centro',
        price: 520,
        area: 96,
        feature: { icon: 'bi-signpost-2', label: 'Corner lot' },
        image: santaAnaComercial,
        ownerId: 'owner-market-4',
        ownerName: 'Cecilia Hernández',
    },
    {
        id: 9,
        title: 'San Miguel Bodega Express',
        category: 'warehouse',
        city: 'San Miguel Centro',
        price: 890,
        area: 410,
        feature: { icon: 'bi-truck', label: 'Truck access' },
        image: sanMiguelBodegaExpress,
        ownerId: 'owner-market-5',
        ownerName: 'Douglas Iraheta',
    },
]
