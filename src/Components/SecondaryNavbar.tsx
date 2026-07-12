import React from 'react';
import { NavLink } from 'react-router-dom';

const SecondaryNavbar: React.FC = () => {
    return (
        <nav className="secondary-navbar" aria-label="Secondary navigation">
            <div className="container secondary-navbar-inner">
                <div className="secondary-navbar-links">
                    <NavLink
                        className={({ isActive }) =>
                            `secondary-navbar-link${isActive ? ' active' : ''}`
                        }
                        to="/dashboard"
                    >
                        Dashboard
                    </NavLink>
                    <NavLink
                        className={({ isActive }) =>
                            `secondary-navbar-link${isActive ? ' active' : ''}`
                        }
                        to="/books"
                    >
                        Books
                    </NavLink>
                    <NavLink
                        className={({ isActive }) =>
                            `secondary-navbar-link${isActive ? ' active' : ''}`
                        }
                        to="/projects"
                    >
                        Projects
                    </NavLink>
                </div>
            </div>
        </nav>
    );
};

export default SecondaryNavbar;