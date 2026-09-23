import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { Settings, LogOut, LogIn, UserPlus, ChevronLeft, ChevronRight, Calendar, History } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { publishDailyLogNav } from '../utils/dailyLogNav';

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

    // Show day navigation only on the main daily log page (not edit/history/setup)
    const onDailyLog = location.pathname.toLowerCase() === '/daily-log';

    return (
        <nav className="navbar-brand-row" aria-label="Main navigation">
            <div className="container navbar-inner">
                {user && onDailyLog && (
                    <div className="navbar-day-nav">
                        <button
                            type="button"
                            onClick={() => publishDailyLogNav('prev')}
                            className="navbar-day-btn"
                            title="Previous day"
                            aria-label="Previous day"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={() => publishDailyLogNav('today')}
                            className="navbar-day-btn"
                            title="Today"
                            aria-label="Today"
                        >
                            <Calendar size={15} />
                        </button>
                        <button
                            type="button"
                            onClick={() => publishDailyLogNav('next')}
                            className="navbar-day-btn"
                            title="Next day"
                            aria-label="Next day"
                        >
                            <ChevronRight size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/Daily-Log/History')}
                            className="navbar-day-btn"
                            title="View History"
                            aria-label="View History"
                        >
                            <History size={15} />
                        </button>
                    </div>
                )}
                <div className="navbar-actions">
                    {user ? (
                        <>
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
                                    `navbar-action-link navbar-auth-link navbar-icon-link${isActive ? ' active' : ''}`
                                }
                                to="/login"
                                title="Login"
                                aria-label="Login"
                            >
                                <LogIn size={18} />
                            </NavLink>
                            <NavLink
                                className={({ isActive }) =>
                                    `navbar-action-link navbar-auth-link navbar-icon-link${isActive ? ' active' : ''}`
                                }
                                to="/register"
                                title="Register"
                                aria-label="Register"
                            >
                                <UserPlus size={18} />
                            </NavLink>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;