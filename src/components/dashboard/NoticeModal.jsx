export default function NoticeModal({ icon = 'bi-info-circle', title, description, onClose }) {
    return (
        <div className="ns-modal-backdrop" onClick={onClose}>
            <div className="ns-modal ns-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ns-confirm-icon ns-confirm-icon-neutral">
                    <i className={`bi ${icon}`}></i>
                </div>
                <h3 className="ns-confirm-title">{title}</h3>
                <p className="ns-confirm-desc">{description}</p>
                <button type="button" className="ns-submit-btn" onClick={onClose}>
                    Got it
                </button>
            </div>
        </div>
    )
}