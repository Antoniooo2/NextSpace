import { supabase } from '../../../lib/supabaseClient'

// The visual pieces of a Rony answer (see api/advisor.js sanitizeBlocks).
// Stored in the saved payload so a reloaded chat looks the same; older
// messages simply don't have them and show as plain text.
export function blocksFrom(source, fallbackFollowUps = []) {
    return {
        highlights: source?.highlights || [],
        points: source?.points || [],
        links: source?.links || [],
        followUps: source?.followUps?.length ? source.followUps : fallbackFollowUps,
    }
}

export function persistableBlocks(item) {
    return {
        highlights: item.highlights,
        points: item.points,
        links: item.links,
        followUps: item.followUps,
    }
}

// Where each link button leads inside the dashboard.
export function linkHandler(onNavigate) {
    if (!onNavigate) return undefined
    return (link) => {
        if (link.target === 'payments') onNavigate('payments', { contractId: link.contractId ?? null })
        else if (link.target === 'contracts') onNavigate('contracts', { contractId: link.contractId ?? null })
        else if (link.target === 'property' && link.propertyId) onNavigate('home', { propertyId: link.propertyId })
        else onNavigate('home')
    }
}

// "New chat": the saved conversation is removed for good.
export async function clearHistory() {
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: new Error('Not signed in') }
    return supabase.from('advisor_messages').delete().eq('user_auth_id', user.id)
}

// Scrolls the chat so a finished answer is readable from its first line.
export function revealReply(stream, el) {
    if (!stream || !el) return
    const top = Math.max(0, el.offsetTop - 16)
    stream.scrollTo({ top: Math.min(top, stream.scrollHeight), behavior: 'smooth' })
}
