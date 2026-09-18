import BusinessAdvisor from './BusinessAdvisor'
import OwnerAdvisor from './OwnerAdvisor'
import './advisor.css'

export default function AdvisorRouter({ accountType, onViewProperty, seed, onSeedConsumed }) {
    if (accountType === 'property-owner') {
        return <OwnerAdvisor seed={seed} onSeedConsumed={onSeedConsumed} />
    }

    return (
        <BusinessAdvisor
            onViewProperty={onViewProperty}
            seed={seed}
            onSeedConsumed={onSeedConsumed}
        />
    )
}
