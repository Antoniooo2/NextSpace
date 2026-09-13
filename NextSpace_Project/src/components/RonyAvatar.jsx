import { useId, useMemo } from 'react'
import ronyAvatarSource from '../assets/rony-avatar.svg?raw'

const SOURCE_CLIP_ID = 'ronyHairClip'

export default function RonyAvatar({ size = 32 }) {
    const reactId = useId()
    const clipId = 'ronyHairClip-' + reactId.replace(/:/g, '')

    const markup = useMemo(() => {
        const withUniqueId = ronyAvatarSource.split(SOURCE_CLIP_ID).join(clipId)
        // The source file may hardcode its own width/height (the real asset ships
        // with width="64" height="64"). Strip those on the root svg tag and force
        // it to fill the wrapping span instead, so the size prop below actually
        // controls how big the avatar renders, no matter what the file says.
        return withUniqueId.replace(/<svg([^>]*)>/, (match, attrs) => {
            const withoutSize = attrs.replace(/\s(width|height)="[^"]*"/g, '')
            return `<svg${withoutSize} width="100%" height="100%">`
        })
    }, [clipId])

    return (
        <span
            style={{ display: 'inline-block', width: size, height: size, lineHeight: 0 }}
            dangerouslySetInnerHTML={{ __html: markup }}
        />
    )
}
