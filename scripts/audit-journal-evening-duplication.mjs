/**
 * How much duplication has the morning-into-evening bug already written?
 *
 * READ ONLY. This script never writes. It exists because the bug in
 * `parseJournalDocument` was live before it was found, and the fix stops new
 * damage but does not undo what is already in the table.
 *
 * The signature it looks for is narrow, because guessing wrong here would mean
 * deleting somebody's own writing:
 *
 *   - `journal_morning` is present and not empty
 *   - `journal_evening` is exactly equal to `journal_morning`
 *
 * Equality is the whole test. A merely similar evening could be a real entry
 * that happens to echo the morning, and those are not ours to touch. An exact
 * byte-for-byte copy of a non-empty morning in a slot that was empty before is
 * the bug's fingerprint and nothing else is.
 *
 * Run it, read the count, and decide. Cleaning up is a separate, explicit step.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = {};
try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !line.trimStart().startsWith('#')) {
            env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
} catch {
    // No .env -- fall back to whatever is in the environment.
}

const url = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
    console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (in .env or the environment).');
    process.exit(1);
}

const email = env.PROBE_EMAIL || process.env.PROBE_EMAIL;
const password = env.PROBE_PASSWORD || process.env.PROBE_PASSWORD;
if (!email || !password) {
    console.error('Set PROBE_EMAIL and PROBE_PASSWORD -- this reads one account\'s rows.');
    process.exit(1);
}

const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) {
    console.error('Sign-in failed:', authError.message);
    process.exit(1);
}

const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date, journal_morning, journal_evening, journal_entry')
    .eq('user_id', auth.user.id)
    .order('log_date', { ascending: true });

if (error) {
    console.error('Could not read daily_logs:', error.message);
    process.exit(1);
}

const rows = data ?? [];
const suspect = [];
for (const row of rows) {
    const morning = row.journal_morning;
    const evening = row.journal_evening;
    if (typeof morning !== 'string' || morning.length === 0) continue;
    if (typeof evening !== 'string' || evening.length === 0) continue;
    if (morning !== evening) continue;
    suspect.push(row);
}

console.log(`\nrows read:            ${rows.length}`);
console.log(`with any morning text: ${rows.filter(r => typeof r.journal_morning === 'string' && r.journal_morning.length > 0).length}`);
console.log(`duplicated morning:   ${suspect.length}\n`);

if (suspect.length > 0) {
    console.log('These rows have an evening that is byte-identical to their morning:\n');
    for (const row of suspect.slice(0, 40)) {
        const preview = row.journal_morning.replace(/<[^>]*>/g, '').trim().slice(0, 70);
        console.log(`  ${row.log_date}  ${preview}`);
    }
    if (suspect.length > 40) console.log(`  ... and ${suspect.length - 40} more`);
    console.log('\nNothing has been changed. Tell me if you want these repaired and');
    console.log('I will clear the duplicate evening -- the morning keeps the text, so');
    console.log('nothing is lost either way.');
}
