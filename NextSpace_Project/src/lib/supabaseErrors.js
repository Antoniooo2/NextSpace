export function describeSupabaseError(error) {
    if (!error) return 'Something went wrong. Please try again.'
    if (error.code === '23514') {
        return 'One of the values you entered is not allowed by the database (check the property type, availability, or size/rent values).'
    }
    if (error.code === '42501') {
        return "You don't have permission to perform this action on this property."
    }
    const message = error.message || ''
    if (message.toLowerCase().includes('fetch') || message.toLowerCase().includes('network')) {
        return 'Could not reach the server. Check your internet connection and try again.'
    }
    return message || 'Something went wrong. Please try again.'
}
