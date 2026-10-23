import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import Title from '../Components/Title';

const ResetPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;
            setDone(true);
            setTimeout(() => navigate('/Daily-Log', { replace: true }), 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Title title="Reset Password" />
            <div className="home-wrapper">
                <section className="screen-height home-page home-hero">
                    <div className="auth-card auth-card-narrow home-login-card">
                        <h2 className="auth-title">Set a new password</h2>
                        {done ? (
                            <p className="auth-text">Password updated. Redirecting…</p>
                        ) : (
                            <form onSubmit={handleSubmit} noValidate>
                                <div className="mb-3 text-start">
                                    <label className="form-label" htmlFor="new-password">New password</label>
                                    <input
                                        id="new-password"
                                        className="form-control"
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="mb-3 text-start">
                                    <label className="form-label" htmlFor="confirm-password">Confirm password</label>
                                    <input
                                        id="confirm-password"
                                        className="form-control"
                                        type="password"
                                        value={confirm}
                                        onChange={e => setConfirm(e.target.value)}
                                        required
                                    />
                                </div>
                                {error && <p className="t-error-msg">{error}</p>}
                                <button type="submit" className="btn-primary w-100" disabled={loading}>
                                    {loading ? 'Updating…' : 'Update password'}
                                </button>
                            </form>
                        )}
                    </div>
                </section>
            </div>
        </>
    );
};

export default ResetPasswordPage;