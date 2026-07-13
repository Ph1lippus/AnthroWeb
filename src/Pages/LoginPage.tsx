import React from 'react';
import { Link } from 'react-router-dom';
import Title from '../Components/Title';

const LoginPage: React.FC = () => {
    return (
        <>
            <Title title="Login" />
            <div className="auth-page">
                <div className="auth-card">
                    <h2 className="auth-title">Welcome Back</h2>
                    <p className="auth-text">Sign in to continue your journey</p>
                    <div className="auth-extra-links">
                        <p className="auth-text">Don't have an account? <Link to="/register" className="auth-link">Create one</Link></p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default LoginPage;