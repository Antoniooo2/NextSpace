// Shared by every screen that lists add_business rows and needs their cover photo
// (business_photos is a 1:many table, but this app only shows a single photo per listing).
export const PROPERTY_PHOTO_EMBED = 'business_photos(photo_url, uploaded_at)'

export function withCoverPhoto(row) {
    const photos = row.business_photos || []
    const cover = [...photos].sort((a, b) => (a.uploaded_at || '').localeCompare(b.uploaded_at || ''))[0]
    return { ...row, photo_url: cover?.photo_url || null }
}
