import {
    LayoutDashboard,
    ClipboardList,
    NotebookPen,
    Ruler,
    BookOpen,
    Dumbbell,
    FolderKanban,
    Ban,
    GraduationCap,
    StickyNote,
    Hourglass,
    CircleUserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
    to: string;
    label: string;
    icon: LucideIcon;
    /** Off-site destinations open in a new tab instead of navigating. */
    external?: boolean;
    href?: string;
}

// Single source of truth for every navigation surface: the desktop sidebar,
// the tablet bottom bar, and the mobile "More" sheet all read from here so the
// three can't drift apart.
export const navItems: NavItem[] = [
    { to: '/Dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/Daily-Log', label: 'Daily Log', icon: ClipboardList },
    { to: '/Journal', label: 'Journal', icon: NotebookPen },
    { to: '/Measurements', label: 'Measurements', icon: Ruler },
    { to: '/Books', label: 'Books', icon: BookOpen },
    { to: '/Workouts', label: 'Workouts', icon: Dumbbell },
    { to: '/Projects', label: 'Projects', icon: FolderKanban },
    { to: '/Abstinence', label: 'Abstinence', icon: Ban },
    { to: '/Academic', label: 'Academic', icon: GraduationCap },
    { to: '/Notes', label: 'Notes', icon: StickyNote },
    { to: '/Study-Timer', label: 'Study Timer', icon: Hourglass },
    { to: '/Profile', label: 'Profile', icon: CircleUserRound },
];

// Sub-routes keep their section highlighted: /Workouts/Templates counts as
// Workouts, /Daily-Log/History as Daily Log, and so on.
export const isNavItemActive = (pathname: string, to: string): boolean => {
    const path = pathname.toLowerCase().replace(/\/+$/, '');
    const target = to.toLowerCase();
    return path === target || path.startsWith(target + '/');
};

// Every route gets its own navbar title because the pages no longer render a
// visible heading. Exact paths are matched first, then a parent segment
// (dynamic routes such as /Daily-Log/Edit/:id fall back to /Daily-Log).
const PAGE_TITLES: Record<string, string> = {
    '/login': 'Login',
    '/register': 'Register',
    '/forgot-password': 'Reset Password',
    '/credits': 'Credits',
    '/privacy-policy': 'Privacy Policy',
    '/terms-of-service': 'Terms of Service',
    '/Dashboard': 'Dashboard',
    '/Daily-Log/Setup': 'Daily Log Setup',
    '/Daily-Log': 'Daily Log',
    '/Daily-Log/History': 'Daily Log History',
    '/Journal': 'Journal',
    '/Journal/Edit': 'Edit Entry',
    '/Measurements': 'Measurements',
    '/Books': 'Books',
    '/Workouts': 'Workouts',
    '/Workouts/Templates': 'Templates',
    '/Workouts/Template': 'Edit Template',
    '/Projects': 'Projects',
    '/Abstinence': 'Abstinence',
    '/Academic': 'Academic',
    '/Study-Timer': 'Study Timer',
    '/Notes': 'Notes',
    '/Settings': 'Settings',
    '/Settings/App': 'App Settings',
    '/Settings/Account': 'Account',
    '/Profile': 'Profile',
    '/Profile/Edit': 'Edit Profile',
};

export const getPageTitle = (pathname: string): string => {
    const path = pathname.toLowerCase().replace(/\/+$/, '');
    if (!path) return '';

    const exact = Object.keys(PAGE_TITLES).find(
        (key) => key.toLowerCase() === path
    );
    if (exact) return PAGE_TITLES[exact];

    // Walk up the path so dynamic children inherit their parent's title.
    const segments = path.split('/');
    for (let i = segments.length - 1; i > 0; i--) {
        const parent = '/' + segments.slice(1, i).join('/');
        const hit = Object.keys(PAGE_TITLES).find(
            (key) => key.toLowerCase() === parent
        );
        if (hit) return PAGE_TITLES[hit];
    }
    return '';
};
