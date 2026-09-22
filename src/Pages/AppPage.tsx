import React, { useEffect, useState } from 'react';
import Title from '../Components/Title';
import { Package, RotateCw, Download, Info, ChevronRight } from 'lucide-react';
import { checkForUpdate, downloadAndInstall, fetchLatestUpdate, getCurrentVersion, isCapacitorApp } from '../services/updateService';
import type { UpdateInfo } from '../services/updateService';

type CheckStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'unavailable';

const AppPage: React.FC = () => {
    const [latestUpdate, setLatestUpdate] = useState<UpdateInfo | null>(null);
    const [checkingUpdate, setCheckingUpdate] = useState(true);
    const [currentVersion, setCurrentVersion] = useState<string | null>(null);
    const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle');
    const [checkedUpdate, setCheckedUpdate] = useState<UpdateInfo | null>(null);
    const [installing, setInstalling] = useState(false);
    const [installError, setInstallError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const [update, current] = await Promise.all([
                fetchLatestUpdate(),
                getCurrentVersion(),
            ]);
            if (!cancelled) {
                setLatestUpdate(update);
                setCurrentVersion(current);
                setCheckingUpdate(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const handleCheck = async () => {
        setCheckStatus('checking');
        setInstallError(null);
        const latest = await fetchLatestUpdate();
        if (!latest) {
            setLatestUpdate(null);
            setCheckedUpdate(null);
            setCheckStatus('unavailable');
            return;
        }
        setLatestUpdate(latest);
        if (!isCapacitorApp()) {
            setCheckedUpdate(latest);
            setCheckStatus('available');
            return;
        }
        const result = await checkForUpdate();
        if (result) {
            setCheckedUpdate(result.update);
            setCheckStatus('available');
        } else {
            setCheckedUpdate(null);
            setCheckStatus('up-to-date');
        }
    };

    const handleInstall = async (update?: UpdateInfo) => {
        const target = update ?? checkedUpdate ?? latestUpdate;
        if (!target) return;
        if (!isCapacitorApp()) {
            window.open(target.url, '_blank');
            return;
        }
        setInstalling(true);
        setInstallError(null);
        try {
            await downloadAndInstall(target.url);
        } catch (err) {
            setInstallError(err instanceof Error ? err.message : 'Update failed. Please try again.');
        } finally {
            setInstalling(false);
        }
    };

    const versionLabel = currentVersion
        ? `v${currentVersion}`
        : latestUpdate
            ? `v${latestUpdate.version}`
            : checkingUpdate
                ? 'checking for updates...'
                : 'unknown';

    const checkDescription =
        checkStatus === 'checking' ? 'Checking for the latest release...'
        : checkStatus === 'up-to-date' ? `You're on the latest version (v${latestUpdate?.version ?? currentVersion ?? 'latest'})`
        : checkStatus === 'available' ? `Update to v${checkedUpdate?.version} is available`
        : checkStatus === 'unavailable' ? 'Could not check for updates. Try again later.'
        : 'Check if a newer version of the app is available';

    return (
        <>
            <Title title="App" />
            <div className="page-main-with-secondary">
                <div className="settings-container">
                    <div className="settings-header">
                        <h1 className="settings-title">
                            <Package />
                            App
                        </h1>
                        <p className="settings-subtitle">AnthroWeb {versionLabel}</p>
                    </div>

                    <div className="settings-list">
                        <button
                            className="settings-item"
                            onClick={handleCheck}
                            disabled={checkStatus === 'checking'}
                        >
                            <RotateCw />
                            <div className="settings-item-content">
                                <span className="settings-item-title">Check for Updates</span>
                                <span className="settings-item-description">{checkDescription}</span>
                            </div>
                            <div className="settings-item-arrow">
                                <ChevronRight />
                            </div>
                        </button>
                    </div>

                    {checkStatus === 'available' && checkedUpdate && (
                        <div className="settings-update-box">
                            <div className="settings-update-info">
                                <span className="settings-update-title">
                                    AnthroWeb v{checkedUpdate.version}
                                </span>
                                <span className="settings-update-note">
                                    <Info />
                                    {checkedUpdate.notes || 'A new version is available.'}
                                </span>
                            </div>
                            <button
                                className="settings-update-btn"
                                onClick={() => handleInstall(checkedUpdate)}
                                disabled={installing}
                            >
                                <Download />
                                {installing ? 'Downloading...' : isCapacitorApp() ? 'Update & Install' : 'Download APK'}
                            </button>
                            {installError && <p className="settings-update-error">{installError}</p>}
                        </div>
                    )}

                    <div className="settings-footer">
                        <p className="settings-version">AnthroWeb {versionLabel}</p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AppPage;