import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Settings } from 'lucide-react';
import { navItems, isNavItemActive } from '../utils/navItems';
import { useAuthSession } from '../hooks/useAuthSession';
import { useAcademicAlerts } from '../hooks/useAcademicAlerts';
import { supabase } from '../services/supabaseClient';
import ConfirmModal from './ConfirmModal';

// The five most-used sections get a dedicated icon; everything else lives in
// the "More" sheet so no page becomes unreachable on a phone.
const PRIMARY_PATHS = ['/Daily-Log', '/Dashboard', '/Workouts', '/Notes', '/Profile'];

const MobileNavbar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuthSession();
    // The sheet records which route it was opened on and is only rendered while
    // that is still the current route, so a back/forward navigation closes it
    // without an effect.
    const [moreForPath, setMoreForPath] = useState<string | null>(null);
    const moreOpen = moreForPath === location.pathname;
    const openMore = useCallback(() => setMoreForPath(location.pathname), [location.pathname]);
    const closeMore = useCallback(() => setMoreForPath(null), []);

    // The deadline warning has no room on this bar, so it is a dot on More and
    // the dates themselves are on the Academic page behind it. Hooked here
    // rather than inside the sheet so the dot is on screen before the sheet is
    // ever opened, which is the whole point of it.
    const { data: alerts } = useAcademicAlerts();
    const hasUrgentDeadline = (alerts ?? []).some(alert => alert.urgent);

    // Settings and signing out live at the bottom of this sheet, not in navItems.
    // They were in the top navbar, which no longer exists, and navItems is a list
    // of pages -- so without these two a phone could not reach its own settings
    // or sign out at all.
    const [logoutConfirm, setLogoutConfirm] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    const doSignOut = async () => {
        setSigningOut(true);
        await supabase.auth.signOut();
        navigate('/login');
    };

    useEffect(() => {
        if (!moreOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeMore();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [moreOpen, closeMore]);

    if (!user) return null;

    const primaryItems = PRIMARY_PATHS
        .map(path => navItems.find(item => item.to === path))
        .filter((item): item is (typeof navItems)[number] => !!item);

    const moreItems = navItems.filter(item => !PRIMARY_PATHS.includes(item.to));

    const goTo = (to: string) => {
        closeMore();
        navigate(to);
    };

    return (
        <>
            <nav className="mobile-navbar" aria-label="Mobile navigation">
                {primaryItems.map(({ to, label, icon: Icon }) => (
                    <NavLink key={to} to={to} className={`mobile-navbar-link${isNavItemActive(location.pathname, to) ? ' active' : ''}`} aria-label={label}>
                        <Icon className="mobile-navbar-icon" size={26} strokeWidth={2} />
                    </NavLink>
                ))}
                <button
                    type="button"
                    className={`mobile-navbar-link${moreOpen ? ' active' : ''}`}
                    onClick={openMore}
                    aria-label="More pages"
                    aria-expanded={moreOpen}
                >
                    <Menu className="mobile-navbar-icon" size={26} strokeWidth={2} />
                    {hasUrgentDeadline && <span className="mobile-navbar-dot" aria-hidden="true" />}
                </button>
            </nav>

            {moreOpen && (
                <>
                    <div className="mobile-more-backdrop" onClick={closeMore} />
                    <div className="mobile-more-sheet" role="dialog" aria-label="More pages">
                        <div className="mobile-more-head">
                            <span className="mobile-more-title">More</span>
                            <button type="button" className="mobile-more-close" onClick={closeMore} aria-label="Close">&times;</button>
                        </div>
                        <div className="mobile-more-grid">
                            {moreItems.map(({ to, label, icon: Icon, external, href }) =>
                                external ? (
                                    <a
                                        key={to}
                                        className="mobile-more-link"
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={closeMore}
                                    >
                                        <Icon className="mobile-more-icon" aria-hidden="true" />
                                        {label}
                                    </a>
                                ) : (
                                    <button
                                        key={to}
                                        className="mobile-more-link"
                                        type="button"
                                        onClick={() => goTo(to)}
                                    >
                                        <Icon className="mobile-more-icon" aria-hidden="true" />
                                        {label}
                                    </button>
                                )
                            )}

                            <button
                                type="button"
                                className="mobile-more-link"
                                onClick={() => goTo('/Settings')}
                            >
                                <Settings className="mobile-more-icon" aria-hidden="true" />
                                Settings
                            </button>
                            <button
                                type="button"
                                className="mobile-more-link mobile-more-link--danger"
                                onClick={() => {
                                    closeMore();
                                    setLogoutConfirm(true);
                                }}
                            >
                                <LogOut className="mobile-more-icon" aria-hidden="true" />
                                Log out
                            </button>
                        </div>
                    </div>
                </>
                )}

            <ConfirmModal
                open={logoutConfirm}
                title="Sign out"
                confirmLabel="Sign Out"
                danger
                onConfirm={() => { void doSignOut(); }}
                onCancel={() => setLogoutConfirm(false)}
                busy={signingOut}
            />
        </>
    );
};


export default MobileNavbar;
