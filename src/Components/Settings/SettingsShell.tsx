import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    User, Target, Weight, Smartphone, LogOut, ShieldCheck, SlidersHorizontal,
} from 'lucide-react';

/**
 * The settings shell: navigation on the left, the section on the right.
 *
 * A shared component rather than a nested route layout, deliberately. Wrapping
 * the routes would have meant re-parenting `/Measurements` and `/Daily-Log/Setup`
 * under `/Settings` to give the rail something to live in, and those two are
 * deep-linked from the sidebar, from the daily log, and from notes. Changing
 * their URLs to suit a navigation frame is the wrong trade. Rendering the shell
 * per page keeps every existing link working and still gives the rail on every
 * settings screen.
 *
 * The rail highlights by route rather than by prop, so a section reached by a
 * deep link shows the same active state as one reached by clicking through. That
 * is the difference between a navigation frame and a list of buttons.
 */

interface SettingsItem {
    to: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    /**
     * Leaves the settings shell rather than opening a section in it.
     *
     * Rendered without the active treatment, because these land on their own
     * full-width pages which have no rail -- highlighting one of them would point
     * at a frame the user is not looking at.
     */
    external?: boolean;
    end?: boolean;
}

// Not exported: a component file that also exports a plain constant breaks Vite's
// fast-refresh boundary, and nothing outside this file needs the list.
const SETTINGS_ITEMS: SettingsItem[] = [
    {
        to: '/Settings',
        label: 'Overview',
        description: 'Everything at a glance',
        icon: <SlidersHorizontal size={18} />,
        end: true,
    },
    {
        to: '/Settings/Security',
        label: 'Security',
        description: 'App lock and page recovery',
        icon: <ShieldCheck size={18} />,
    },
    {
        to: '/Profile/Edit',
        label: 'Profile',
        description: 'Name, avatar, and account details',
        icon: <User size={18} />,
    },
    {
        to: '/Daily-Log/Setup',
        label: 'Daily log goals',
        description: 'Nutrition, sleep, and fitness targets',
        icon: <Target size={18} />,
        external: true,
    },
    {
        to: '/Measurements',
        label: 'Measurements',
        description: 'Weight, body fat, and progress',
        icon: <Weight size={18} />,
        external: true,
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
        description: 'Email and sign out',
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
                {SETTINGS_ITEMS.map(item => {
                    const inner = (
                        <>
                            <span className="settings-rail-icon" aria-hidden="true">{item.icon}</span>
                            <span className="settings-rail-text">
                                <span className="settings-rail-label">{item.label}</span>
                                <span className="settings-rail-desc">{item.description}</span>
                            </span>
                        </>
                    );

                    return (
                        <li key={item.to}>
                            {item.external ? (
                                // Not a NavLink: `end`/active styling would
                                // imply these open inside the shell.
                                <NavLink to={item.to} className="settings-rail-link is-external">
                                    {inner}
                                </NavLink>
                            ) : (
                                <NavLink
                                    to={item.to}
                                    end={item.end}
                                    className={({ isActive }) =>
                                        `settings-rail-link${isActive ? ' is-active' : ''}`}
                                >
                                    {inner}
                                </NavLink>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>

        <div className="settings-panel">
            {title && <h2 className="settings-panel-title">{title}</h2>}
            {children}
        </div>
    </div>
);

export default SettingsShell;