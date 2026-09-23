import React from 'react';

interface ConfirmModalProps {
    open: boolean;
    title: string;
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
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="confirm-modal-title">{title}</h3>
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
