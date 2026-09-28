// Shared by every screen that lists add_business rows and needs their photos.
// business_photos is 1:many (up to 6 per space); sort_order 0 is the cover.
export const PROPERTY_PHOTO_EMBED = 'business_photos(photo_id, photo_url, uploaded_at, sort_order)'

export function sortPhotos(photos = []) {
    return [...photos].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.uploaded_at || '').localeCompare(b.uploaded_at || '')
    )
}

export function withCoverPhoto(row) {
    const photos = sortPhotos(row.business_photos || [])
    return { ...row, photos, photo_url: photos[0]?.photo_url || null }
}
