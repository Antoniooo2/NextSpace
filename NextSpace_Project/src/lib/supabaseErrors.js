import i18n from '../i18n'

export function describeSupabaseError(error) {
    if (!error) return i18n.t('common.genericError')
    if (error.code === '23514') {
        return i18n.t('errors.notAllowedValue')
    }
    if (error.code === '42501') {
        return i18n.t('errors.noPermission')
    }
    const message = error.message || ''
    if (message.toLowerCase().includes('fetch') || message.toLowerCase().includes('network')) {
        return i18n.t('errors.network')
    }
    return message || i18n.t('common.genericError')
}

const AUTH_ERRORS = [
    [/missing email or phone|anonymous sign-ins are disabled/i, 'missingFields'],
    [/signup requires a valid password/i, 'weakPassword'],
    [/token has expired or is invalid|otp.*expired/i, 'codeExpired'],
    [/invalid login credentials/i, 'invalidCredentials'],
    [/email not confirmed/i, 'emailNotConfirmed'],
    [/user already registered/i, 'alreadyRegistered'],
    [/password should be at least/i, 'weakPassword'],
    [/unable to validate email address|invalid format/i, 'invalidEmail'],
    [/rate limit|too many requests|security purposes/i, 'tooManyRequests'],
    [/new password should be different/i, 'samePassword'],
    [/auth session missing|session.*expired|token.*expired|invalid.*token/i, 'sessionExpired'],
]

export function describeAuthError(error) {
    const message = error?.message || ''
    const hit = AUTH_ERRORS.find(([pattern]) => pattern.test(message))
    if (hit) return i18n.t(`errors.auth.${hit[1]}`)
    if (message.toLowerCase().includes('fetch') || message.toLowerCase().includes('network')) {
        return i18n.t('errors.network')
    }
    return message || i18n.t('common.genericError')
}
