import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const WOMPI_CLIENT_ID = process.env.WOMPI_CLIENT_ID
const WOMPI_CLIENT_SECRET = process.env.WOMPI_CLIENT_SECRET

const CONTRACT_EMBED = 'contract_id, monthly_rent, tenant_dui, add_business!contract_property_id_fkey(property_name)'

let cachedToken = null
let cachedTokenExpiry = 0

async function getWompiAccessToken() {
    const now = Date.now()
    if (cachedToken && now < cachedTokenExpiry) return cachedToken

    const response = await fetch('https://id.wompi.sv/connect/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: WOMPI_CLIENT_ID,
            client_secret: WOMPI_CLIENT_SECRET,
            audience: 'wompi_api',
        }),
    })

    if (!response.ok) {
        throw new Error(`Wompi auth failed: ${response.status} ${await response.text()}`)
    }

    const data = await response.json()
    cachedToken = data.access_token
    cachedTokenExpiry = now + (data.expires_in - 60) * 1000
    return cachedToken
}

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const host = req.headers['x-forwarded-host'] || req.headers.host
    return `${proto}://${host}`
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !WOMPI_CLIENT_ID || !WOMPI_CLIENT_SECRET) {
        res.status(500).json({ error: 'Server is missing Wompi/Supabase configuration.' })
        return
    }

    const authHeader = req.headers.authorization || ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!accessToken) {
        res.status(401).json({ error: 'Missing authorization token.' })
        return
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken)
    if (userError || !user) {
        res.status(401).json({ error: 'Invalid session.' })
        return
    }

    const body = req.body || {}
    const contractId = body.contractId ? Number(body.contractId) : null
    const paymentId = body.paymentId ? Number(body.paymentId) : null

    if (!contractId && !paymentId) {
        res.status(400).json({ error: 'contractId or paymentId is required.' })
        return
    }

    let payment

    if (paymentId) {
        const { data, error } = await userClient
            .from('payment')
            .select(`payment_id, contract_id, amount, status, contract(${CONTRACT_EMBED})`)
            .eq('payment_id', paymentId)
            .single()

        if (error || !data) {
            res.status(404).json({ error: 'Payment not found.' })
            return
        }
        if (data.status !== 'Pending' && data.status !== 'Late') {
            res.status(409).json({ error: 'This payment is not pending.' })
            return
        }
        payment = data
    } else {
        const { data: contract, error: contractError } = await userClient
            .from('contract')
            .select(CONTRACT_EMBED)
            .eq('contract_id', contractId)
            .single()

        if (contractError || !contract) {
            res.status(404).json({ error: 'Contract not found.' })
            return
        }

        const { data: inserted, error: insertError } = await userClient
            .from('payment')
            .insert({
                contract_id: contract.contract_id,
                payment_date: new Date().toISOString().slice(0, 10),
                amount: contract.monthly_rent,
                payment_method: 'Credit Card',
                status: 'Pending',
            })
            .select('payment_id, contract_id, amount, status')
            .single()

        if (insertError || !inserted) {
            res.status(500).json({ error: 'Could not create a pending payment.' })
            return
        }

        payment = { ...inserted, contract }
    }

    const propertyName = payment.contract?.add_business?.property_name || 'NextSpace rent'
    const baseUrl = getBaseUrl(req)

    let wompiToken
    try {
        wompiToken = await getWompiAccessToken()
    } catch {
        res.status(502).json({ error: 'Could not reach Wompi.' })
        return
    }

    const wompiRes = await fetch('https://api.wompi.sv/EnlacePago', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${wompiToken}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            identificadorEnlaceComercio: `payment-${payment.payment_id}`,
            monto: Number(payment.amount),
            nombreProducto: `Renta - ${propertyName}`,
            formaPago: {
                permitirTarjetaCreditoDebido: true,
            },
            configuracion: {
                urlRedirect: `${baseUrl}/dashboard?section=payments&wompi=return`,
                urlWebhook: `${baseUrl}/api/wompi/webhook`,
                notificarTransaccionCliente: true,
                duracionInterfazIntentoMinutos: 60,
            },
            limitesDeUso: {
                cantidadMaximaPagosExitosos: 1,
            },
        }),
    })

    if (!wompiRes.ok) {
        res.status(502).json({ error: 'Wompi rejected the payment link request.' })
        return
    }

    const link = await wompiRes.json()

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    await adminClient.from('payment').update({ wompi_link_id: link.idEnlace }).eq('payment_id', payment.payment_id)

    res.status(200).json({ url: link.urlEnlace, paymentId: payment.payment_id })
}
