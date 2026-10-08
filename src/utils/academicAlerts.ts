import type { AcademicCourse, AcademicItem, ItemCategory } from './academicGpa';
import { ITEM_CATEGORIES } from './academicGpa';

/**
 * How close together two dated items have to be for the navbar to mention them
 * in one message rather than two. A user told "a test on the 21st" and then
 * finds one on the 22nd has been caught out; anything inside this window is
 * treated as one cluster, chained, so three tests in a fortnight all travel
 * together.
 */
export const CLUSTER_WINDOW_DAYS = 10.5;

/** Anything inside this is alarming enough to demand attention. */
export const URGENT_WITHIN_DAYS = 3;

export interface UpcomingEntry {
    item: AcademicItem;
    course: AcademicCourse;
    due: number;
    days: number;
}

export interface AcademicAlert {
    id: string;
    /**
     * The one line the navigation rail shows.
     *
     * Says what the work *is*, not how many subjects it spans. "3 exams in 5
     * days" tells you what to sit down and do; "3 subjects in 5 days" does not,
     * and it was the form the old grouping produced because it counted courses.
     */
    text: string;
    /** Days until the soonest item in this cluster. */
    days: number;
    count: number;
    urgent: boolean;
    entries: UpcomingEntry[];
}

/**
 * How each kind of work is named in a sentence, singular and plural.
 *
 * Plural is a separate string rather than an `s` appended, because "quiz" does
 * not take one.
 */
const CATEGORY_NOUNS: Record<ItemCategory, { one: string; many: string }> = {
    exam: { one: 'exam', many: 'exams' },
    homework: { one: 'homework', many: 'homeworks' },
    quiz: { one: 'quiz', many: 'quizzes' },
    project: { one: 'project', many: 'projects' },
    lab: { one: 'lab report', many: 'lab reports' },
    participation: { one: 'participation grade', many: 'participation grades' },
    other: { one: 'item', many: 'items' },
};

const nounFor = (category: ItemCategory) => CATEGORY_NOUNS[category] ?? CATEGORY_NOUNS.other;

