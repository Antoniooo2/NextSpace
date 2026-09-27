import BusinessAdvisor from './BusinessAdvisor'
import OwnerAdvisor from './OwnerAdvisor'
import './advisor.css'

export default function AdvisorRouter({ accountType, onViewProperty, onNavigate, seed, onSeedConsumed, compact = false }) {
    if (accountType === 'property-owner') {
        return <OwnerAdvisor seed={seed} onSeedConsumed={onSeedConsumed} compact={compact} />
    }

    return (
        <BusinessAdvisor
            onViewProperty={onViewProperty}
            onNavigate={onNavigate}
            seed={seed}
            onSeedConsumed={onSeedConsumed}
            compact={compact}
        />
    )
}
