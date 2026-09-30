const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Local-calendar `YYYY-MM-DD` for a Date (never UTC — see `isDateString`). */
export const toDateString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/** Today in the user's local timezone. */
export const todayString = (): string => toDateString(new Date());

/**
 * A `YYYY-MM-DD` string is only accepted if it round-trips, which rejects
 * overflow dates like `2026-02-31` and anything that `new Date` would parse
 * leniently. Every date the app puts in a URL must use local time, otherwise
 * anyone west of UTC sees the previous day.
 */
export const isDateString = (value: string | null | undefined): value is string => {
    if (!value || !DATE_STRING_PATTERN.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
};

/** Shift a `YYYY-MM-DD` string by whole days, staying in local time. */
export const addDays = (dateStr: string, delta: number): string => {
    if (!isDateString(dateStr)) return dateStr;
    const [y, m, d] = dateStr.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + delta);
    return toDateString(base);
};

/**
 * Short, unambiguous label for the navbar: `Today`, `Yesterday`, or
 * `Mon, Sep 29` (`Mon, Sep 29, 2027` once the year differs from this one).
 */
export const formatDayLabel = (dateStr: string): string => {
    if (!isDateString(dateStr)) return '';
    const today = todayString();
    if (dateStr === today) return 'Today';
    if (dateStr === addDays(today, -1)) return 'Yesterday';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString('en-US', sameYear
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
