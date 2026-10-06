import React, { useState, useCallback } from 'react';
import { resetPassword } from '../services/profileService';

/** Shared reset form: same field/error/shake treatment as the login form. */
const ForgotPasswordForm: React.FC<{ idPrefix?: string }> = ({ idPrefix = 'forgot' }) => {
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
            const msg = err instanceof Error ? err.message : 'Failed to send reset email. Please try again.';
            setError(msg);
            triggerShake('email');
        } finally {
            setLoading(false);
        }
    };

    const emailId = `${idPrefix}-email`;

    return (
        <form onSubmit={handleSubmit} noValidate>
            {error && <div className="auth-error">{error}</div>}
            {message && (
                <div className="auth-error auth-success">{message}</div>
            )}
            <div className="mb-3 text-start">
                <label htmlFor={emailId} className="form-label">Email</label>
                <div className="t-input-wrap">
                    <div className={`t-input ${fieldError ? 'is-error' : ''} ${shakingField === 'email' ? 'is-shaking' : ''}`}>
                        <input className="form-control" id={emailId} type="email" placeholder="Enter your email" required value={email} onChange={(e) => { setEmail(e.target.value); setFieldError(null); }} />
                    </div>
                    {fieldError && <p className="t-error-msg">{fieldError}</p>}
                </div>
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
        </form>
    );
};

export default ForgotPasswordForm;
