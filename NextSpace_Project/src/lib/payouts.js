// Money NextSpace transfers to owners: the rent tenants paid through Wompi,
// minus the NextSpace fee. Transfers are recorded by NextSpace staff (see
// supabase/migrations/*_platform_fee_and_payouts.sql); owners read them here
// and keep the bank account they want to be paid into.
import { supabase } from './supabaseClient'
import { describeSupabaseError } from './supabaseErrors'
import i18n from '../i18n'
import { accountTypeLabel } from './displayValues'
import { BULLETS } from './symbols'

export const ACCOUNT_TYPES = [
    {
        id: 'Savings',
        get label() {
            return accountTypeLabel('Savings')
        },
    },
    {
        id: 'Checking',
        get label() {
            return accountTypeLabel('Checking')
        },
    },
]

export async function loadPayouts() {
    const { data, error } = await supabase.from('owner_payout').select('*').order('sent_at', { ascending: false })
    if (error) throw new Error(describeSupabaseError(error))
    return data || []
}

export async function loadPayoutAccount() {
    const { data, error } = await supabase.from('payout_account').select('*').maybeSingle()
    if (error) throw new Error(describeSupabaseError(error))
    return data || null
}

export async function savePayoutAccount({ ownerDui, holderName, bankName, accountType, accountNumber }) {
    const row = {
        owner_dui: ownerDui,
        holder_name: holderName.trim(),
        bank_name: bankName.trim(),
        account_type: accountType,
        account_number: accountNumber.replace(/\s+/g, ''),
    }
    const { data, error } = await supabase.from('payout_account').upsert(row, { onConflict: 'owner_dui' }).select().single()
    if (error) throw new Error(describeSupabaseError(error))
    return data
}

// "•••• 5678"
export function maskAccountNumber(number) {
    const digits = String(number || '').replace(/\D/g, '')
    return digits.length > 4 ? `${BULLETS} ${digits.slice(-4)}` : digits
}

export function validatePayoutAccount({ holderName, bankName, accountNumber }) {
    const errors = {}
    if (holderName.trim().length < 3) errors.holderName = i18n.t('payouts.errors.holderName')
    if (bankName.trim().length < 2) errors.bankName = i18n.t('payouts.errors.bankName')
    const cleaned = accountNumber.replace(/\s+/g, '')
    if (!/^[0-9][0-9-]{4,28}[0-9]$/.test(cleaned)) errors.accountNumber = i18n.t('payouts.errors.accountNumber')
    return errors
}

// Banks operating in El Salvador, for the picker. Anything else can be typed.
export const SV_BANKS = [
    'Banco Agrícola',
    'Banco Cuscatlán',
    'Banco Davivienda',
    'Banco de América Central (BAC)',
    'Banco Hipotecario',
    'Banco Promerica',
    'Banco Atlántida',
    'Banco Azul',
    'Banco Industrial',
    'Banco de Fomento Agropecuario',
]
