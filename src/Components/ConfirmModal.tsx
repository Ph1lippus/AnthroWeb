import React from 'react';

interface ConfirmModalProps {
    open: boolean;
    title: string;
    /** One line on the consequence, for anything destructive. */
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    open,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    busy = false,
    onConfirm,
    onCancel,
}) => {
    if (!open) return null;

    return (
        <div className="import-modal-overlay" onClick={() => { if (!busy) onCancel(); }}>
            <div
                className="import-modal-card delete-modal-card confirm-modal-card"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="confirm-modal-title">{title}</h3>
                {description && <p className="confirm-modal-description">{description}</p>}
                <div className="flex gap-2 justify-center mt-4">
                    <button
                        type="button"
                        onClick={() => { if (!busy) onCancel(); }}
                        className="btn-form-cancel"
                        disabled={busy}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={danger ? 'btn-form-submit btn-form-submit--danger' : 'btn-form-submit'}
                        disabled={busy}
                    >
                        {busy ? 'Working...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
