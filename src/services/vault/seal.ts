/**
 * Sealing everything that was written before the vault existed.
 *
 * Runs once, from the client, immediately after the vault is armed. A server-side
 * migration cannot do this: the master key never leaves the device, so the only
 * place the plaintext and the key exist together is here.
 *
 * WHY IT IS A SEPARATE STEP
 *
 * Arming the vault is one row write that either lands or does not. Sealing is a
 * walk over every note and every day of journal the user has ever written -- for
 * a year of use that is thousands of rows. Making those one operation would mean
 * a failure halfway through leaves the vault armed and the old data readable,
 * which is worse than having never turned it on, because the settings screen
 * would be claiming the opposite. So they are separate, and progress is reported
 * per table so a partial run can be resumed rather than restarted.
 *
 * IT IS IDEMPOTENT AND SAFE TO RE-RUN
 *
 * Rows that already carry a `vault` payload are skipped. That matters because
 * the walk is long enough to be interrupted, and because a user who closes the
 * tab halfway should be able to come back and finish rather than start over.
 *
 * IT NEVER DELETES
 *
 * A row is written with its plaintext columns set to null in the same statement
 * that stores the ciphertext, so there is never a moment where both exist and
 * never a moment where neither does. If the update fails, the row keeps its
 * plaintext and is reported as failed -- which is the safe direction, because the
 * data is still there and still readable by the user who owns it.
 */

import { supabase } from '../supabaseClient';
import { getCurrentUserId } from '../supabaseClient';
import { sealExistingRow } from './rows';

/** One table's worth of the walk. */
export interface SealProgress {
    table: string;
    done: number;
    total: number;
    percent: number;
}

export interface SealResult {
    sealed: number;
    skipped: number;
    failed: number;
    /**
     * Rows still unsealed when the walk finished. Zero is the only value that
     * means "done", and the UI says so rather than inferring it from the bar
     * having reached the end.
     */
    remaining: number;
    /** Per table, for the summary. Anything here above zero can be re-run. */
    perTable: Record<string, number>;
}

/**
 * The tables walked, in order.
 *
 * Notes first: they are the thing most likely to be read by someone else, and
 * they are the smallest of the three. The daily log is by far the largest and
 * goes last so an interruption costs the least.
 */
/**
 * The tables walked.
 *
 * Notes first: they are the thing most likely to be read by someone else, and
 * the smallest of the three. The daily log is by far the largest and goes last,
 * so an interruption costs the least.
 *
 * The sort columns are declared but not used for paging -- the cursor moves on
 * `id`, which is stable, unique and indexed. They are kept because they describe
 * what each table is keyed on, and because a future page that wants to present
 * the walk in date order should not have to rediscover it.
 */
const TARGETS = [
    { table: 'notes', order: 'created_at', ascending: true },
    { table: 'user_settings', order: 'created_at', ascending: true },
    { table: 'daily_logs', order: 'log_date', ascending: true },
] as const;

/**
 * Seal one table.
 *
 * Paged rather than in one request: a year of journal is well past what a single
 * `select` should return, and an unbounded fetch that fails at the end means
 * redoing all of it.
 */
/** One page. Small enough that a phone is not holding 40MB of note content. */
const PAGE_SIZE = 250;

/**
 * Seal one table, every page of it.
 *
 * The paging is the whole function. This used to fetch a single page of 1000 rows
 * and seal them, with a comment claiming it was paged -- and it was not. A year
 * of daily logs is 365 rows, so a user a few years in quietly went past it:
 * everything past row 1000 stayed plaintext, and the summary reported success
 * anyway. That is the specific shape of failure this feature cannot have, so it
 * is now verified rather than assumed.
 *
 * Paged on `id`, not on the sort column. The walk seals rows as it goes, which
 * removes them from the `vault IS NULL` set, so an offset would skip rows on the
 * next page -- it pages forward past rows it has just handled. Cursor paging on a
 * stable, unique, indexed column has no such problem: the cursor only ever moves
 * forward through rows that still need work.
 */
