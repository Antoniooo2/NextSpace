import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { describeSupabaseError } from '../components/dashboard/NewPropertyModal'
import { PROPERTY_PHOTO_EMBED, withCoverPhoto } from '../lib/propertyPhotos'

// Shared between OwnerHome.jsx (full manage view) and ProfileView.jsx (preview section)
// so both read the owner's own add_business rows the same way.
export function useOwnerProperties(user) {
    const [ownerDui, setOwnerDui] = useState(null)
    const [properties, setProperties] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const reload = useCallback(
        async (dui) => {
            const targetDui = dui || ownerDui
            if (!targetDui) return

            const { data, error: fetchError } = await supabase
                .from('add_business')
                .select(`*, ${PROPERTY_PHOTO_EMBED}`)
                .eq('owner_id', targetDui)
                .order('registration_date', { ascending: false })

            if (fetchError) {
                setError(describeSupabaseError(fetchError))
                return
            }

            setProperties((data || []).map(withCoverPhoto))
        },
        [ownerDui]
    )

    useEffect(() => {
        let cancelled = false

        if (!user?.id) {
            setProperties([])
            setLoading(false)
            return undefined
        }

        const init = async () => {
            setLoading(true)
            setError('')

            const { data: userRow, error: userError } = await supabase
                .from('users')
                .select('dui')
                .eq('id_supabase_auth', user.id)
                .single()

            if (cancelled) return

            if (userError || !userRow) {
                setError("We couldn't find your account record. Please contact support.")
                setLoading(false)
                return
            }

            setOwnerDui(userRow.dui)
            await reload(userRow.dui)

            if (!cancelled) setLoading(false)
        }

        init()

        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])

    return { ownerDui, properties, setProperties, loading, error, reload }
}
