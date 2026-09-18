import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { Settings, LogOut } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

const ROUTE_TITLES: { prefix: string; label: string }[] = [
    { prefix: '/Daily-Log', label: 'Daily Log' },
    { prefix: '/Dashboard', label: 'Dashboard' },
    { prefix: '/Measurements', label: 'Measurements' },
    { prefix: '/Books', label: 'Books' },
    { prefix: '/Journal', label: 'Journal' },
    { prefix: '/Projects', label: 'Projects' },
    { prefix: '/Abstinence', label: 'Abstinence' },
    { prefix: '/Academic', label: 'Academic' },
    { prefix: '/Study-Timer', label: 'Study Timer' },
    { prefix: '/Notes', label: 'Notes' },
    { prefix: '/Workouts', label: 'Workouts' },
    { prefix: '/Settings', label: 'Settings' },
    { prefix: '/Profile', label: 'Profile' },
    { prefix: '/Credits', label: 'Credits' },
];

const Navbar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [logoutConfirm, setLogoutConfirm] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const closeMenu = useCallback(() => {
        setClosing(true);
        setTimeout(() => {
            setMenuOpen(false);
            setClosing(false);
        }, 150); // matches --dropdown-close-dur
    }, []);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target as Node)
            ) {
                closeMenu();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [closeMenu]);

    const toggleMenu = useCallback(() => {
        if (menuOpen) {
            closeMenu();
        } else {
            setMenuOpen(true);
        }
    }, [menuOpen, closeMenu]);

    const handleLogout = () => {
        closeMenu();
        setLogoutConfirm(true);
    };

    const doSignOut = async () => {
        setSigningOut(true);
        await supabase.auth.signOut();
        navigate('/login');
    };

    const nickname = user?.user_metadata?.username 
        || user?.user_metadata?.nickname 
        || user?.user_metadata?.full_name 
        || user?.email?.split('@')[0] 
        || 'Viewer';

    const mobileTitle = ROUTE_TITLES.find(({ prefix }) => location.pathname.startsWith(prefix))?.label
        || (location.pathname === '/' ? 'Home' : 'AnthroWeb');

    return (
        <nav className="navbar-brand-row" aria-label="Main navigation">
            <div className="container navbar-inner">
                <div className="navbar-brand-centered">
                    <span className="navbar-mobile-title">{mobileTitle}</span>
                    <NavLink className="navbar-brand" to="/">AnthroWeb</NavLink>
                </div>
                <div className="navbar-actions">
                    {user ? (
                        <>
                            <div className="navbar-user-wrap">
                                <NavLink 
                                    className="navbar-user" 
                                    to="/Profile"
                                    title={nickname}
                                >
                                    {nickname}
                                </NavLink>
                            </div>
                            
                            <div className="t-dropdown-wrap">
                                <button
                                    ref={buttonRef}
                                    className="navbar-menu-btn"
                                    onClick={toggleMenu}
                                    aria-label="Menu"
                                    aria-expanded={menuOpen}
                                >
                                    <div className={`navbar-hamburger ${menuOpen ? 'is-active' : ''}`}>
                                        <span className="hamburger-line"></span>
                                        <span className="hamburger-line"></span>
                                        <span className="hamburger-line"></span>
                                    </div>
                                </button>
                                <div
                                    ref={menuRef}
                                    className={`t-dropdown ${menuOpen ? (closing ? 'is-closing' : 'is-open') : ''}`}
                                    data-origin="top-right"
                                >
                                    <button className="t-dropdown-item" onClick={() => {
                                        closeMenu();
                                        navigate('/Settings');
                                    }}>
                                        <Settings />
                                        Settings
                                    </button>
                                    <button className="t-dropdown-item" onClick={() => handleLogout()}>
                                        <LogOut />
                                        Logout
                                    </button>
                                </div>
                            </div>
                            <ConfirmModal
                                open={logoutConfirm}
                                title="Sign out"
                                message={`Are you sure you want to sign out of "${nickname}"?`}
                                confirmLabel="Sign Out"
                                danger
                                onConfirm={() => { doSignOut(); }}
                                onCancel={() => setLogoutConfirm(false)}
                                busy={signingOut}
                            />
                        </>
                    ) : (
                        <>
                            <NavLink
                                className={({ isActive }) =>
                                    `navbar-action-link navbar-auth-link${isActive ? ' active' : ''}`
                                }
                                to="/login"
                            >
                                Login
                            </NavLink>
                            <NavLink
                                className={({ isActive }) =>
                                    `navbar-action-link navbar-auth-link${isActive ? ' active' : ''}`
                                }
                                to="/register"
                            >
                                Register
                            </NavLink>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;