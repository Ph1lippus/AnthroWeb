import React, { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import {
    checkForDesktopUpdate,
    checkForUpdate,
    downloadAndInstall,
    getCurrentVersion,
    isCapacitorApp,
    isTauriApp,
} from '../services/updateService';
import type { DesktopUpdate } from '../services/updateService';

interface PendingUpdate {
    version: string;
    notes: string;
    kind: 'android' | 'desktop';
    url?: string;
}

const UpdateModal: React.FC = () => {
    const [update, setUpdate] = useState<PendingUpdate | null>(null);
    const [current, setCurrent] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const desktopUpdate = useRef<DesktopUpdate | null>(null);
    const downloadingRef = useRef(false);
    const modalOpen = useRef(false);

    useEffect(() => {
        let cancelled = false;

        if (!isCapacitorApp() && !isTauriApp()) return;

        const checkAndroid = async () => {
            const result = await checkForUpdate();
            if (cancelled || !result) return;
            modalOpen.current = true;
            setUpdate({ ...result.update, kind: 'android' });
            setCurrent(result.current);
        };

        const checkDesktop = async () => {
            try {
                const result = await checkForDesktopUpdate();
                if (cancelled || !result) return;
                desktopUpdate.current = result;
                modalOpen.current = true;
                setUpdate({ version: result.version, notes: result.notes, kind: 'desktop' });
                setCurrent(await getCurrentVersion());
            } catch {
                // Endpoint unreachable; the manual check on the App page reports it.
            }
        };

        const run = () => {
            if (isTauriApp()) {
                checkDesktop();
            } else {
                checkAndroid();
            }
        };
        run();

        // Desktop apps have no Capacitor resume event, so re-check when the
        // window regains focus (the app can stay open for days).
        const onFocus = () => {
            if (isTauriApp() && !downloadingRef.current && !modalOpen.current) run();
        };
        window.addEventListener('focus', onFocus);

        let resumeListener: Promise<{ remove: () => Promise<void> }> | null = null;
        if (isCapacitorApp()) {
            resumeListener = App.addListener('resume', () => {
                run();
            });
        }

        return () => {
            cancelled = true;
            window.removeEventListener('focus', onFocus);
            resumeListener?.then(listener => listener.remove());
        };
    }, []);

    const handleInstall = async () => {
        if (!update) return;
        downloadingRef.current = true;
        setDownloading(true);
        setProgress(0);
        setError(null);
        try {
            if (update.kind === 'desktop') {
                await desktopUpdate.current?.install(setProgress);
                modalOpen.current = false;
                setUpdate(null);
            } else if (update.url) {
                await downloadAndInstall(update.url);
                modalOpen.current = false;
                setUpdate(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed. Please try again.');
        } finally {
            downloadingRef.current = false;
            setDownloading(false);
        }
    };

    const handleDismiss = async () => {
        if (downloading) return;
        modalOpen.current = false;
        setUpdate(null);
        const pending = desktopUpdate.current;
        desktopUpdate.current = null;
        if (pending) {
            try {
                await pending.close();
            } catch {
                // Already closed or never downloaded; nothing to clean up.
            }
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
                    <button className="update-modal-btn update-modal-btn-cancel" onClick={handleDismiss} disabled={downloading}>
                        Later
                    </button>
                    <button className="update-modal-btn update-modal-btn-confirm" onClick={handleInstall} disabled={downloading}>
                        {downloading
                            ? update.kind === 'desktop'
                                ? `Installing ${progress}%`
                                : 'Downloading...'
                            : 'Update & Install'}
                    </button>
                </div>
                <p className="update-modal-hint">
                    {update.kind === 'desktop'
                        ? 'The update downloads in the background and the app restarts when it is ready.'
                        : 'The APK will download and open the Android installer automatically.'}
                </p>
            </div>
        </div>
    );
};

export default UpdateModal;
