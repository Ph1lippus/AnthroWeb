import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import ConfirmModal from '../Components/ConfirmModal';
import { getCurrentUser, signOutUser } from '../services/profileService';
import { LogOut, ChevronRight } from 'lucide-react';

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
            const user = await getCurrentUser();
            if (!cancelled) {
                setEmail(user?.email ?? '');
                setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const handleSignOut = async () => {
        setSigningOut(true);
        setError(null);
        try {
            await signOutUser();
            navigate('/login');
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
                        <p className="settings-subtitle">{loading ? 'Loading...' : email}</p>
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
                message={<>Are you sure you want to sign out of <strong>{email || 'your account'}</strong>?</>}
                confirmLabel="Sign Out"
                cancelLabel="Cancel"
                danger
                busy={signingOut}
                onConfirm={handleSignOut}
                onCancel={() => setConfirmOpen(false)}
            />
        </>
    );
};

export default AccountPage;