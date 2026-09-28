// Saved spaces (Profile › Saved). Shared by the Marketplace cards and the
// property detail page so both read and write the same list.
import { supabase } from './supabaseClient'

export async function loadSavedIds(userId) {
    if (!userId) return new Set()
    const { data } = await supabase.from('saved_properties').select('property_id').eq('user_auth_id', userId)
    return new Set((data || []).map((r) => r.property_id))
}

export async function setSaved(userId, propertyId, saved) {
    const { error } = saved
        ? await supabase.from('saved_properties').insert({ user_auth_id: userId, property_id: propertyId })
        : await supabase.from('saved_properties').delete().eq('user_auth_id', userId).eq('property_id', propertyId)
    return !error
}
