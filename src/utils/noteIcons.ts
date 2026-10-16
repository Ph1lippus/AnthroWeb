import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The icons a page can carry.
 *
 * Stored by lucide *name*, which is both the value in `notes_icon` and the key
 * into lucide's own export table. Resolving a name means looking it up in that
 * table at runtime rather than walking a hand-maintained list, which is why
 * "many more options" here costs almost nothing: instead of the old 70-entry
 * registry, every export the lucide package ships (roughly a thousand and a
 * half) is available to a search without the bundle of hand-edited code.
 *
 * The original sixteen-to-seventy list was right to group and label them; the
 * failure was that it stopped at a small number. Grouping survives (the picker
 * still opens onto named sections) but the *searchable* set behind it is the
 * whole lucide catalogue, so "gym", "timer", "money" and everything else land on
 * something even when it is not in the hand-picked sections.
 */

export interface NoteIcon {
    id: string;
    label: string;
    Icon: LucideIcon;
}

const splitCamel = (name: string): string =>
    name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        // Strip a trailing "Icon" suffix the older lucide exports carried; the
        // current ones do not, and leaving it on would make every result read
        // "Page Icon".
        .replace(/\bIcon\b/g, '')
        .trim();

/** The whole catalogue, built once from lucide's export table. */
const ALL_ENTRIES: NoteIcon[] = [];
for (const name of Object.keys(LucideIcons)) {
    const component = (LucideIcons as Record<string, unknown>)[name];
    // Lucide exports these as `forwardRef` objects in some React versions,
    // so a bare `typeof === 'function'` check rejects every icon and the
    // picker ends up empty. Accept both shapes.
    if (typeof component !== 'function' && !(typeof component === 'object' && component !== null && '$$typeof' in component)) continue;
    if (name === 'default' || name === 'icons' || name === 'createLucideIcon' || name === 'Icon') continue;
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) continue;
    ALL_ENTRIES.push({
        id: name,
        label: splitCamel(name),
        Icon: component as LucideIcon,
    });
}

const BY_ID = new Map<string, NoteIcon>(ALL_ENTRIES.map(icon => [icon.id, icon]));

/** What a page with no icon gets. `null` means "draw nothing". */
export const resolveNoteIcon = (value: string | null | undefined): NoteIcon | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return BY_ID.get(trimmed) ?? null;
};

export const isKnownNoteIcon = (value: string | null | undefined): boolean => {
    if (!value) return true;
    const trimmed = value.trim();
    return !trimmed || BY_ID.has(trimmed);
};

/**
 * Keyword aliases -- things people type instead of component names.
 *
 * Not the icon's name, which is the only discoverable handle otherwise ("gym"
 * lands on nothing because the glyph is called Dumbbell). Kept small and
 * extendable; a single misspelled search just returns empty rather than lying.
 */
export const NOTE_ICON_ALIASES: Record<string, readonly string[]> = {
    Dumbbell: ['gym', 'training', 'weights', 'workout', 'muscle'],
    BookOpen: ['reading', 'book', 'study'],
    GraduationCap: ['school', 'college', 'uni', 'course', 'study', 'learn'],
    Apple: ['nutrition', 'food', 'diet', 'meal', 'calories', 'protein'],
    Moon: ['sleep', 'night', 'rest'],
    Scale: ['weight', 'measure'],
    HeartPulse: ['vitals', 'health', 'heart', 'pulse', 'pressure'],
    Brain: ['thinking', 'mind', 'theory'],
    Lightbulb: ['idea', 'insight', 'thought'],
    Timer: ['timed', 'pomodoro', 'study timer'],
    Wallet: ['money', 'finance', 'budget'],
    Rocket: ['launch', 'start', 'project'],
    Target: ['goal', 'aim'],
    Trophy: ['win', 'award', 'achievement'],
    Flag: ['flag', 'mark'],
    Star: ['star', 'favourite'],
    Bug: ['bug', 'symptom', 'sick'],
    Sprout: ['recovery', 'rest', 'grow'],
    Wrench: ['build', 'fix', 'tool'],
    Terminal: ['console', 'cli', 'terminal'],
    CodeXml: ['code', 'dev', 'programming'],
    Database: ['data', 'db', 'storage'],
    Globe: ['web', 'site', 'internet', 'world'],
    Lock: ['private', 'lock', 'secret'],
    Eye: ['focus', 'look', 'watch'],
    ChartLine: ['chart', 'stats', 'dashboard'],
    Plus: ['add', 'create', 'new'],
    Coffee: ['coffee', 'break'],
    Music: ['music', 'audio'],
    Plane: ['travel', 'trip', 'flight'],
    Car: ['car', 'drive', 'vehicle'],
    House: ['home', 'house'],
    Users: ['people', 'team', 'family'],
    Map: ['place', 'map', 'location'],
    ShoppingBag: ['shopping', 'shop'],
    Camera: ['photos', 'pictures', 'image'],
    Anchor: ['anchor'],
    Feather: ['writing', 'compose', 'edit'],
    Palette: ['colour', 'color', 'design'],
    Sparkles: ['new', 'sparkle', 'shine', 'ai'],
    Bell: ['reminder', 'alert', 'notice'],
    Calendar: ['schedule', 'calendar', 'date'],
    Clock: ['recent', 'time', 'hour'],
    Tag: ['tag', 'tagged', 'label'],
    Hash: ['hash', 'topic', 'hashtag'],
    Key: ['key', 'access'],
    Search: ['search', 'find'],
    Repeat: ['recurring', 'repeat', 'cycle'],
    ListChecks: ['checklist', 'todo', 'tasks'],
    ClipboardList: ['list', 'tasks', 'checklist'],
    Workflow: ['workflow', 'process'],
    Settings: ['settings', 'config', 'preferences'],
    GitBranch: ['branch', 'git', 'version'],
    Award: ['award', 'result'],
    Activity: ['activity', 'movement'],
    Compass: ['explore', 'navigate', 'compass'],
    FlaskConical: ['experiment', 'science', 'lab'],
    Microscope: ['research', 'study'],
    Sigma: ['formula', 'math', 'science'],
    Calculator: ['numbers', 'calculate'],
    NotebookPen: ['notebook', 'journal', 'write'],
};

