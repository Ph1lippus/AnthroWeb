import React, { useState } from 'react';
import Title from '../Components/Title';
import LoginForm from '../Components/LoginForm';
import ForgotPasswordForm from '../Components/ForgotPasswordForm';

const HomePage: React.FC = () => {
    const [mode, setMode] = useState<'login' | 'forgot'>('login');

    return (
        <>
            <Title title="Home" />
            <div className="home-wrapper">
                <section className="screen-height home-page home-hero">
                    <div className="home-hero-inner">
                        <div className="home-hero-copy">
                            <p className="home-eyebrow">AnthroWeb</p>
                            <h1 className="slogan" aria-label="Track. Improve. Succeed.">
                                <span className="slogan-line" aria-hidden="true">Track.</span>
                                <span className="slogan-line" aria-hidden="true">Improve.</span>
                                <span className="slogan-line slogan-line--accent" aria-hidden="true">Succeed.</span>
                            </h1>
                            <hr className="animated-hr" />
                        </div>
                        <div className="auth-card auth-card-narrow home-login-card">
                            {mode === 'login' ? (
                                <>
                                    <h2 className="auth-title">Welcome Back</h2>
                                    <LoginForm idPrefix="home" onForgotPassword={() => setMode('forgot')} />
                                </>
                            ) : (
                                <>
                                    <h2 className="auth-title">Reset Password</h2>
                                    <ForgotPasswordForm idPrefix="home" />
                                    <p className="auth-text mt-3">
                                        Remember your password?{' '}
                                        <button type="button" className="auth-link auth-link-btn" onClick={() => setMode('login')}>
                                            Back to login
                                        </button>
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </>
    );
};

export default HomePage;