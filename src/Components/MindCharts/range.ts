import { addDays, todayString } from '../../utils/dates';

/**
 * The first date a window includes, as a `YYYY-MM-DD` string.
 *
 * Built from `addDays(todayString(), ...)` rather than from a millisecond
 * subtraction off the current time, for two reasons. It is a pure string
 * operation over local calendar days, so it does not drift with the hour the
 * render happens to land on. And a window starting at midnight actually *contains*
 * the last seven days, where `Date.now() - 7 * 86400000` quietly drops the oldest
 * one for most of the day.
 *
 * Its own module rather than an export from the band chart, for the same reason
 * `graph.ts` exists: `react-refresh` cannot hot-reload a module that exports both
 * a component and a helper, and both the chart and the tiles need this so they can
 * never disagree about which days they are describing.
 *
 * Null for "All Time", which the callers read as no lower bound at all.
 */
export const rangeStart = (days: number | null): string | null =>
    days === null ? null : addDays(todayString(), -days);