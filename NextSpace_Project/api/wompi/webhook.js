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
        const chunks = []
        req.on('data', (chunk) => { chunks.push(chunk) })
        req.on('end', () => resolve(Buffer.concat(chunks)))
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
    const expected = crypto.createHmac('sha256', WOMPI_API_SECRET).update(rawBody).digest('hex')

    const expectedBuffer = Buffer.from(expected, 'hex')
    const signatureBuffer = signature ? Buffer.from(signature.toLowerCase(), 'hex') : null
    const isValidSignature =
        signatureBuffer &&
        signatureBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(signatureBuffer, expectedBuffer)

    if (!isValidSignature) {
        res.status(401).json({ error: 'Invalid signature.' })
        return
    }

    let payload
    try {
        payload = JSON.parse(rawBody.toString('utf8'))
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

    const { data: updatedRows, error } = await admin
        .from('payment')
        .update({
            status: 'Paid',
            payment_method: 'Credit Card',
            wompi_transaction_id: payload.IdTransaccion || null,
            wompi_link_id: payload?.EnlacePago?.Id ?? null,
        })
        .eq('payment_id', paymentId)
        .in('status', ['Pending', 'Late'])
        .select('payment_id')

    if (error) {
        res.status(500).json({ received: true, updated: false })
        return
    }

    // The .in('status', ['Pending', 'Late']) above makes this update conditional: a
    // retried webhook call for an already-Paid payment matches zero rows here.
    const didTransitionToPaid = (updatedRows?.length ?? 0) > 0

    if (!didTransitionToPaid) {
        // Zero rows updated usually just means a retried delivery of the same transaction
        // for an already-Paid payment -- expected and silent. But if the incoming
        // transaction id doesn't match the one already stored, this looks like a second
        // real approved transaction landing on the same payment reference (e.g. two Wompi
        // links generated for the same payment_id after a retried checkout). The
        // idempotency guard above would otherwise swallow that silently, so log it loudly
        // for manual investigation instead.
        const incomingTransactionId = payload.IdTransaccion || null
        if (incomingTransactionId) {
            const { data: currentPayment } = await admin
                .from('payment')
                .select('status, wompi_transaction_id')
                .eq('payment_id', paymentId)
                .maybeSingle()

            if (
                currentPayment?.status === 'Paid' &&
                currentPayment.wompi_transaction_id &&
                currentPayment.wompi_transaction_id !== incomingTransactionId
            ) {
                console.error(
                    `Wompi webhook: payment ${paymentId} received a second approved transaction ` +
                        `(${incomingTransactionId}) after already being paid by transaction ` +
                        `${currentPayment.wompi_transaction_id}. Possible duplicate charge -- investigate.`
                )
            }
        }
    }

    // Claiming "notify the owner" and sending the notification happen in one DB
    // transaction (claim_and_notify_payment), deliberately separate from the status
    // transition above. If this process dies after the status update commits but before
    // this call completes, notified_at is still null, so the next webhook retry (which
    // will find the payment already Paid and skip the block above) still reaches this
    // call and can send the notification -- claiming and sending can no longer succeed
    // and fail independently of each other.
    const { error: notifyError } = await admin.rpc('claim_and_notify_payment', { p_payment_id: paymentId })
    if (notifyError) {
        console.error('Wompi webhook: failed to claim/send payment notification', notifyError)
    }

    res.status(200).json({ received: true, updated: didTransitionToPaid })
}
