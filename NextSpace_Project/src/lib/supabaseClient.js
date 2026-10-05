import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
    // This file is imported eagerly at the top of the component tree (via
    // LoginForm/SignUpForm), so a throw here happens during module evaluation,
    // before React ever renders anything. React error boundaries cannot catch
    // that, and the browser's own error overlay may not be visible in every
    // environment -- so write directly to the DOM as a fallback that does not
    // depend on the console or dev-server tooling being reachable.
    const missing = [
        !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
        !supabaseKey ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : null,
    ]
        .filter(Boolean)
        .join(', ')

    document.body.innerHTML =
        '<div style="font-family: sans-serif; max-width: 40rem; margin: 3rem auto; padding: 1.5rem; ' +
        'border: 1px solid #f5c2c7; border-radius: 8px; background: #f8d7da; color: #58151c;">' +
        '<h1 style="font-size: 1.25rem; margin: 0 0 0.5rem;">Configuration error</h1>' +
        '<p style="margin: 0;">Missing environment variable(s): ' + missing + '. ' +
        'Set them in .env (or .env.local) and restart the dev server.</p>' +
        '</div>'

    throw new Error('Missing Supabase configuration: ' + missing)
}

export const supabase = createClient(supabaseUrl, supabaseKey)