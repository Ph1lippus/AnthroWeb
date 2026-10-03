/**
 * The one rule connecting a journal entry to the "Journaled" habit tick.
 *
 * `daily_logs` carries both a `journal_entry` (the prose) and a `journal`
 * boolean (the habit tick that feeds `habitGroupScore` and the dashboard habit
 * charts). They are the same fact written down twice, so something has to keep
 * them together -- and it is done here, in one function, rather than as a
 * `journal_entry ? true : journal` expression repeated across the three pages
 * that can edit either column.
 *
 * The rule is deliberately asymmetric:
 *
 * - Content implies the habit. Writing anything, in either editor, ticks it.
 * - Absence implies nothing. Clearing the text leaves the tick alone, so a
 *   deliberate tick is never silently undone by backspacing a paragraph away.
 *
 * A symmetric rule would need a "has the user touched the tick" flag threaded
 * through both editors to avoid that, which is more state than the asymmetry
 * costs.
 */
export const hasJournalContent = (entry?: string | null): boolean =>
    !!entry && entry.trim().length > 0;

/**
 * The tick to persist for a journal entry being saved.
 *
 * Content turns the habit on and keeps it on. An empty entry carries the
 * previously stored value forward unchanged, so saving from the Journal page
 * cannot quietly clear a tick the user set on the Daily Log.
 */
export const journalHabitFor = (
    entry: string | null | undefined,
    stored?: boolean | null,
): boolean => (hasJournalContent(entry) ? true : (stored ?? false));
