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
    /** The full sentence shown in the navbar. */
    message: string;
    /** Short form for narrow layouts. */
    shortMessage: string;
    /** Days until the soonest item in this cluster. */
    days: number;
    count: number;
    urgent: boolean;
    entries: UpcomingEntry[];
}

const MS_PER_DAY = 86_400_000;

export const startOfToday = (now: Date = new Date()): number => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
};

/**
 * A due_date is a plain calendar date, so it is anchored to local midnight.
 * Comparing against "now" in UTC would put every item a day out near midnight.
 */
export const parseDueDate = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

export const daysBetween = (from: number, to: number): number => Math.round((to - from) / MS_PER_DAY);

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
 * Everything dated, still ungraded and not yet past its date.
 *
 * "Ungraded" is the filter that keeps this useful: a test already marked is
 * history, and a nagging reminder about work that is done is just noise.
 */
export const collectUpcoming = (
    courses: AcademicCourse[],
    items: AcademicItem[],
    now: Date = new Date(),
): UpcomingEntry[] => {
    const today = startOfToday(now);
    const courseById = new Map(courses.map(course => [course.id ?? '', course]));

    return items
        .flatMap(item => {
            const due = parseDueDate(item.due_date);
            if (due === null || due < today) return [];
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
 * One line per subject, not per deadline.
 *
 * Deliberately not the item's own name: auto-named inputs read as "First Exam"
 * and "Second Exam", so naming them turns the warning into a list of
 * placeholders. What the user needs is which subjects the deadlines belong to
 * and how long there is, and a subject with three deadlines in a fortnight is
 * one thing to worry about, not three.
 */
const bySubject = (entries: UpcomingEntry[]): { course: AcademicCourse; soonest: UpcomingEntry; count: number }[] => {
    const groups = new Map<string, { course: AcademicCourse; soonest: UpcomingEntry; count: number }>();

    for (const entry of entries) {
        const key = entry.course.id ?? entry.course.name;
        const existing = groups.get(key);
        if (!existing) groups.set(key, { course: entry.course, soonest: entry, count: 1 });
        else existing.count++;
    }

    return [...groups.values()];
};

const describeGroup = (group: { course: AcademicCourse; soonest: UpcomingEntry; count: number }): string =>
    group.count > 1
        ? `${group.course.name} ×${group.count} in ${pluralDays(group.soonest.days)}`
        : `${group.course.name} in ${pluralDays(group.soonest.days)}`;

/** Keep the sentence readable rather than an endless list. */
const LIMIT = 3;

const summarise = (groups: ReturnType<typeof bySubject>): string => {
    const shown = groups.slice(0, LIMIT).map(describeGroup);
    const hidden = groups.length - shown.length;
    return hidden > 0 ? `${shown.join(' · ')} · +${hidden} more` : shown.join(' · ');
};

export const buildAcademicAlerts = (
    courses: AcademicCourse[],
    items: AcademicItem[],
    now: Date = new Date(),
): AcademicAlert[] =>
    clusterUpcoming(collectUpcoming(courses, items, now)).map((entries, index) => {
        const soonest = entries[0];
        const groups = bySubject(entries);

        const message =
            groups.length === 1
                ? `Next deadline: ${describeGroup(groups[0])}`
                : `${entries.length} deadlines within ${CLUSTER_WINDOW_DAYS} days — ${summarise(groups)}`;

        const shortMessage =
            groups.length === 1
                ? describeGroup(groups[0])
                : `${groups.length} subjects in ${pluralDays(soonest.days)}`;

        return {
            id: `cluster-${index}-${soonest.item.id ?? ''}`,
            message,
            shortMessage,
            days: soonest.days,
            count: entries.length,
            urgent: soonest.days <= URGENT_WITHIN_DAYS,
            entries,
        };
    });

/** The group a dated item belongs to, for the type labels in the dates column. */
export const categoryLabel = (category: ItemCategory): string =>
    ITEM_CATEGORIES.includes(category) ? category : 'other';