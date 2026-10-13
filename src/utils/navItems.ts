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
    Timer,
    CircleUserRound,
    Network,
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
    // Sits directly under Journal because it is where the journal's ratings and
    // topic anchors are read back. Grouping them in the rail makes the
    // relationship obvious without needing a label to explain it.
    { to: '/Mind-Charts', label: 'Mind Charts', icon: Network },
    { to: '/Measurements', label: 'Measurements', icon: Ruler },
    { to: '/Books', label: 'Books', icon: BookOpen },
    { to: '/Workouts', label: 'Workouts', icon: Dumbbell },
    { to: '/Projects', label: 'Projects', icon: FolderKanban },
    { to: '/Abstinence', label: 'Abstinence', icon: Ban },
    { to: '/Academic', label: 'Academic', icon: GraduationCap },
    { to: '/Notes', label: 'Notes', icon: StickyNote },
    // Was `/Study-Timer` and "Study Timer", which described one narrow use of
    // what the page turned out to be. It is a clock now -- countdown, stopwatch,
    // intervals, alarms and a world clock -- so it is named for the page rather
    // than for the first thing anybody would have used it for. `/Study-Timer`
    // still redirects here, so old bookmarks land on it.
    { to: '/Timer', label: 'Timer', icon: Timer },
    { to: '/Profile', label: 'Profile', icon: CircleUserRound },
];

// Sub-routes keep their section highlighted: a workout template's week at
// /Workouts?template=X counts as Workouts, /Daily-Log/History as Daily Log, and
// so on.
export const isNavItemActive = (pathname: string, to: string): boolean => {
    const path = pathname.toLowerCase().replace(/\/+$/, '');
    const target = to.toLowerCase();
    return path === target || path.startsWith(target + '/');
};

// Every route gets its own navbar title because the pages no longer render a
// visible heading. Exact paths are matched first, then a parent segment
// (dynamic routes such as /Daily-Log/Edit/:id fall back to /Daily-Log).
const PAGE_TITLES: Record<string, string> = {
    '/credits': 'Credits',
    '/privacy-policy': 'Privacy Policy',
    '/terms-of-service': 'Terms of Service',
    '/Dashboard': 'Dashboard',
    '/Daily-Log/Setup': 'Daily Log Setup',
    '/Daily-Log': 'Daily Log',
    '/Daily-Log/History': 'Daily Log History',
    '/Journal': 'Journal',
    '/Journal/Edit': 'Edit Entry',
    '/Mind-Charts': 'Mind Charts',
    '/Measurements': 'Measurements',
    '/Books': 'Books',
    '/Workouts': 'Workouts',
    '/Projects': 'Projects',
    '/Abstinence': 'Abstinence',
    '/Academic': 'Academic',
    // No `/Study-Timer` entry. That route redirects to `/Timer`, so a title for
    // it would only ever be read during the redirect itself.
    '/Timer': 'Timer',
    '/Notes': 'Notes',
    // `/Settings` redirects to `/Settings/Security`, so the title for the
    // section is listed explicitly alongside App and Account rather than relying
    // on the walk-up fallback, which would label it "Settings".
    '/Settings': 'Settings',
    '/Settings/Security': 'Security',
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
