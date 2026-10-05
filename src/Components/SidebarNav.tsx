import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Settings } from 'lucide-react';
import { navItems, isNavItemActive } from '../utils/navItems';
import { useAuthSession } from '../hooks/useAuthSession';
import { supabase } from '../services/supabaseClient';
import AcademicAlertBanner from './AcademicAlertBanner';
import ConfirmModal from './ConfirmModal';

interface TooltipState {
    label: string;
    top: number;
}

const SHOW_DELAY = 120;
/** Gap between the icon and the menu, and the space kept off the window edges. */
const GAP = 8;
const MARGIN = 8;
/**
 * The menu's size, for the frame before it has been measured.
 *
 * Two rows and the padding around them, and the widest of them. Only ever used to
 * place the panel in the layout effect; the real measurement overrides it before
 * the panel is painted, so this is a guess that is corrected rather than a value
 * that has to be kept in step with the stylesheet.
 */
const MENU_HEIGHT = 84;
const MENU_WIDTH = 176;

/**
 * Where the panel goes, given the button's rect and the panel's own size.
 *
 * Right of the icon and level with its top, clamped inside the window. The button is
 * the last row of the rail, so upwards is the only room there is -- which is why the
 * panel's height has to be known before it can be placed at all, and why the height
 * passed in is an estimate on the first pass and the real measurement on the second.
 *
 * Null when there is no button to place against.
 */
const nextPos = (button: HTMLButtonElement | null, height: number, width: number) => {
    const anchor = button?.getBoundingClientRect();
    if (!anchor) return null;
    return {
        top: Math.max(
            MARGIN,
            Math.min(anchor.top - GAP - height, window.innerHeight - height - MARGIN),
        ),
        left: Math.max(
            MARGIN,
            Math.min(anchor.right + GAP, window.innerWidth - width - MARGIN),
        ),
    };
};

/**
 * The previous position when the new one is the same, so that setting it is a no-op.
 *
 * This is what makes the correction effect settle. `setPos` with a fresh object is
 * never equal to the previous one, so an effect that watches `pos` and writes a fresh
 * object on every pass re-triggers for ever, until React gives up on the nesting
 * depth and the panel never appears at all. Handing back the old object when nothing
 * moved turns the correction into a no-op instead.
 */
const nextPosIfMoved = (
    current: { top: number; left: number } | null,
    next: { top: number; left: number },
) => (current && current.top === next.top && current.left === next.left ? current : next);

/**
 * Desktop navigation: a full-height left rail at >=1024px. It replaces the
 * bottom bar on large screens, where twelve items were stretched across the full
 * width and ate into the vertical space of every page. Icons only.
 *
 * Three zones, top to bottom: the deadline warning, the pages, and the settings
 * menu. The top and bottom were the top navbar's job and came here when it went.
 *
 * The tooltip and the settings menu are portalled to <body> and positioned with
 * fixed coordinates because the rail scrolls (`overflow-y: auto`), which forces
 * `overflow-x` to `auto` and clips anything positioned inside it that reaches out
 * to the right of a 3.75rem rail. The menu was inline and was clipped by its own
 * container, so it opened below the page rather than over it. Native `title` was
 * replaced because it shows after a long delay, ignores keyboard focus styling
 * and renders in the OS style instead of the app's.
 */
const SidebarNav: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuthSession();
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const showTimer = useRef<number | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);
    const [logoutConfirm, setLogoutConfirm] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const toggleMenu = useCallback(() => {
        if (menuOpen) {
            setMenuOpen(false);
            setPos(null);
            return;
        }
        setMenuOpen(true);
        // Placed before the panel exists, from the button and the estimated size,
        // so the panel is drawn where it belongs on its first frame rather than at
        // the top left corner of the page until the effect corrects it.
        setPos(nextPos(menuButtonRef.current, MENU_HEIGHT, MENU_WIDTH));
    }, [menuOpen]);

    // Corrected once the panel is on screen and can be measured. A layout effect so
    // the correction lands before the paint.
    useLayoutEffect(() => {
        if (!menuOpen) return;
        const measured = nextPos(
            menuButtonRef.current,
            dropdownRef.current?.offsetHeight ?? MENU_HEIGHT,
            dropdownRef.current?.offsetWidth ?? MENU_WIDTH,
        );
        if (!measured) return;
        setPos(current => nextPosIfMoved(current, measured));
    }, [menuOpen]);

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

    // Escape closes, and so does a pointerdown anywhere else. Capture phase,
    // because the rail scrolls and the menu is portalled out of it.
    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
            }
        };
        const onDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (dropdownRef.current?.contains(target)) return;
            if (menuButtonRef.current?.contains(target)) return;
            setMenuOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown, true);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown, true);
        };
    }, [menuOpen]);

    if (!user) return null;

    const doSignOut = async () => {
        setSigningOut(true);
        await supabase.auth.signOut();
        navigate('/login');
    };

    return (
        <>
            <nav className="sidebar-nav" aria-label="Main sections">
                <div className="sidebar-nav-top">
                    <AcademicAlertBanner />
                </div>

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

                <div className="sidebar-nav-bottom">
                    <button
                        ref={menuButtonRef}
                        type="button"
                        className={`sidebar-nav-link sidebar-menu-btn${menuOpen ? ' active' : ''}`}
                        onClick={toggleMenu}
                        aria-label="Menu"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                    >
                        <Menu className="sidebar-nav-icon" aria-hidden="true" />
                    </button>
                </div>
            </nav>

            {/* Portalled to <body> and placed against the button's own rect, because
                the rail scrolls and anything positioned inside it is clipped by it --
                see `.sidebar-menu-dropdown`. */}
            {menuOpen &&
                pos &&
                createPortal(
                    <div
                        ref={dropdownRef}
                        className="sidebar-menu-dropdown"
                        role="menu"
                        style={{ top: pos.top, left: pos.left }}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            className="sidebar-menu-item"
                            onClick={() => {
                                setMenuOpen(false);
                                navigate('/Settings');
                            }}
                        >
                            <Settings size={15} aria-hidden="true" />
                            Settings
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="sidebar-menu-item sidebar-menu-item--danger"
                            onClick={() => {
                                setMenuOpen(false);
                                setLogoutConfirm(true);
                            }}
                        >
                            <LogOut size={15} aria-hidden="true" />
                            Logout
                        </button>
                    </div>,
                    document.body,
                )}

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

export default SidebarNav;
