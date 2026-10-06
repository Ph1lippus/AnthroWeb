import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmail, getUserSettings } from '../services/profileService';
import { showBootTransition, dismissBootScreenImmediate } from '../services/bootScreen';
import { REGISTRATION_ENABLED } from '../utils/appConfig';
import { EyeOff, Eye } from 'lucide-react';

/**
 * The shared sign-in form, used by the home auth card.
 * Card panel stays with the parent so every form shares one container.
 */
const LoginForm: React.FC<{ idPrefix?: string; onForgotPassword?: () => void }> = ({ idPrefix = 'login', onForgotPassword }) => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
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
        const errors: { email?: string; password?: string } = {};
        if (!email.trim()) errors.email = 'Please enter your email.';
        if (!password) errors.password = 'Please enter your password.';
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) {
            const first = Object.keys(errors)[0] as 'email' | 'password';
            triggerShake(first);
            return;
        }
        setLoading(true);
        try {
            await signInWithEmail(email, password);
            // Cover the route change with the splash: the landing page's own
            // queries are still in flight when we navigate, and without this
            // the footer and an empty page flash before the data lands.
            // BootHandoff (keyed on the signed-in user) takes it back down.
            showBootTransition('Signing you in');
            const settings = await getUserSettings();
            if (!settings) navigate('/profile/edit');
            else navigate('/Daily-Log');
        } catch (err) {
            // The splash went up before settings resolved; a failed sign-in
            // must take it back down or the app is stuck behind it.
            dismissBootScreenImmediate();
            const message = err instanceof Error ? err.message : 'Failed to login. Please try again.';
            setError(message);
            setFieldErrors({ email: message, password: message });
            triggerShake('email');
        } finally {
            setLoading(false);
        }
    };

    const clearFieldError = (field: 'email' | 'password') => {
        setFieldErrors((prev) => {
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    const emailId = `${idPrefix}-email`;
    const passwordId = `${idPrefix}-password`;

    return (
        <>
            <form onSubmit={handleSubmit} noValidate>
                {error && <div className="auth-error">{error}</div>}

                <div className="mb-3 text-start">
                    <label htmlFor={emailId} className="form-label">Email</label>
                    <div className={`t-input-wrap ${fieldErrors.email ? 'is-error' : ''}`}>
                        <div className={`t-input ${fieldErrors.email ? 'is-error' : ''} ${shakingField === 'email' ? 'is-shaking' : ''}`}>
                            <input className="form-control" id={emailId} type="email" placeholder="Enter your email" required value={email} onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }} />
                        </div>
                        {fieldErrors.email && <p className="t-error-msg">{fieldErrors.email}</p>}
                    </div>
                </div>
                <div className="mb-3 text-start">
                    <label htmlFor={passwordId} className="form-label">Password</label>
                    <div className={`t-input-wrap ${fieldErrors.password ? 'is-error' : ''}`}>
                        <div className={`t-input ${fieldErrors.password ? 'is-error' : ''} ${shakingField === 'password' ? 'is-shaking' : ''}`}>
                            <div className="password-input-wrap">
                                <input className="form-control" id={passwordId} type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required value={password} onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }} />
                                <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((p) => !p)}>
                                    {showPassword ? <EyeOff /> : <Eye />}
                                </button>
                            </div>
                        </div>
                        {fieldErrors.password && <p className="t-error-msg">{fieldErrors.password}</p>}
                    </div>
                </div>
                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                </button>
            </form>
            <div className="auth-extra-links">
                {onForgotPassword ? (
                    <button type="button" className="auth-link auth-link-btn" onClick={onForgotPassword}>Forgot password?</button>
                ) : null}
            </div>
            {!REGISTRATION_ENABLED ? (
                <p className="auth-text auth-text-muted mt-3">Registration is closed &mdash; this deployment is invite only.</p>
            ) : null}
        </>
    );
};

export default LoginForm;
