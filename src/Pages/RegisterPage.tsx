import React from 'react';
import { Link } from 'react-router-dom';
import Title from '../Components/Title';

const RegisterPage: React.FC = () => {
    return (
        <>
            <Title title="Register" />
            <div className="auth-page">
                <div className="auth-card">
                    <h2 className="auth-title">Create Account</h2>
                    <p className="auth-text">Start your tracking journey today</p>
                    <div className="auth-extra-links">
                        <p className="auth-text">Already have an account? <Link to="/login" className="auth-link">Sign in</Link></p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default RegisterPage;