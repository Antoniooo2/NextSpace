import BusinessAdvisor from './BusinessAdvisor'
import OwnerAdvisor from './OwnerAdvisor'
import './advisor.css'

export default function AdvisorRouter({ accountType, onViewProperty }) {
    if (accountType === 'property-owner') {
        return <OwnerAdvisor />
    }

    return <BusinessAdvisor onViewProperty={onViewProperty} />
}
