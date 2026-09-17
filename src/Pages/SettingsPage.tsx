import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { checkForUpdate, downloadAndInstall, fetchLatestUpdate, getCurrentVersion, isCapacitorApp } from '../services/updateService';
import type { UpdateInfo } from '../services/updateService';

type CheckStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'unavailable';

const SettingsPage: React.FC = () => {
    const navigate = useNavigate();
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
        const result = await checkForUpdate();
        if (result) {
            setCheckedUpdate(result.update);
            setCheckStatus('available');
        } else {
            setCheckedUpdate(null);
            const latest = await fetchLatestUpdate();
            setCheckStatus(latest ? 'up-to-date' : 'unavailable');
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

    const settingsItems = [
        {
            title: 'Profile',
            description: 'Edit your personal information and avatar',
            icon: 'fa-solid fa-user',
            action: () => navigate('/profile/edit')
        },
        {
            title: 'Daily Log Goals',
            description: 'Configure your nutrition, sleep, and fitness goals',
            icon: 'fa-solid fa-bullseye',
            action: () => navigate('/Daily-Log/Setup')
        },
        {
            title: 'Measurements',
            description: 'Track your weight, body fat, and progress',
            icon: 'fa-solid fa-weight-scale',
            action: () => navigate('/Measurements')
        },
        {
            title: 'Check for Updates',
            description: checkDescription,
            icon: 'fa-solid fa-rotate',
            action: handleCheck
        },
        {
            title: 'Account',
            description: 'Sign out of your account',
            icon: 'fa-solid fa-right-from-bracket',
            action: async () => {
                const { signOutUser } = await import('../services/profileService');
                await signOutUser();
                navigate('/login');
            }
        }
    ];

    if (latestUpdate) {
        settingsItems.push({
            title: 'Install Android App',
            description: `Download AnthroWeb v${latestUpdate.version} for Android`,
            icon: 'fa-solid fa-download',
            action: () => handleInstall(latestUpdate)
        });
    }

    return (
        <>
            <Title title="Settings" />
            <div className="page-main-with-secondary">
                <div className="settings-container">
                    <div className="settings-header">
                        <h1 className="settings-title">Settings</h1>
                        <p className="settings-subtitle">Manage your account and preferences</p>
                    </div>

                    <div className="settings-list">
                        {settingsItems.map((item, index) => (
                            <button
                                key={index}
                                onClick={item.action}
                                className="settings-item"
                                disabled={checkStatus === 'checking' && item.title === 'Check for Updates'}
                            >
                                <div className="settings-item-icon">
                                    <i className={item.icon}></i>
                                </div>
                                <div className="settings-item-content">
                                    <span className="settings-item-title">{item.title}</span>
                                    <span className="settings-item-description">{item.description}</span>
                                </div>
                                <div className="settings-item-arrow">
                                    <i className="fa-solid fa-chevron-right"></i>
                                </div>
                            </button>
                        ))}
                    </div>

                    {checkStatus === 'available' && checkedUpdate && (
                        <div className="settings-update-box">
                            <div className="settings-update-info">
                                <span className="settings-update-title">
                                    AnthroWeb v{checkedUpdate.version}
                                </span>
                                <span className="settings-update-note">
                                    {checkedUpdate.notes || 'A new version is available.'}
                                </span>
                            </div>
                            <button
                                className="settings-update-btn"
                                onClick={() => handleInstall(checkedUpdate)}
                                disabled={installing}
                            >
                                {installing ? 'Downloading...' : 'Update & Install'}
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

export default SettingsPage;