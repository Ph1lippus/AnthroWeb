import React, { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmail } from '../services/profileService';

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
    const [shakingField, setShakingField] = useState<string | null>(null);

    const emailInputRef = useRef<HTMLDivElement>(null);
    const passwordInputRef = useRef<HTMLDivElement>(null);

    const triggerShake = useCallback((field: string) => {
        // Remove shaking class, force reflow, re-add
        setShakingField(null);
        // Use requestAnimationFrame to ensure DOM updates between class removal and addition
        requestAnimationFrame(() => {
            setShakingField(field);
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const errors: { email?: string; password?: string } = {};
        if (!email.trim()) {
            errors.email = 'Please enter your email.';
        }
        if (!password) {
            errors.password = 'Please enter your password.';
        }

        setFieldErrors(errors);

        if (Object.keys(errors).length > 0) {
            // Trigger shake on the first errored field
            const firstErrorField = Object.keys(errors)[0];
            triggerShake(firstErrorField);
            return;
        }

        setLoading(true);
        try {
            await signInWithEmail(email, password);
            navigate('/dashboard');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to login. Please try again.';
            setError(message);
            // Show error on both fields on auth failure
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

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h2 className="auth-title">Welcome Back</h2>
                <form onSubmit={handleSubmit} noValidate>
                    {error && <div className="auth-error">{error}</div>}
                    <div className="mb-3 text-start">
                        <label htmlFor="email" className="form-label">Email</label>
                        <div
                            className={`t-input-wrap ${fieldErrors.email ? 'is-error' : ''}`}
                            ref={emailInputRef}
                        >
                            <div className={`t-input ${fieldErrors.email ? 'is-error' : ''} ${shakingField === 'email' ? 'is-shaking' : ''}`}>
                                <input
                                    className="form-control"
                                    id="email"
                                    type="email"
                                    placeholder="Enter your email"
                                    required
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        clearFieldError('email');
                                    }}
                                />
                            </div>
                            {fieldErrors.email && <p className="t-error-msg">{fieldErrors.email}</p>}
                        </div>
                    </div>
                    <div className="mb-3 text-start">
                        <label htmlFor="password" className="form-label">Password</label>
                        <div
                            className={`t-input-wrap ${fieldErrors.password ? 'is-error' : ''}`}
                            ref={passwordInputRef}
                        >
                            <div className={`t-input ${fieldErrors.password ? 'is-error' : ''} ${shakingField === 'password' ? 'is-shaking' : ''}`}>
                                <div className="password-input-wrap">
                                    <input
                                        className="form-control"
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Enter your password"
                                        required
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            clearFieldError('password');
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        onClick={() => setShowPassword((prev) => !prev)}
                                    >
                                        <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
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
                    <Link className="auth-link" to="/forgot-password">Forgot password?</Link>
                </div>
                <p className="auth-text mt-3">
                    Don't have an account? <Link className="auth-link" to="/register">Register</Link>
                </p>
            </div>
        </div>
    );
};

export default LoginPage;