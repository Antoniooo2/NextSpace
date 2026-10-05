import { useEffect, useMemo, useRef } from 'react'
import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react'

function parseStat(value) {
    const match = /^(\D*)([\d,]+)(\D*)$/.exec(value)
    if (!match) return null
    const [, prefix, digits, suffix] = match
    return {
        prefix,
        suffix,
        target: Number(digits.replace(/,/g, '')),
        grouped: digits.includes(','),
    }
}

export default function CountUp({ value, enabled, className }) {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: '0px 0px -60px 0px' })
    const parsed = useMemo(() => parseStat(value), [value])
    const target = parsed ? parsed.target : 0
    const count = useMotionValue(enabled ? 0 : target)
    const text = useTransform(count, (latest) => {
        if (!parsed) return value
        const rounded = Math.round(latest)
        const digits = parsed.grouped ? rounded.toLocaleString('en-US') : String(rounded)
        return `${parsed.prefix}${digits}${parsed.suffix}`
    })

    useEffect(() => {
        if (!enabled) {
            count.set(target)
            return undefined
        }
        if (!inView) return undefined
        const controls = animate(count, target, { duration: 1.8, ease: [0.16, 1, 0.3, 1] })
        return () => controls.stop()
    }, [enabled, inView, target, count])

    if (!parsed) return <div className={className}>{value}</div>

    return (
        <motion.div ref={ref} className={className}>
            {text}
        </motion.div>
    )
}
