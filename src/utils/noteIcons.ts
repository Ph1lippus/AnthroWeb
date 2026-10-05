import {
    Activity,
    Anchor,
    Apple,
    Award,
    Bell,
    BookMarked,
    BookOpen,
    Bookmark,
    Brain,
    Briefcase,
    Bug,
    Calculator,
    Calendar,
    Camera,
    Car,
    CircleCheck,
    ClipboardList,
    Clock,
    CodeXml,
    Coffee,
    Compass,
    Database,
    Dumbbell,
    Feather,
    File,
    FileText,
    Flag,
    FlaskConical,
    Gift,
    GitBranch,
    Globe,
    GraduationCap,
    Hash,
    Heart,
    HeartPulse,
    House,
    Key,
    Layers,
    Lightbulb,
    ListChecks,
    Lock,
    Map as MapIcon,
    Microscope,
    Moon,
    Music,
    NotebookPen,
    Palette,
    PenLine,
    Plane,
    Repeat,
    Rocket,
    Scale,
    Search,
    Settings,
    ShoppingBag,
    Sigma,
    Sparkles,
    Sprout,
    Star,
    StickyNote,
    Tag,
    Target,
    Terminal,
    Timer,
    TriangleAlert,
    Trophy,
    Users,
    Wallet,
    Workflow,
    Wrench,
    Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The icons a page can carry.
 *
 * Lucide rather than emoji, which is the change that makes these look like part
 * of this app instead of pasted onto it. Emoji are colour bitmaps: they cannot be
 * tinted, they carry their own palette, and set in a 2.2rem slot above a JetBrains
 * Mono title they read as clip art. Lucide is the same 24px grid, the same stroke
 * weight and the same outline as every other icon in the interface, so a page icon
 * takes the page's colour from the same `--color-primary` the sidebar does.
 *
 * Stored by lucide name, which is also what makes them searchable and groupable
 * here without a glyph database.
 */

export interface NoteIcon {
    /** The lucide export name. This is what `notes_icon` holds. */
    id: string;
    label: string;
    Icon: LucideIcon;
}

/**
 * Grouped, because a flat wall of sixty icons is a worse picker than the sixteen
 * it replaces -- the problem was never only how many there were, it was that none
 * of them were findable. Sections give the eye somewhere to start, which is the
 * same reason Notion and Finder both do it.
 */
export const NOTE_ICON_GROUPS: { group: string; icons: NoteIcon[] }[] = [
    {
        group: 'Pages',
        icons: [
            { id: 'FileText', label: 'Page', Icon: FileText },
            { id: 'NotebookPen', label: 'Notebook', Icon: NotebookPen },
            { id: 'File', label: 'Document', Icon: File },
            { id: 'StickyNote', label: 'Note', Icon: StickyNote },
            { id: 'Bookmark', label: 'Bookmark', Icon: Bookmark },
            { id: 'BookMarked', label: 'Saved', Icon: BookMarked },
            { id: 'BookOpen', label: 'Reading', Icon: BookOpen },
            { id: 'Layers', label: 'Layers', Icon: Layers },
            { id: 'PenLine', label: 'Draft', Icon: PenLine },
            { id: 'ListChecks', label: 'Checklist', Icon: ListChecks },
        ],
    },
    {
        group: 'Study',
        icons: [
            { id: 'GraduationCap', label: 'Course', Icon: GraduationCap },
            { id: 'Lightbulb', label: 'Idea', Icon: Lightbulb },
            { id: 'Brain', label: 'Theory', Icon: Brain },
            { id: 'Microscope', label: 'Research', Icon: Microscope },
            { id: 'FlaskConical', label: 'Experiment', Icon: FlaskConical },
            { id: 'Calculator', label: 'Numbers', Icon: Calculator },
            { id: 'Sigma', label: 'Formula', Icon: Sigma },
            { id: 'Timer', label: 'Timed', Icon: Timer },
            { id: 'Compass', label: 'Explore', Icon: Compass },
        ],
    },
    {
        group: 'Work',
        icons: [
            { id: 'Briefcase', label: 'Work', Icon: Briefcase },
            { id: 'Target', label: 'Goal', Icon: Target },
            { id: 'Zap', label: 'Energy', Icon: Zap },
            { id: 'Rocket', label: 'Launch', Icon: Rocket },
            { id: 'Workflow', label: 'Process', Icon: Workflow },
            { id: 'ClipboardList', label: 'Tasks', Icon: ClipboardList },
            { id: 'Wrench', label: 'Build', Icon: Wrench },
            { id: 'Settings', label: 'Config', Icon: Settings },
            { id: 'GitBranch', label: 'Branch', Icon: GitBranch },
            { id: 'Terminal', label: 'Console', Icon: Terminal },
            { id: 'CodeXml', label: 'Code', Icon: CodeXml },
            { id: 'Database', label: 'Data', Icon: Database },
            { id: 'Wallet', label: 'Money', Icon: Wallet },
            { id: 'Award', label: 'Result', Icon: Award },
        ],
    },
    {
        group: 'Health',
        icons: [
            { id: 'HeartPulse', label: 'Vitals', Icon: HeartPulse },
            { id: 'Activity', label: 'Activity', Icon: Activity },
            { id: 'Dumbbell', label: 'Training', Icon: Dumbbell },
            { id: 'Apple', label: 'Nutrition', Icon: Apple },
            { id: 'Moon', label: 'Sleep', Icon: Moon },
            { id: 'Scale', label: 'Weight', Icon: Scale },
            { id: 'Sprout', label: 'Recovery', Icon: Sprout },
            { id: 'Bug', label: 'Symptoms', Icon: Bug },
            { id: 'Heart', label: 'Health', Icon: Heart },
        ],
    },
    {
        group: 'Life',
        icons: [
            { id: 'House', label: 'Home', Icon: House },
            { id: 'Users', label: 'People', Icon: Users },
            { id: 'Map', label: 'Place', Icon: MapIcon },
            { id: 'Plane', label: 'Travel', Icon: Plane },
            { id: 'Car', label: 'Car', Icon: Car },
            { id: 'ShoppingBag', label: 'Shopping', Icon: ShoppingBag },
            { id: 'Music', label: 'Music', Icon: Music },
            { id: 'Camera', label: 'Photos', Icon: Camera },
            { id: 'Coffee', label: 'Coffee', Icon: Coffee },
            { id: 'Anchor', label: 'Anchor', Icon: Anchor },
            { id: 'Feather', label: 'Writing', Icon: Feather },
            { id: 'Trophy', label: 'Wins', Icon: Trophy },
            { id: 'Gift', label: 'Gifts', Icon: Gift },
        ],
    },
    {
        group: 'Symbols',
        icons: [
            { id: 'Star', label: 'Star', Icon: Star },
            { id: 'Flag', label: 'Flag', Icon: Flag },
            { id: 'Bell', label: 'Reminder', Icon: Bell },
            { id: 'Calendar', label: 'Schedule', Icon: Calendar },
            { id: 'Clock', label: 'Recent', Icon: Clock },
            { id: 'Tag', label: 'Tagged', Icon: Tag },
            { id: 'Hash', label: 'Topic', Icon: Hash },
            { id: 'Key', label: 'Key', Icon: Key },
            { id: 'Lock', label: 'Private', Icon: Lock },
            { id: 'Search', label: 'Search', Icon: Search },
            { id: 'Globe', label: 'Web', Icon: Globe },
            { id: 'Palette', label: 'Design', Icon: Palette },
            { id: 'Sparkles', label: 'New', Icon: Sparkles },
            { id: 'CircleCheck', label: 'Done', Icon: CircleCheck },
            { id: 'TriangleAlert', label: 'Warning', Icon: TriangleAlert },
            { id: 'Repeat', label: 'Recurring', Icon: Repeat },
        ],
    },
];

/** Flat lookup, for resolving a stored value without walking the groups. */
const BY_ID = new Map<string, NoteIcon>(
    NOTE_ICON_GROUPS.flatMap(entry => entry.icons).map(icon => [icon.id, icon]),
);

/** The sixteen emoji the old picker wrote, mapped onto their lucide equivalents. */
const LEGACY_EMOJI: Record<string, string> = {
    '📄': 'FileText',
    '📝': 'NotebookPen',
    '📌': 'Bookmark',
    '⭐': 'Star',
    '💡': 'Lightbulb',
    '🔥': 'Zap',
    '📚': 'BookOpen',
    '🎯': 'Target',
    '🧠': 'Brain',
    '⚙️': 'Settings',
    '🧪': 'FlaskConical',
    '💻': 'CodeXml',
    '🌱': 'Sprout',
    '✅': 'CircleCheck',
    '❗': 'TriangleAlert',
    '🎓': 'GraduationCap',
};

/** What a page with no icon gets. `null` means "draw nothing". */
export const resolveNoteIcon = (value: string | null | undefined): NoteIcon | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const id = LEGACY_EMOJI[trimmed] ?? trimmed;
    return BY_ID.get(id) ?? null;
};

/**
 * Whether a stored value is something the picker can put back.
 *
 * Separate from `resolveNoteIcon` because the two answer different questions: a
 * value may resolve to an icon while still being an unrecognised string, and only
 * the second is worth telling the caller about -- otherwise an old row is
 * rewritten the moment the page is opened.
 */
export const isKnownNoteIcon = (value: string | null | undefined): boolean => {
    if (!value) return true;
    const trimmed = value.trim();
    return !trimmed || trimmed in LEGACY_EMOJI || BY_ID.has(trimmed);
};
