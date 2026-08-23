export default function ComingSoon({ icon, title, description }) {
    return (
        <div className="ns-empty-state ns-coming-soon">
            <i className={`bi ${icon}`}></i>
            <h3>{title}</h3>
            <p>{description}</p>
        </div>
    )
}
