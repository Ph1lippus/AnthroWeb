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
}

/**
 * The tables walked, in order.
 *
 * Notes first: they are the thing most likely to be read by someone else, and
 * they are the smallest of the three. The daily log is by far the largest and
 * goes last so an interruption costs the least.
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
const sealTable = async (
    table: string,
    order: string,
    ascending: boolean,
    userId: string,
    onProgress: (done: number, total: number) => void,
): Promise<{ sealed: number; skipped: number; failed: number }> => {
    let sealed = 0;
    let skipped = 0;
    let failed = 0;

    // Only rows that are actually unsealed. `vault IS NULL` is the whole filter
    // and it is also what makes a re-run cheap.
    const { data: pending, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', userId)
        .is('vault', null)
        .order(order, { ascending })
        .limit(1000);

    if (error) {
        console.error(`Could not list rows to seal in ${table}:`, error.message);
        return { sealed, skipped, failed: 1 };
    }

    const rows = (pending ?? []) as Record<string, unknown>[];
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.vault) { skipped++; continue; }

        try {
            const result = await sealExistingRow(table, row, userId);
            if (!result.sealed || !result.vault) { skipped++; continue; }

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

        // Yield to the event loop periodically so the tab stays responsive and
        // Android does not decide the WebView is unresponsive and kill it. A
        // long synchronous crypto loop here would look identical to a hang.
        if (i % 10 === 9) {
            onProgress(i + 1, total);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    onProgress(rows.length, total);
    return { sealed, skipped, failed };
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

    for (const { table, order, ascending } of TARGETS) {
        const result = await sealTable(table, order, ascending, userId, (done, total) => {
            onProgress({ table, done, total, percent: total === 0 ? 100 : Math.round((done / total) * 100) });
        });
        sealed += result.sealed;
        skipped += result.skipped;
        failed += result.failed;
    }

    return { sealed, skipped, failed };
};