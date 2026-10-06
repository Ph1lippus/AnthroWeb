import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import ConfirmModal from '../Components/ConfirmModal';

export interface ConfirmOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

interface ConfirmDialogState {
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    danger: boolean;
    busy: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

interface ConfirmModalContextValue {
    showConfirm: (options: ConfirmOptions) => void;
    closeConfirm: () => void;
    confirm: ConfirmDialogState;
}

const EMPTY_DIALOG: ConfirmDialogState = {
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    danger: false,
    busy: false,
    onConfirm: () => {},
    onCancel: () => {},
};

const ConfirmModalContext = createContext<ConfirmModalContextValue | null>(null);

/**
 * One confirmation dialog for the whole app. A single `ConfirmModal` is rendered
 * at the top of the app shell; every page opens it through `showConfirm`
 * instead of each mounting its own `ConfirmModal`.
 */
export const ConfirmModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [open, setOpen] = useState(false);
    const [dialog, setDialog] = useState<ConfirmDialogState>(EMPTY_DIALOG);

    const showConfirm = useCallback((options: ConfirmOptions): void => {
        setOpen(true);
        setDialog({
            title: options.title,
            description: options.description ?? '',
            confirmLabel: options.confirmLabel ?? 'Confirm',
            cancelLabel: options.cancelLabel ?? 'Cancel',
            danger: Boolean(options.danger),
            busy: false,
            onConfirm: options.onConfirm,
            onCancel: options.onCancel,
        });
    }, []);

    const closeConfirm = useCallback((): void => {
        setOpen(false);
        setDialog(EMPTY_DIALOG);
    }, []);

    const handleConfirm = useCallback(async (): Promise<void> => {
        // For async handlers, hold the modal open (and "Working…") until the
        // request settles, so a pending delete can't vanish behind the next
        // paint. Synchronous handlers close immediately.
        const result = dialog.onConfirm();
        if (result instanceof Promise) {
            setDialog((prev) => ({ ...prev, busy: true }));
            try {
                await result;
            } finally {
                setOpen(false);
                setDialog(EMPTY_DIALOG);
            }
        } else {
            setOpen(false);
            setDialog(EMPTY_DIALOG);
        }
    }, [dialog]);

    const value = useMemo<ConfirmModalContextValue>(
        () => ({ showConfirm, closeConfirm, confirm: dialog }),
        [showConfirm, closeConfirm, dialog],
    );

    return (
        <ConfirmModalContext.Provider value={value}>
            {children}
            <ConfirmModal
                open={open && (dialog.title !== '' || dialog.description !== '')}
                title={dialog.title}
                description={dialog.description}
                confirmLabel={dialog.confirmLabel}
                cancelLabel={dialog.cancelLabel}
                danger={dialog.danger}
                busy={dialog.busy}
                onConfirm={handleConfirm}
                onCancel={dialog.onCancel}
            />
        </ConfirmModalContext.Provider>
    );
};

// This hook intentionally shares the provider's context from this module.
// eslint-disable-next-line react-refresh/only-export-components
export const useConfirmModal = (): ConfirmModalContextValue => {
    const ctx = useContext(ConfirmModalContext);
    if (!ctx) {
        throw new Error('useConfirmModal must be used inside a ConfirmModalProvider');
    }
    return ctx;
};
