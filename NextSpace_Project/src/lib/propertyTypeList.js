// Kept free of imports on purpose: api/advisor.js (a Node serverless
// function) imports this file, so it must not pull in i18n or anything
// browser-only. The rest of the app gets it through propertyTypes.js.
export const PROPERTY_TYPES = [
    'Café/Restaurant',
    'Store/Boutique',
    'Beauty Salon',
    'Pharmacy/Healthcare',
    'Other',
]
