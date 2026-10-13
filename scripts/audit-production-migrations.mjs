/**
 * Which migrations have actually been applied to this project?
 *
 * Each entry names a column or table that only exists *after* a specific
 * migration. Probing for them says, without needing a SQL connection or the
 * migration history table, exactly how far the production schema has got -- and
 * therefore whether a new migration can assume its predecessors ran.
 *
 * Read-only.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter(l => l.includes('='))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });

// Ask for the column by name. Under RLS this returns 0 rows but no error when
// the column exists, and a schema error when it does not -- so the *error* is
// the signal, not the row count.
const probe = async (table, column) => {
    const { error } = await anon.from(table).select(column).limit(1);
    if (!error) return 'present';
    if (/column|does not exist/i.test(error.message)) return 'MISSING';
    return 'present';
};

const CHECKS = [
    ['0013', 'daily_logs', 'journal_morning'],
    ['0013', 'daily_logs', 'journal_links'],
    ['0014', 'daily_logs', 'morning_mood'],
    ['0014', 'daily_logs', 'evening_mood'],
    ['0015', 'daily_logs', 'journal_sentiment'],
    ['0016', 'academic_items', 'completed'],
    ['0017', 'daily_logs', 'cheat_day'],
    ['0018', 'academic_items', 'due_time'],
    ['0019', 'user_settings', 'cheat_days_allowed'],
    ['0019', 'user_settings', 'cheat_days_period'],
    ['0020', 'user_settings', 'cheat_days_allowed'], // backfilled default
    ['0005', 'user_settings', 'goal_history'],
];

console.log('\nProduction schema drift');
console.log('='.repeat(52));
for (const [migration, table, column] of CHECKS) {
    console.log(`  ${migration}  ${(table + '.' + column).padEnd(38)} ${await probe(table, column)}`);
}

const { data: timer } = await anon.from('timer_presets').select('*').limit(1);
console.log(`\n  0021  timer_presets table                    ${timer === null ? 'MISSING' : 'present'}`);

console.log('\n' + '='.repeat(52));