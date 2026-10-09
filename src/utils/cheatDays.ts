import { addDays, isDateString } from './dates';

/**
 * Cheat-day budgets.
 *
 * A cheat day used to be unconditionally free: `daily_logs.cheat_day` stops the
 * four food macros from counting, so the ring ignores what was eaten. That is
 * the right treatment for a planned break, but as an open-ended rule it is also
 * a hole -- every day could be a "cheat day" and the score would never say so.
 *
 * So the break is a budget. The user stores how many cheat days they allow and
 * over what window, and the Nth cheat day in a window is judged against it:
 * within the allowance it behaves as before (macros recorded, ignored), past it
 * the macros are pinned to 0 and counted (see `computeDailyScore`).
 *
 * The counting is deliberately by *date order within the window* rather than by
 * a running tally kept anywhere: the only fact stored per day is the boolean it
 * always had, and which day is the "extra" one falls out of sorting them. That
 * keeps the log the single source of truth and means no backfill is needed.
 *
 * Windows: `week` is the ISO week (Monday-Sunday); `month` is the calendar
 * month. Note that this is *not* the same week boundary as `dates.startOfWeek`,
 * which starts on Sunday because the year grid's columns are cut on Sunday. The
 * budget is about a person's week, and the plan settled on Monday.
 */

export type CheatDayPeriod = 'week' | 'month';

/** The only shape the helpers need; `DailyLog` satisfies it structurally. */
export interface CheatDayLog {
    log_date: string;
    cheat_day?: boolean | null;
}

export interface PeriodBounds {
    /** Inclusive first day of the window. */
    start: string;
    /** Inclusive last day of the window. */
    end: string;
}

/** Monday of the ISO week holding `dateStr`. */
export const startOfWeekMonday = (dateStr: string): string => {
    // `getDay()` is 0 on Sunday, so Sunday shifts back six days to reach the
    // Monday of its ISO week rather than staying put.
    const dow = new Date(`${dateStr}T00:00:00`).getDay();
    return addDays(dateStr, -((dow + 6) % 7));
};

/** The inclusive `[start, end]` calendar window `dateStr` falls in. */
export const periodBounds = (dateStr: string, period: CheatDayPeriod): PeriodBounds => {
    if (!isDateString(dateStr)) return { start: dateStr, end: dateStr };

    if (period === 'month') {
        const [y, m] = dateStr.split('-').map(Number);
        const month = String(m).padStart(2, '0');
        // Day 0 of the next month is the last day of this one, which handles
        // February and leap years without a table.
        const lastDay = new Date(y, m, 0).getDate();
        return {
            start: `${y}-${month}-01`,
            end: `${y}-${month}-${String(lastDay).padStart(2, '0')}`,
        };
    }

    const start = startOfWeekMonday(dateStr);
    return { start, end: addDays(start, 6) };
};

export interface CheatDayStatus {
    /** Cheat days in the window on or before `date`, including `date` itself if it is one. */
    used: number;
    /** The budget, or `null` for unlimited. */
    allowed: number | null;
    /** Whether `date`, as currently set, is a free cheat day. */
    exempt: boolean;
}

/**
 * Judge one day against the budget.
 *
 * `isCheat` is the day's value *as the form currently holds it*, not the stored
 * row: the caller is usually one toggle ahead of the database. Any log for the
 * same date is ignored for that reason, so the count is "every earlier cheat day
 * in the window, plus this one if it is one".
 *
 * Days after `date` are not counted, which is what stops a cheat day marked
 * later in the window from retroactively pushing an earlier one over budget.
 * Marking an out-of-order day can still change a *later* day's verdict without
 * that day being open, so the stored scores of the window's cheat days are
 * recomputed whenever one is toggled (see `services/cheatDayRecalc`).
 */
export const cheatDayStatus = (options: {
    logs: CheatDayLog[];
    date: string;
    isCheat: boolean;
    allowed: number | null | undefined;
    period: CheatDayPeriod;
}): CheatDayStatus => {
    const { logs, date, isCheat, allowed, period } = options;
    const budget = allowed ?? null;

    // A malformed or missing date still has to answer something; treat it as a
    // window of one so a lone cheat day is judged on its own.
    if (!isDateString(date)) {
        const used = isCheat ? 1 : 0;
        return { used, allowed: budget, exempt: budget === null || used <= budget };
    }

    const { start } = periodBounds(date, period);
    let earlier = 0;
    for (const log of logs) {
        if (log.log_date === date) continue;
        if (!log.cheat_day) continue;
        if (log.log_date < start || log.log_date > date) continue;
        earlier += 1;
    }

    const used = earlier + (isCheat ? 1 : 0);
    const exempt = budget === null || used <= budget;
    return { used, allowed: budget, exempt };
};
