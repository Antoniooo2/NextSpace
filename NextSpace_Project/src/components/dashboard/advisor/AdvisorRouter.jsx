import BusinessAdvisor from './BusinessAdvisor'
import OwnerAdvisor from './OwnerAdvisor'
import './advisor.css'

export default function AdvisorRouter({ accountType, firstName, onViewProperty, onNavigate, seed, onSeedConsumed, compact = false }) {
    if (accountType === 'property-owner') {
        return (
            <OwnerAdvisor firstName={firstName} onNavigate={onNavigate} seed={seed} onSeedConsumed={onSeedConsumed} compact={compact} />
        )
    }

    return (
        <BusinessAdvisor
            firstName={firstName}
            onViewProperty={onViewProperty}
            onNavigate={onNavigate}
            seed={seed}
            onSeedConsumed={onSeedConsumed}
            compact={compact}
        />
    )
}
