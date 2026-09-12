import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

export const config = {
    api: { bodyParser: false },
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const WOMPI_API_SECRET = process.env.WOMPI_CLIENT_SECRET

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => { data += chunk })
        req.on('end', () => resolve(data))
        req.on('error', reject)
    })
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).end()
        return
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WOMPI_API_SECRET) {
        res.status(500).end()
        return
    }

    const rawBody = await readRawBody(req)

    const signature = req.headers['wompi_hash'] || req.headers['wompi-hash']
    const expected = crypto.createHmac('sha256', WOMPI_API_SECRET).update(rawBody, 'utf8').digest('hex')

    if (!signature || signature.toLowerCase() !== expected.toLowerCase()) {
        res.status(401).json({ error: 'Invalid signature.' })
        return
    }

    let payload
    try {
        payload = JSON.parse(rawBody)
    } catch {
        res.status(400).json({ error: 'Invalid JSON.' })
        return
    }

    const reference = payload?.EnlacePago?.IdentificadorEnlaceComercio || ''
    const match = /^payment-(\d+)$/.exec(reference)
    const isApproved = payload?.ResultadoTransaccion === 'ExitosaAprobada'

    if (!match || !isApproved) {
        res.status(200).json({ received: true, updated: false })
        return
    }

    const paymentId = Number(match[1])
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { error } = await admin
        .from('payment')
        .update({
            status: 'Paid',
            payment_method: 'Credit Card',
            wompi_transaction_id: payload.IdTransaccion || null,
            wompi_link_id: payload?.EnlacePago?.Id ?? null,
        })
        .eq('payment_id', paymentId)
        .in('status', ['Pending', 'Late'])

    if (error) {
        res.status(500).json({ received: true, updated: false })
        return
    }

    res.status(200).json({ received: true, updated: true })
}
