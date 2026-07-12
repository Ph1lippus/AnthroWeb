import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUpWithEmail } from '../services/profileService';

const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<{ username?: string; email?: string; password?: string; confirmPassword?: string }>({});
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

        const errors: { username?: string; email?: string; password?: string; confirmPassword?: string } = {};

        if (!username.trim()) {
            errors.username = 'Please enter a username.';
        }
        if (!email.trim()) {
            errors.email = 'Please enter your email.';
        }
        if (!password) {
            errors.password = 'Please enter a password.';
        } else if (password.length < 6) {
            errors.password = 'Password must be at least 6 characters long.';
        }
        if (!confirmPassword) {
            errors.confirmPassword = 'Please confirm your password.';
        } else if (password !== confirmPassword) {
            errors.confirmPassword = 'Passwords do not match.';
        }

        setFieldErrors(errors);

        if (Object.keys(errors).length > 0) {
            const firstErrorField = Object.keys(errors)[0];
            triggerShake(firstErrorField);

            // Also set the generic error for the first validation issue
            const firstError = errors[firstErrorField as keyof typeof errors];
            if (firstError) setError(firstError);

            return;
        }

        setLoading(true);
        try {
            await signUpWithEmail(email, password, username);
            setMessage('Registration successful! Please check your email to confirm your account.');
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to register. Please try again.';
            setError(message);
            setFieldErrors((prev) => ({
                ...prev,
                email: message,
                password: message,
            }));
            triggerShake('email');
        } finally {
            setLoading(false);
        }
    };

    const clearFieldError = (field: 'username' | 'email' | 'password' | 'confirmPassword') => {
        setFieldErrors((prev) => {
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h2 className="auth-title">Create Account</h2>
                <form onSubmit={handleSubmit} noValidate>
                    {error && !Object.keys(fieldErrors).length && <div className="auth-error">{error}</div>}
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
                        <label htmlFor="username" className="form-label">Username</label>
                        <div className={`t-input-wrap ${fieldErrors.username ? 'is-error' : ''}`}>
                            <div className={`t-input ${fieldErrors.username ? 'is-error' : ''} ${shakingField === 'username' ? 'is-shaking' : ''}`}>
                                <input
                                    className="form-control"
                                    id="username"
                                    type="text"
                                    placeholder="Choose a username"
                                    required
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        clearFieldError('username');
                                    }}
                                />
                            </div>
                            {fieldErrors.username && <p className="t-error-msg">{fieldErrors.username}</p>}
                        </div>
                    </div>
                    <div className="mb-3 text-start">
                        <label htmlFor="email" className="form-label">Email</label>
                        <div className={`t-input-wrap ${fieldErrors.email ? 'is-error' : ''}`}>
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
                        <div className={`t-input-wrap ${fieldErrors.password ? 'is-error' : ''}`}>
                            <div className={`t-input ${fieldErrors.password ? 'is-error' : ''} ${shakingField === 'password' ? 'is-shaking' : ''}`}>
                                <div className="password-input-wrap">
                                    <input
                                        className="form-control"
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Create a password"
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
                    <div className="mb-3 text-start">
                        <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                        <div className={`t-input-wrap ${fieldErrors.confirmPassword ? 'is-error' : ''}`}>
                            <div className={`t-input ${fieldErrors.confirmPassword ? 'is-error' : ''} ${shakingField === 'confirmPassword' ? 'is-shaking' : ''}`}>
                                <div className="password-input-wrap">
                                    <input
                                        className="form-control"
                                        id="confirmPassword"
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        placeholder="Confirm your password"
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => {
                                            setConfirmPassword(e.target.value);
                                            clearFieldError('confirmPassword');
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                                    >
                                        <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                </div>
                            </div>
                            {fieldErrors.confirmPassword && <p className="t-error-msg">{fieldErrors.confirmPassword}</p>}
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                        {loading ? 'Creating account...' : 'Register'}
                    </button>
                </form>
                <p className="auth-text mt-3">
                    Already have an account? <Link className="auth-link" to="/login">Login</Link>
                </p>
            </div>
        </div>
    );
};

export default RegisterPage;