const whenPhrase = (days: number): string => {
    if (days <= 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${pluralDays(days)}`;
};

/**
 * "exam" for one, "3 exams" for three.
 *
 * `always` forces the count on for a single item. The multi-item list is
 * truncated, so a bare noun sitting next to "+1 more" is indistinguishable from a
 * count that got cut off -- "2 quizzes · lab report +1 more" reads as three
 * things when it is four.
 */
const describeCategory = (
    category: ItemCategory,
    count: number,
    always = false,
): string => {
    const nouns = nounFor(category);
    if (count === 1) return always ? `1 ${nouns.one}` : nouns.one;
    return `${count} ${nouns.many}`;
};

const MS_PER_DAY = 86_400_000;

export const startOfToday = (now: Date = new Date()): number => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
};

/**
 * The instant something is due.
 *
 * A due_date is a plain calendar date, so on its own it is anchored to local
 * midnight. Comparing against "now" in UTC would put every item a day out near
 * midnight. When the item carries a clock time, that hour replaces the
 * midnight anchor, which turns "due on the 21st" into "due at 09:00 on the
 * 21st" -- the difference between a deadline that lapses at midnight and one
 * that lapses the moment the exam finishes.
 */
export const parseDueDate = (
    value: string | null | undefined,
    time?: string | null,
): number | null => {
    if (!value) return null;
    // Sliced to HH:MM: a value straight from `<input type="time">` is "HH:MM",
    // a value straight from Postgres is "HH:MM:SS", and "HH:MM:SS" is what the
    // date parser wants anyway while "HH:MM" is all it needs.
    const clock = time ? `T${time.slice(0, 5)}` : 'T00:00:00';
    const parsed = new Date(`${value.slice(0, 10)}${clock}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

export const daysBetween = (from: number, to: number): number => Math.round((to - from) / MS_PER_DAY);

/**
 * The moment a deadline passes: its hour when it has one, the end of its day
 * when it does not -- a plain due_date means "by the end of that day". Null for
 * undated work, which has no moment to pass.
 */
export const deadlineLapse = (
    item: Pick<AcademicItem, 'due_date' | 'due_time'>,
): number | null => {
    const due = parseDueDate(item.due_date, item.due_time);
    if (due === null) return null;
    return item.due_time ? due : due + MS_PER_DAY;
};

/**
 * Whether that moment has gone.
 *
 * The clock is read here rather than by the caller: a component that calls
 * `Date.now()` in its own render fails the purity check, and one deadline rule
 * shared by the academic rows and the dashboard's overdue card is worth more
 * than two slightly different readings of "past". Pass `now` to ask about a
 * fixed instant instead of this one.
 */
export const isPastDeadline = (
    item: Pick<AcademicItem, 'due_date' | 'due_time'>,
    now: number = Date.now(),
): boolean => {
    const lapse = deadlineLapse(item);
    return lapse !== null && lapse <= now;
};

const pluralDays = (days: number): string => `${days} day${days === 1 ? '' : 's'}`;

/** "21 May" - compact enough to sit inline on an input row. */
export const formatDayShort = (timestamp: number): string =>
    new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** "Wednesday 21 May" - the long form, for tooltips. */
export const formatDayFull = (timestamp: number): string =>
    new Date(timestamp).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

/**
 * Everything dated, still ungraded and not yet past its deadline.
 *
 * "Ungraded" is the filter that keeps this useful: a test already marked is
 * history, and a nagging reminder about work that is done is just noise.
 *
 * "Past" is measured differently depending on the deadline: an item with a
 * clock time lapses at that hour, so an exam that sat at 09:00 stops being
 * upcoming in the afternoon rather than lingering until midnight; an item
 * without one owns its whole day, as it always has.
 */
export const collectUpcoming = (
    courses: AcademicCourse[],
    items: AcademicItem[],
    now: Date = new Date(),
): UpcomingEntry[] => {
    const today = startOfToday(now);
    const nowMs = now.getTime();
    const courseById = new Map(courses.map(course => [course.id ?? '', course]));

    return items
        .flatMap(item => {
            const due = parseDueDate(item.due_date, item.due_time);
            if (due === null) return [];
            if (due < (item.due_time ? nowMs : today)) return [];
            if (item.score !== null && item.score !== undefined) return [];

            const course = courseById.get(item.course_id);
            if (!course) return [];

            return [{ item, course, due, days: daysBetween(today, due) }];
        })
        .sort((a, b) => a.due - b.due || a.item.name.localeCompare(b.item.name));
};

/**
 * Group upcoming items so a burst of deadlines reads as one warning.
 *
 * The window is measured between consecutive items and chained, so 21st, 22nd
 * and 30th are a single cluster: each is inside a week and a half of the one
 * before it, and warning about them one at a time would be three interruptions
 * for what is really one week of pressure.
 */
export const clusterUpcoming = (
    entries: UpcomingEntry[],
    windowDays: number = CLUSTER_WINDOW_DAYS,
): UpcomingEntry[][] => {
    if (entries.length === 0) return [];

    const clusters: UpcomingEntry[][] = [[entries[0]]];

    for (const entry of entries.slice(1)) {
        const current = clusters[clusters.length - 1];
        const previous = current[current.length - 1];
        if (entry.due - previous.due <= windowDays * MS_PER_DAY) current.push(entry);
        else clusters.push([entry]);
    }

    return clusters;
};

/**
 * One line per kind of work, not per course and not per deadline.
 *
 * Counting by course is what produced "3 subjects in 5 days", which is a
 * category of thing rather than a thing to do. Every item already carries the
 * type it was given on the Academic page, so the count is over that instead, and
 * the types are ranked by `ITEM_CATEGORIES` so an exam always reads before the
 * homework no matter what order the rows arrived in.
 */
const byCategory = (entries: UpcomingEntry[]): { category: ItemCategory; count: number }[] => {
    const counts = new Map<ItemCategory, number>();
    for (const entry of entries) {
        counts.set(entry.item.category, (counts.get(entry.item.category) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort(
            (a, b) =>
                ITEM_CATEGORIES.indexOf(a.category) - ITEM_CATEGORIES.indexOf(b.category),
        );
};

/** Types named before the count runs out. */
const LIMIT = 2;

const buildText = (entries: UpcomingEntry[]): string => {
    const soonest = entries[0];
    const when = whenPhrase(soonest.days);

    // One deadline is the whole message: the subject and the kind of work. This
    // is the common case and the only one where the course name fits.
    if (entries.length === 1) {
        return `${soonest.course.name} ${nounFor(soonest.item.category).one} ${when}`;
    }

    const groups = byCategory(entries);
    const shown = groups
        .slice(0, LIMIT)
        .map(group => describeCategory(group.category, group.count, true));
    const hidden = groups.length - shown.length;
    const list = hidden > 0 ? `${shown.join(' · ')} +${hidden} more` : shown.join(' · ');
    return `${list} ${when}`;
};

export const buildAcademicAlerts = (
    courses: AcademicCourse[],
    items: AcademicItem[],
    now: Date = new Date(),
): AcademicAlert[] =>
    clusterUpcoming(collectUpcoming(courses, items, now)).map((entries, index) => {
        const soonest = entries[0];
        return {
            id: `cluster-${index}-${soonest.item.id ?? ''}`,
            text: buildText(entries),
            days: soonest.days,
            count: entries.length,
            urgent: soonest.days <= URGENT_WITHIN_DAYS,
            entries,
        };
    });

/** The group a dated item belongs to, for the type labels in the dates column. */
export const categoryLabel = (category: ItemCategory): string =>
    ITEM_CATEGORIES.includes(category) ? category : 'other';