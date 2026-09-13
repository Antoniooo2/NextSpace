import BusinessAdvisor from './BusinessAdvisor'
import OwnerAdvisor from './OwnerAdvisor'
import './advisor.css'

export default function AdvisorRouter({ accountType }) {
    if (accountType === 'property-owner') {
        return <OwnerAdvisor />
    }

    return <BusinessAdvisor />
}
