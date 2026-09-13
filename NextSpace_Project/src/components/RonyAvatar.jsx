import { useId, useMemo } from 'react'
import ronyAvatarSource from '../assets/rony-avatar.svg?raw'

const SOURCE_CLIP_ID = 'ronyHairClip'

export default function RonyAvatar({ size = 32 }) {
    const reactId = useId()
    const clipId = 'ronyHairClip-' + reactId.replace(/:/g, '')

    const markup = useMemo(
        () => ronyAvatarSource.split(SOURCE_CLIP_ID).join(clipId),
        [clipId]
    )

    return (
        <span
            style={{ display: 'inline-block', width: size, height: size, lineHeight: 0 }}
            dangerouslySetInnerHTML={{ __html: markup }}
        />
    )
}
