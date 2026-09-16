import { supabase } from './supabaseClient'

export async function createNotification({ recipientDui, senderDui, process, title, description, contractId }) {
    const { error } = await supabase.from('notifications').insert({
        recipient_dui: recipientDui,
        sender_dui: senderDui,
        process,
        title,
        description,
        contract_id: contractId,
    })
    return { error }
}