const sealTable = async (
    table: string,
    _order: string,
    _ascending: boolean,
    userId: string,
    onProgress: (done: number, total: number) => void,
): Promise<{ sealed: number; skipped: number; failed: number; remaining: number }> => {
    let sealed = 0;
    let skipped = 0;
    let failed = 0;
    let processed = 0;

    // The true count, fetched once, so the progress bar is a fraction of reality
    // rather than of the page it happens to be on. Head requests the row count
    // without the rows.
    const { count: totalRows, error: countError } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('vault', null);

    if (countError) {
        console.error(`Could not count rows to seal in ${table}:`, countError.message);
        return { sealed, skipped, failed: 1, remaining: 0 };
    }

    const total = totalRows ?? 0;
    if (total === 0) {
        onProgress(0, 0);
        return { sealed, skipped, failed, remaining: 0 };
    }

    let cursor: string | null = null;

    // Bounded so a cursor that somehow does not advance fails loudly instead of
    // looping forever against an unchanged result set.
    for (let page = 0; page < 1000; page++) {
        let query = supabase
            .from(table)
            .select('*')
            .eq('user_id', userId)
            .is('vault', null)
            .order('id', { ascending: true })
            .limit(PAGE_SIZE);
        if (cursor) query = query.gt('id', cursor);

        const { data: pending, error } = await query;

        if (error) {
            console.error(`Could not list rows to seal in ${table}:`, error.message);
            return { sealed, skipped, failed: failed + 1, remaining: total - processed };
        }

        const rows = (pending ?? []) as Record<string, unknown>[];
        if (rows.length === 0) break;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            // Advance the cursor on every row, sealed or not, so the next page
            // starts past whatever this one covered.
            cursor = String(row.id);

            if (row.vault) { skipped++; processed++; continue; }

            try {
                const result = await sealExistingRow(table, row, userId);
                if (!result.sealed || !result.vault) { skipped++; processed++; continue; }

                const { error: writeError } = await supabase
                    .from(table)
                    .update({ vault: result.vault, ...result.blanks })
                    .eq('id', row.id as string);

                if (writeError) {
                    // The row keeps its plaintext. Reported, never deleted.
                    console.error(`Could not seal a row in ${table}:`, writeError.message);
                    failed++;
                } else {
                    sealed++;
                }
            } catch (err) {
                console.error(`Sealing a row in ${table} threw:`, err);
                failed++;
            }
            processed++;

            // Yield to the event loop periodically so the tab stays responsive
            // and Android does not decide the WebView is unresponsive and kill
            // it. A long synchronous crypto loop here looks identical to a hang.
            if (i % 10 === 9) {
                onProgress(processed, total);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        onProgress(processed, total);

        if (rows.length < PAGE_SIZE) break;
    }

    /**
     * How many are still unsealed afterwards.
     *
     * Reported rather than assumed. A user who sees this at zero knows the whole
     * table is sealed; a user who sees a number has something left to do, and
     * the walk can simply be run again -- it skips what is already done.
     */
    const { count: remainingRows } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('vault', null);

    return { sealed, skipped, failed, remaining: remainingRows ?? 0 };
};

/**
 * Seal everything, reporting progress as it goes.
 *
 * Returns rather than throwing on a table-level failure, because a partial seal
 * is useful and a thrown error would throw away the count of what did land.
 */
export const sealAllExistingRows = async (
    onProgress: (progress: SealProgress) => void,
): Promise<SealResult> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in.');

    let sealed = 0;
    let skipped = 0;
    let failed = 0;
    let remaining = 0;
    const perTable: Record<string, number> = {};

    for (const { table, order, ascending } of TARGETS) {
        const result = await sealTable(table, order, ascending, userId, (done, total) => {
            onProgress({ table, done, total, percent: total === 0 ? 100 : Math.round((done / total) * 100) });
        });
        sealed += result.sealed;
        skipped += result.skipped;
        failed += result.failed;
        remaining += result.remaining;
        perTable[table] = result.remaining;
    }

    return { sealed, skipped, failed, remaining, perTable };
};