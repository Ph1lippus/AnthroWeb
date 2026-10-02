import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { navItems, isNavItemActive } from '../utils/navItems';
import { useAuthSession } from '../hooks/useAuthSession';

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
                                        href={href}
                                        className="mobile-more-link"
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
                                        type="button"
                                        className={`mobile-more-link${isNavItemActive(location.pathname, to) ? ' active' : ''}`}
                                        onClick={() => goTo(to)}
                                    >
                                        <Icon className="mobile-more-icon" aria-hidden="true" />
                                        {label}
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    );
};

export default MobileNavbar;
