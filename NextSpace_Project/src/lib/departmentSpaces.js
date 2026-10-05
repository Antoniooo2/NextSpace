import { supabase } from './supabaseClient'

export function departmentKey(name) {
    return String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
}

export async function loadDepartmentCounts() {
    try {
        const { data, error } = await supabase.rpc('landing_department_counts')
        if (error || !Array.isArray(data)) return null
        const counts = new Map()
        for (const row of data) {
            const key = departmentKey(row.department)
            const spaces = Number(row.spaces)
            if (key && spaces > 0) counts.set(key, (counts.get(key) || 0) + spaces)
        }
        return counts.size ? counts : null
    } catch {
        return null
    }
}
