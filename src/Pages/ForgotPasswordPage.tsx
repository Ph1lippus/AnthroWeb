import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from '../services/profileService';

const ForgotPasswordPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [shakingField, setShakingField] = useState<string | null>(null);

    const triggerShake = useCallback((field: string) => {
        setShakingField(null);
        requestAnimationFrame(() => {
            setShakingField(field);
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        setFieldError(null);

        if (!email.trim()) {
            setFieldError('Please enter your email.');
            triggerShake('email');
            return;
        }

        setLoading(true);
        try {
            await resetPassword(email);
            setMessage('Password reset email sent! Please check your inbox.');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send reset email. Please try again.';
            setError(message);
            triggerShake('email');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h2 className="auth-title">Reset Password</h2>
                <form onSubmit={handleSubmit} noValidate>
                    {error && <div className="auth-error">{error}</div>}
                    {message && (
                        <div
                            className="auth-error"
                            style={{
                                background: 'rgba(0, 255, 166, 0.12)',
                                borderColor: 'rgba(0, 255, 166, 0.4)',
                                color: 'var(--color-primary)',
                            }}
                        >
                            {message}
                        </div>
                    )}
                    <div className="mb-3 text-start">
                        <label htmlFor="email" className="form-label">Email</label>
                        <div className="t-input-wrap">
                            <div className={`t-input ${fieldError ? 'is-error' : ''} ${shakingField === 'email' ? 'is-shaking' : ''}`}>
                                <input
                                    className="form-control"
                                    id="email"
                                    type="email"
                                    placeholder="Enter your email"
                                    required
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        setFieldError(null);
                                    }}
                                />
                            </div>
                            {fieldError && <p className="t-error-msg">{fieldError}</p>}
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                        {loading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                </form>
                <p className="auth-text mt-3">
                    Remember your password? <Link className="auth-link" to="/login">Login</Link>
                </p>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;