import React from 'react';
import { NavLink } from 'react-router-dom';
import { Smartphone, LogOut, ShieldCheck } from 'lucide-react';

/**
 * The settings shell: navigation on the left, the section on the right.
 *
 * A shared component rather than a nested route layout, deliberately. Wrapping
 * the routes would have meant re-parenting `/Measurements` and `/Daily-Log/Setup`
 * under `/Settings` to give the rail something to live in, and those two are
 * deep-linked from the sidebar, from the daily log, and from notes. Changing
 * their URLs to suit a navigation frame is the wrong trade.
 *
 * ONLY tabs that render here are listed. Profile, Daily log goals and
 * Measurements were in the rail before and left it again: each is a full-width
 * page with its own layout, so clicking one threw away the rail and the frame
 * that had just been drawn. A tab that navigates you somewhere else is not a
 * tab -- it is a link that looks like a tab, and the only thing it achieves is
 * an active state pointing at a screen that is no longer there. They remain
 * reachable from the sidebar and from their own pages.
 *
 * `/Settings` therefore redirects to `/Settings/Security`, so the rail is never
 * pointing at a page that is not one of these.
 *
 * The rail highlights by route rather than by prop, so a section reached by a
 * deep link shows the same active state as one reached by clicking through.
 */

interface SettingsItem {
    to: string;
    label: string;
    description: string;
    icon: React.ReactNode;
}

// Not exported: a component file that also exports a plain constant breaks Vite's
// fast-refresh boundary, and nothing outside this file needs the list.
const SETTINGS_ITEMS: SettingsItem[] = [
    {
        to: '/Settings/Security',
        label: 'Security',
        description: 'App lock, encryption, and page recovery',
        icon: <ShieldCheck size={18} />,
    },
    {
        to: '/Settings/App',
        label: 'App',
        description: 'Version, updates, and installation',
        icon: <Smartphone size={18} />,
    },
    {
        to: '/Settings/Account',
        label: 'Account',
        description: 'Your email, and signing out',
        icon: <LogOut size={18} />,
    },
];

interface SettingsShellProps {
    children: React.ReactNode;
    /** Optional heading shown above the content on the right. */
    title?: string;
}

const SettingsShell: React.FC<SettingsShellProps> = ({ children, title }) => (
    <div className="settings-shell">
        <nav className="settings-rail" aria-label="Settings sections">
            <div className="settings-rail-heading">Settings</div>
            <ul className="settings-rail-list">
                {SETTINGS_ITEMS.map(item => (
                    <li key={item.to}>
                        <NavLink
                            to={item.to}
                            className={({ isActive }) =>
                                `settings-rail-link${isActive ? ' is-active' : ''}`}
                        >
                            <span className="settings-rail-icon" aria-hidden="true">{item.icon}</span>
                            <span className="settings-rail-text">
                                <span className="settings-rail-label">{item.label}</span>
                                <span className="settings-rail-desc">{item.description}</span>
                            </span>
                        </NavLink>
                    </li>
                ))}
            </ul>
        </nav>

        <div className="settings-panel">
            {title && <h2 className="settings-panel-title">{title}</h2>}
            {children}
        </div>
    </div>
);

export default SettingsShell;