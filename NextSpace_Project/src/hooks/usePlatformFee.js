import { useEffect, useState } from 'react'
import { DEFAULT_COMMISSION_RATE, loadCommissionRate } from '../lib/platformFee'

// The current NextSpace fee rate (0.05 = 5%). Starts at the default and
// updates once the real rate is read.
export default function usePlatformFee() {
    const [rate, setRate] = useState(DEFAULT_COMMISSION_RATE)

    useEffect(() => {
        let cancelled = false
        loadCommissionRate().then((r) => {
            if (!cancelled) setRate(r)
        })
        return () => {
            cancelled = true
        }
    }, [])

    return rate
}
