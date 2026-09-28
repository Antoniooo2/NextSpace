// Shared by NewPropertyModal (owner picks service ids to save) and PropertyDetailPage
// (business view reads back the service names) — both read business_services off an
// add_business row, just embedded differently.
export const PROPERTY_SERVICE_IDS_EMBED = 'business_services(service_id)'
export const PROPERTY_SERVICES_FULL_EMBED = 'business_services(service_id, services(service_id, service_name))'
export const PROPERTY_SERVICE_NAMES_EMBED = 'business_services(services(service_id, service_name))'

export function withServiceIds(row) {
    return { ...row, service_ids: (row.business_services || []).map((bs) => bs.service_id) }
}

export function withServiceNames(row) {
    return {
        ...row,
        service_names: (row.business_services || [])
            .map((bs) => bs.services?.service_name)
            .filter(Boolean),
    }
}

// Both ids (for filters/forms) and names (for display) from the full embed.
export function withServices(row) {
    const list = (row.business_services || []).filter((bs) => bs.service_id != null)
    return {
        ...row,
        service_ids: list.map((bs) => bs.service_id),
        service_names: list.map((bs) => bs.services?.service_name).filter(Boolean),
    }
}