export const NOTE_ICON_GROUPS: { group: string; ids: readonly string[] }[] = [
    {
        group: 'Pages',
        ids: [
            'FileText', 'NotebookPen', 'File', 'StickyNote', 'Bookmark', 'BookMarked', 'BookOpen',
            'Layers', 'PenLine', 'ListChecks', 'ClipboardList', 'Folder', 'FolderOpen', 'FileCode',
            'Paperclip', 'Archive', 'Save', 'Clipboard', 'Link', 'Share2', 'ExternalLink',
        ],
    },
    {
        group: 'Study',
        ids: [
            'GraduationCap', 'Lightbulb', 'Brain', 'Microscope', 'FlaskConical', 'Calculator',
            'Sigma', 'Timer', 'Compass', 'BookOpen', 'LibraryBig', 'Pencil', 'Eraser',
            'Highlighter', 'Ruler', 'BookMarked', 'Glasses', 'Puzzle',
        ],
    },
    {
        group: 'Work',
        ids: [
            'Briefcase', 'Target', 'Zap', 'Rocket', 'Workflow', 'Wrench', 'Settings', 'GitBranch',
            'Terminal', 'CodeXml', 'Database', 'Wallet', 'Award', 'ListTodo', 'KanbanSquare',
            'FolderKanban', 'ChartLine', 'Network', 'Boxes', 'Package', 'ClipboardList',
        ],
    },
    {
        group: 'Health',
        ids: [
            'HeartPulse', 'Activity', 'Dumbbell', 'Apple', 'Moon', 'Scale', 'Sprout', 'Bug',
            'Heart', 'Stethoscope', 'Pill', 'Smile', 'Bed', 'Thermometer', 'BicepsFlexed',
        ],
    },
    {
        group: 'Life',
        ids: [
            'House', 'Users', 'Map', 'Plane', 'Car', 'ShoppingBag', 'Music', 'Camera', 'Coffee',
            'Anchor', 'Feather', 'Trophy', 'Gift', 'Dog', 'Cat', 'TreePine', 'Sun', 'Cloud',
            'Home', 'Sparkles',
        ],
    },
    {
        group: 'Symbols',
        ids: [
            'Star', 'Flag', 'Bell', 'Calendar', 'Clock', 'Tag', 'Hash', 'Key', 'Lock', 'Search',
            'Globe', 'Palette', 'CircleCheck', 'TriangleAlert', 'Repeat', 'Pin', 'Check', 'X',
            'Info', 'AlertCircle', 'HelpCircle', 'Plus', 'Minus', 'RefreshCw', 'RotateCcw',
        ],
    },
];

/** Icons a search result should be restricted to -- excludes the trivial ones that
 *  only muddy "all results". */
export const findNoteIcons = (query: string): NoteIcon[] => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const tokens = needle.split(/\s+/).filter(Boolean);
    // Alias matching: an icon matches if it appears under one of its alias keywords.
    const aliasMatch = (icon: NoteIcon): boolean => {
        const aliases = NOTE_ICON_ALIASES[icon.id] ?? [];
        return aliases.some(alias => tokens.every(t => alias.toLowerCase().includes(t)));
    };
    const score = (icon: NoteIcon): number => {
        const label = icon.label.toLowerCase();
        const id = icon.id.toLowerCase();
        let s = 0;
        for (const t of tokens) {
            if (label === t || id === t) s += 100;
            else if (label.startsWith(t) || id.startsWith(t)) s += 40;
            else if (label.includes(t) || id.includes(t)) s += 10;
            else if (aliasMatch(icon)) s += 5;
            else return -1;
        }
        return s + (aliasMatch(icon) ? 1 : 0);
    };
    const results = ALL_ENTRIES.map(icon => ({ icon, score: score(icon) }))
        .filter(entry => entry.score >= 0)
        .sort((a, b) => b.score - a.score || a.icon.label.localeCompare(b.icon.label))
        .slice(0, 120)
        .map(entry => entry.icon);

    if (results.length === 0 && aliasMatch === undefined) return [];
    return results;
};

// Stubs kept for caller compat above.
export const ALL_NOTE_ICON_ENTRIES = ALL_ENTRIES;
