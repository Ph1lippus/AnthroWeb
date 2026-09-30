import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { Settings, LogOut, LogIn, UserPlus, ChevronLeft, ChevronRight, Calendar, History, Check, Loader2, AlertTriangle } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { useDailyLogSaveState } from '../utils/dailyLogStatus';
import { addDays, formatDayLabel, isDateString, todayString } from '../utils/dates';
import { REGISTRATION_ENABLED } from '../utils/appConfig';

const Navbar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const saveState = useDailyLogSaveState();
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

    // Show day navigation only on the main daily log page (not edit/history/setup).
    // Matching on segments rather than raw equality keeps a trailing slash or
    // the ?date= param from hiding the controls.
    const pathname = location.pathname.toLowerCase().replace(/\/+$/, '');
    const onDailyLog = pathname === '/daily-log';
    const showDayNav = Boolean(user) && onDailyLog;

    const logDateParam = searchParams.get('date');
    const today = todayString();
    // Before the page hydrates the param, mirror today's date so the label
    // never renders empty. An invalid ?date= is ignored the same way.
    const logDate = isDateString(logDateParam) ? logDateParam : today;

    // Drop a stale "Saved HH:MM" after a day switch — it describes the previous
    // day and must not read as confirmation that the newly-selected day landed.
    const saveStatus = saveState.status === 'saved' && saveState.date !== logDate
        ? 'idle'
        : saveState.status;

    const goToDate = useCallback((date: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('date', date);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    return (
        <nav className="navbar-brand-row" aria-label="Main navigation">
            <div className="container navbar-inner">
                <div className="navbar-slot navbar-slot--start">
                {showDayNav && (
                    <>
                        <div className="navbar-day-nav">
                            <button
                                type="button"
                                onClick={() => goToDate(addDays(logDate, -1))}
                                className="navbar-day-btn"
                                title="Previous day"
                                aria-label="Previous day"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="navbar-day-label" aria-live="polite">
                                {formatDayLabel(logDate)}
                            </span>
                            <label className="navbar-day-btn navbar-day-btn--picker" title="Pick a day">
                                <Calendar size={15} aria-hidden="true" />
                                <span className="sr-only">Pick a day</span>
                                <input
                                    type="date"
                                    className="navbar-day-picker-input"
                                    value={logDate}
                                    max={today}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        if (isDateString(next)) goToDate(next);
                                    }}
                                />
                            </label>
                            <button
                                type="button"
                                onClick={() => goToDate(addDays(logDate, 1))}
                                className="navbar-day-btn"
                                title="Next day"
                                aria-label="Next day"
                                disabled={logDate >= today}
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
                        {saveStatus !== 'idle' && (
                            <div
                                className={`navbar-save-status navbar-save-status--${saveStatus}`}
                                role="status"
                                aria-live="polite"
                            >
                                {saveStatus === 'saving' && (
                                    <>
                                        <Loader2 size={12} className="navbar-save-status-spinner" aria-hidden="true" />
                                        Saving&hellip;
                                    </>
                                )}
                                {saveStatus === 'saved' && (
                                    <>
                                        <Check size={12} aria-hidden="true" />
                                        {saveState.savedAt ? `Saved ${saveState.savedAt.toLocaleTimeString()}` : 'Saved'}
                                    </>
                                )}
                                {saveStatus === 'error' && (
                                    <>
                                        <AlertTriangle size={12} aria-hidden="true" />
                                        {saveState.error || 'Save failed'}
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
                </div>
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
                            {REGISTRATION_ENABLED && (
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
                            )}
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;