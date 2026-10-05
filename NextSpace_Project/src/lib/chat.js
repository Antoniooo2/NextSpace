import { supabase } from './supabaseClient'

export const MESSAGE_MAX_LENGTH = 2000

const MESSAGE_COLUMNS = 'id, conversation_id, sender_dui, body, created_at, read_at'

// The tenant's conversation about a space: reuses the existing one, otherwise
// opens it. Only property_id is sent; the server fills in the owner and the
// tenant (and refuses your own space, owner accounts and unavailable spaces).
export async function openConversation(propertyId, tenantDui) {
    const find = () =>
        supabase
            .from('conversations')
            .select('id')
            .eq('property_id', propertyId)
            .eq('tenant_dui', tenantDui)
            .maybeSingle()

    const existing = await find()
    if (existing.data) return { conversationId: existing.data.id, error: null }

    const { data, error } = await supabase.from('conversations').insert({ property_id: propertyId }).select('id').single()
    if (!error) return { conversationId: data.id, error: null }

    // Opened at the same time from another tab.
    if (error.code === '23505') {
        const again = await find()
        if (again.data) return { conversationId: again.data.id, error: null }
    }
    return { conversationId: null, error }
}

// Inbox rows: space name, the other person's name, last message and unread count.
export async function listConversations() {
    const { data, error } = await supabase.rpc('my_conversations')
    return { conversations: data || [], error }
}

// The latest messages of a conversation, oldest first.
export async function loadMessages(conversationId, limit = 300) {
    const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
    return { messages: (data || []).reverse(), error }
}

// sender_dui defaults to the caller on the server.
export async function sendMessage(conversationId, body) {
    const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, body })
        .select(MESSAGE_COLUMNS)
        .single()
    return { message: data, error }
}

// The server stamps read_at with its own clock and never moves it back.
export async function markConversationRead(conversationId, myDui) {
    const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .neq('sender_dui', myDui)
        .is('read_at', null)
    return { error }
}

// Messages from other people this user hasn't opened yet (RLS keeps it to
// their own conversations).
export async function countUnreadMessages(myDui) {
    const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .neq('sender_dui', myDui)
        .is('read_at', null)
    return { count: count || 0, error }
}
