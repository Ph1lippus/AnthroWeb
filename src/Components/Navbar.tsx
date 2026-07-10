import React from 'react';
import { Link } from 'react-router-dom';

const Navbar: React.FC = () => {
    return (
        <nav className="navbar">
            <Link to="/" className="navbar__logo">AnthroWeb</Link>
            <div className="navbar__links">
                <Link to="/login" className="navbar__link">
                    <i className="fas fa-sign-in-alt" style={{ marginRight: '0.5rem' }}></i>
                    Login
                </Link>
                <Link to="/register" className="navbar__link">
                    <i className="fas fa-user-plus" style={{ marginRight: '0.5rem' }}></i>
                    Register
                </Link>
                <button 
                    className="navbar__theme-toggle"
                    aria-label="Theme settings"
                >
                    <i className="fas fa-moon"></i>
                </button>
            </div>
        </nav>
    );
};

export default Navbar;