import ContractsBoard from './contracts/ContractsBoard'

export default function OwnerContracts(props) {
    return <ContractsBoard {...props} viewer="owner" />
}
