export default function ConfirmDialog({
    icon = 'bi-exclamation-triangle',
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
}) {
    return (
        <div className="ns-modal-backdrop" onClick={onCancel}>
            <div className="ns-modal ns-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ns-confirm-icon">
                    <i className={`bi ${icon}`}></i>
                </div>
                <h3 className="ns-confirm-title">{title}</h3>
                <p className="ns-confirm-desc">{description}</p>
                <div className="ns-confirm-actions">
                    <button type="button" className="ns-confirm-btn-cancel" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button type="button" className="ns-confirm-btn-danger" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}