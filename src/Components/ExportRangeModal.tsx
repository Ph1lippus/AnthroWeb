import React, { useState } from 'react';
import type { ExportRangeDays } from '../services/exportService';
import { exportAllData } from '../services/exportService';

interface ExportRangeModalProps {
    open: boolean;
    onClose: () => void;
}

const OPTIONS: { label: string; days: ExportRangeDays }[] = [
    { label: '7 Days', days: 7 },
    { label: '14 Days', days: 14 },
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: 'Forever', days: null },
];

const ExportRangeModal: React.FC<ExportRangeModalProps> = ({ open, onClose }) => {
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const handleExport = async (days: ExportRangeDays) => {
        setBusy(true);
        setError(null);
        setProgress('Starting export…');
        try {
            await exportAllData(days, p => {
                setProgress(`Exporting ${p.done}/${p.total}: ${p.current}`);
            });
            setProgress('Done');
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="import-modal-overlay" onClick={() => { if (!busy) onClose(); }}>
            <div
                className="import-modal-card delete-modal-card confirm-modal-card"
                role="dialog"
                aria-modal="true"
                aria-label="Export data"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="confirm-modal-title">Export data</h3>
                <p className="confirm-modal-description">
                    Choose how far back to include date-based records. Settings and reference data are always included in full.
                </p>
                <div className="flex flex-col gap-2 mt-4">
                    {OPTIONS.map(opt => (
                        <button
                            key={String(opt.days)}
                            type="button"
                            className="btn-form-submit"
                            disabled={busy}
                            onClick={() => { void handleExport(opt.days); }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                {progress && busy && (
                    <p className="confirm-modal-description mt-3">{progress}</p>
                )}
                {error && (
                    <p className="confirm-modal-description mt-3" style={{ color: 'var(--color-danger, #ff5555)' }}>
                        {error}
                    </p>
                )}
                <div className="flex gap-2 justify-center mt-4">
                    <button
                        type="button"
                        onClick={() => { if (!busy) onClose(); }}
                        className="btn-form-cancel"
                        disabled={busy}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExportRangeModal;