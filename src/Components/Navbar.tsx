import React, { useCallback, useEffect, useState, useRef } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { Settings, LogOut, LogIn, UserPlus, ChevronLeft, ChevronRight, Calendar, History, AlertTriangle } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import AcademicAlertBanner from './AcademicAlertBanner';
import { useDailyLogSaveState } from '../utils/dailyLogStatus';
import { useAuthSession } from '../hooks/useAuthSession';
import { addDays, formatDayLabel, isDateString, todayString } from '../utils/dates';
import { REGISTRATION_ENABLED } from '../utils/appConfig';

const Navbar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const saveState = useDailyLogSaveState();
    const { user } = useAuthSession();
    const [menuOpen, setMenuOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [logoutConfirm, setLogoutConfirm] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

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

    // Only failures reach the navbar, and a stale one from a previous day is
    // dropped so it cannot read as a problem with the day now selected.
    const saveStatus = saveState.status === 'error' && saveState.date !== logDate
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
                    {/* Left of everything else, so the warning starts hard against
                        the sidebar. It carries a fixed width of its own (see
                        `.academic-alert`), so the day controls arriving on the
                        right cannot change how wide it is. */}
                    <AcademicAlertBanner />
                </div>
                {/* Everything that acts on the page -- change day, see history,
                    the options menu -- sits hard against the menu button on the
                    right, so the bar reads left to right as warning, then
                    controls. The warning keeps the left. */}
                <div className="navbar-slot navbar-slot--end">
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
                            {/* The only save feedback the navbar carries. "Saved
                                2:54:49 PM" was noise: the timestamp told the user
                                nothing they could act on, and the page already
                                reflects the change on its own. Errors stay, because
                                a silent failure is the one thing worth interrupting
                                for. */}
                            {saveStatus === 'error' && (
                                <div
                                    className="navbar-save-status navbar-save-status--error"
                                    role="status"
                                    aria-live="polite"
                                >
                                    <AlertTriangle size={12} aria-hidden="true" />
                                    {saveState.error || 'Save failed'}
                                </div>
                            )}
                        </>
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
            </div>
        </nav>
    );
};

export default Navbar;