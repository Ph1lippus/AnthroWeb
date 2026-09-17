import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { checkForUpdate, downloadAndInstall, isCapacitorApp } from '../services/updateService';
import type { UpdateInfo } from '../services/updateService';

const UpdateModal: React.FC = () => {
    const [update, setUpdate] = useState<UpdateInfo | null>(null);
    const [current, setCurrent] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!isCapacitorApp()) return;
            const result = await checkForUpdate();
            if (cancelled || !result) return;
            setUpdate(result.update);
            setCurrent(result.current);
        };
        run();
        const resumeListener = App.addListener('resume', () => {
            run();
        });
        return () => {
            cancelled = true;
            resumeListener.then(listener => listener.remove());
        };
    }, []);

    const handleInstall = async () => {
        if (!update) return;
        setDownloading(true);
        setError(null);
        try {
            await downloadAndInstall(update.url);
            setUpdate(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed. Please try again.');
            setDownloading(false);
        }
    };

    if (!update) return null;

    return (
        <div className="update-modal-overlay">
            <div className="update-modal" role="dialog" aria-modal="true" aria-label="Update available">
                <div className="update-modal-header">
                    <h3 className="update-modal-title">Update Available</h3>
                </div>
                <div className="update-modal-body">
                    <p className="update-modal-text">
                        A new version <strong>v{update.version}</strong> is available
                        {current ? <> (you're on <strong>v{current}</strong>)</> : null}.
                    </p>
                    {update.notes && (
                        <div className="update-modal-notes">
                            <p className="update-modal-notes-label">What's new:</p>
                            <pre className="update-modal-notes-body">{update.notes}</pre>
                        </div>
                    )}
                    {error && <p className="update-modal-error">{error}</p>}
                </div>
                <div className="update-modal-actions">
                    <button className="update-modal-btn update-modal-btn-cancel" onClick={() => setUpdate(null)} disabled={downloading}>
                        Later
                    </button>
                    <button className="update-modal-btn update-modal-btn-confirm" onClick={handleInstall} disabled={downloading}>
                        {downloading ? 'Downloading...' : 'Update & Install'}
                    </button>
                </div>
                <p className="update-modal-hint">The APK will download and open the Android installer automatically.</p>
            </div>
        </div>
    );
};

export default UpdateModal;
