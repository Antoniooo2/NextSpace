import ComingSoon from '../ComingSoon'
import BusinessAdvisor from './BusinessAdvisor'
import './advisor.css'

export default function AdvisorRouter({ accountType }) {
    if (accountType === 'property-owner') {
        return (
            <ComingSoon
                icon="bi-stars"
                title="AI Advisor"
                description="Rony will review your portfolio and tell you what needs attention first. Coming soon."
            />
        )
    }

    return <BusinessAdvisor />
}
