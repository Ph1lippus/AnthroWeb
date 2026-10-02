import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { navItems, isNavItemActive } from '../utils/navItems';
import { useAuthSession } from '../hooks/useAuthSession';

interface TooltipState {
    label: string;
    top: number;
}

const SHOW_DELAY = 120;

// Desktop navigation: a full-height left rail of icons at >=1024px. It replaces
// the bottom pill bar on large screens, where 12 items were stretched across the
// full width and ate into the vertical space of every page. Icons only.
//
// The tooltip is portalled to <body> and positioned with fixed coordinates
// because the rail scrolls (`overflow-y: auto`), which forces `overflow-x` to
// `auto` and would clip an absolutely positioned tooltip. Native `title` was
// replaced because it shows after a long delay, ignores keyboard focus styling
// and renders in the OS style instead of the app's.
const SidebarNav: React.FC = () => {
    const location = useLocation();
    const { user } = useAuthSession();
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const showTimer = useRef<number | null>(null);

    // A pending timer must never fire after the pointer has already left.
    useEffect(() => () => {
        if (showTimer.current !== null) window.clearTimeout(showTimer.current);
    }, []);

    const open = useCallback((label: string, el: HTMLElement) => {
        if (showTimer.current !== null) window.clearTimeout(showTimer.current);
        showTimer.current = window.setTimeout(() => {
            const rect = el.getBoundingClientRect();
            setTooltip({ label, top: rect.top + rect.height / 2 });
        }, SHOW_DELAY);
    }, []);

    const close = useCallback(() => {
        if (showTimer.current !== null) window.clearTimeout(showTimer.current);
        setTooltip(null);
    }, []);

    if (!user) return null;

    return (
        <>
            <nav className="sidebar-nav" aria-label="Main sections">
                <div className="sidebar-nav-list">
                    {navItems.map(item => {
                        const Icon = item.icon;
                        const handlers = {
                            onMouseEnter: (e: React.MouseEvent<HTMLElement>) => open(item.label, e.currentTarget),
                            onMouseLeave: close,
                            onFocus: (e: React.FocusEvent<HTMLElement>) => open(item.label, e.currentTarget),
                            onBlur: close,
                        };

                        if (item.external) {
                            return (
                                <a
                                    key={item.to}
                                    href={item.href}
                                    className="sidebar-nav-link"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Open ${item.label} in new tab`}
                                    {...handlers}
                                >
                                    <Icon className="sidebar-nav-icon" aria-hidden="true" />
                                </a>
                            );
                        }
                        const active = isNavItemActive(location.pathname, item.to);
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={`sidebar-nav-link${active ? ' active' : ''}`}
                                aria-current={active ? 'page' : undefined}
                                aria-label={item.label}
                                {...handlers}
                            >
                                <Icon className="sidebar-nav-icon" aria-hidden="true" />
                            </NavLink>
                        );
                    })}
                </div>
            </nav>

            {tooltip && createPortal(
                <div
                    className="sidebar-tooltip"
                    role="tooltip"
                    style={{ top: tooltip.top }}
                >
                    {tooltip.label}
                    <span className="sidebar-tooltip-arrow" aria-hidden="true" />
                </div>,
                document.body
            )}
        </>
    );
};

export default SidebarNav;
