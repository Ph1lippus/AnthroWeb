import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import ConfirmModal from '../Components/ConfirmModal';
import { getCurrentUser, signOutUser } from '../services/profileService';
import LoadingSpinner from '../Components/LoadingSpinner';
import { LogOut, ChevronRight } from 'lucide-react';
import { useBootHold } from '../services/bootScreen';

const AccountPage: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const user = await getCurrentUser();
                if (!cancelled) {
                    setEmail(user?.email ?? '');
                }
            } finally {
                // The `cancelled` guard stays on `setEmail` only. The flag has to
                // clear unconditionally: a rejected `getCurrentUser()` would
                // otherwise skip it and pin both the inline spinner and the
                // boot hold. Unmounting releases the hold on its own.
                setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // The email loads with a raw await the app-level boot gate cannot see, so
    // without this the splash lifts on top of the inline spinner below.
    useBootHold(loading);

    const handleSignOut = async () => {
        setSigningOut(true);
        setError(null);
        try {
            await signOutUser();
            navigate('/');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign out failed. Please try again.');
            setSigningOut(false);
        }
    };

    return (
        <>
            <Title title="Account" />
            <div className="page-main-with-secondary">
                <div className="settings-container">
                    <div className="settings-header">
                        <h1 className="settings-title">
                            <LogOut />
                            Account
                        </h1>
                        <p className="settings-subtitle">
                            {loading ? <LoadingSpinner inline label="Loading account" /> : email}
                        </p>
                    </div>

                    <div className="settings-list">
                        <button className="settings-item" onClick={() => setConfirmOpen(true)}>
                            <LogOut />
                            <div className="settings-item-content">
                                <span className="settings-item-title">Sign Out</span>
                                <span className="settings-item-description">Sign out of AnthroWeb on this device</span>
                            </div>
                            <div className="settings-item-arrow">
                                <ChevronRight />
                            </div>
                        </button>
                    </div>

                    {error && <p className="settings-update-error">{error}</p>}
                </div>
            </div>

            <ConfirmModal
                open={confirmOpen}
                title="Sign Out"
                confirmLabel="Sign Out"
                danger
                busy={signingOut}
                onConfirm={handleSignOut}
                onCancel={() => setConfirmOpen(false)}
            />
        </>
    );
};

export default AccountPage;