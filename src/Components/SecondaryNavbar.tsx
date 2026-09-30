import React, { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import type { User } from '@supabase/supabase-js';
import { navItems, isNavItemActive } from '../utils/navItems';

// Tablet navigation: the bottom pill bar, shown from 768px to 1023px. On
// >=1024px the SidebarNav rail takes over; below 768px MobileNavbar does.
const SecondaryNavbar: React.FC = () => {
    const pillRef = useRef<HTMLSpanElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const [user, setUser] = useState<User | null>(null);
    const isInitialRender = useRef(true);

    // Check authentication status
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Internal routes only - the external Study Timer link is never "active", so
    // it must not be a valid pill target. Memoised so getActiveTabIndex keeps a
    // stable identity and the pill effect doesn't re-run on every render.
    const internalItems = useMemo(() => navItems.filter(item => !item.external), []);

    // Match on the section, not the exact path, so /Workouts/Templates keeps
    // Workouts highlighted instead of falling back to the first tab.
    const getActiveTabIndex = useCallback(() => {
        const index = internalItems.findIndex(item => isNavItemActive(location.pathname, item.to));
        return index === -1 ? 0 : index;
    }, [location.pathname, internalItems]);

    // Set pill position on first render, on route change, and on resize
    useEffect(() => {
        const updatePillPosition = () => {
            const pill = pillRef.current;
            const container = tabsRef.current;
            if (!pill || !container) return;

            const activeTab = container.querySelector(`[data-index="${getActiveTabIndex()}"]`) as HTMLElement;
            if (!activeTab) return;

            const shouldAnimate = !isInitialRender.current;

            if (shouldAnimate) {
                // Animate transition on route change
                pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
                pill.style.width = `${activeTab.offsetWidth}px`;
            } else {
                // On initial render, snap to position without transition
                pill.style.transition = 'none';
                pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
                pill.style.width = `${activeTab.offsetWidth}px`;
                void pill.offsetWidth; // Force reflow
                pill.style.transition = '';
                isInitialRender.current = false;
            }
        };

        // Use multiple attempts to ensure DOM is ready
        const timer = setTimeout(updatePillPosition, 0);
        const timer2 = setTimeout(updatePillPosition, 100);

        // Update on resize
        window.addEventListener('resize', updatePillPosition);
        return () => {
            clearTimeout(timer);
            clearTimeout(timer2);
            window.removeEventListener('resize', updatePillPosition);
        };
    }, [getActiveTabIndex]);

    // Update pill on clicked tab
    const handleTabClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
        const pill = pillRef.current;
        if (pill) {
            pill.style.transform = `translateX(${e.currentTarget.offsetLeft}px)`;
            pill.style.width = `${e.currentTarget.offsetWidth}px`;
        }
    }, []);

    // Don't render if no user (after hooks)
    if (!user) return null;

    return (
        <nav className="secondary-navbar" aria-label="Secondary navigation">
            <div className="secondary-navbar-inner" ref={tabsRef} role="tablist">
                <span className="secondary-tabs-pill" ref={pillRef} aria-hidden="true"></span>
                {internalItems.map((item, index) => {
                    const active = isNavItemActive(location.pathname, item.to);
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={`secondary-navbar-link${active ? ' active' : ''}`}
                            role="tab"
                            aria-current={active ? 'page' : undefined}
                            data-index={index}
                            onClick={handleTabClick}
                        >
                            {item.label}
                        </NavLink>
                    );
                })}
                {/* External Study Timer link */}
                {navItems.filter(item => item.external).map(item => (
                    <a
                        key={item.to}
                        href={item.href}
                        className="secondary-navbar-link study-timer-external"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${item.label} in new tab`}
                    >
                        <item.icon className="secondary-navbar-external-icon" aria-hidden="true" />
                    </a>
                ))}
            </div>
        </nav>
    );
};

export default SecondaryNavbar;
