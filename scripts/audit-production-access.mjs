/**
 * Read-only look at what the anon key can actually reach.
 *
 * Uses the publishable anon key, with no session, exactly as a stranger with
 * the URL would. That is the whole point: it does not ask what RLS *should* be,
 * it asks what the database actually returns to an unauthenticated caller. If
 * every table comes back empty or refused, the ownership boundary is holding.
 *
 * Nothing here writes. It is `select` against the REST API only.
 *
 * Run: node scripts/audit-production-access.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter(line => line.includes('='))
        .map(line => {
            const i = line.indexOf('=');
            return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

// No persisted session and no auth header -- an anonymous request.
const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// The user-owned tables, plus the two the security baseline migration drops.
const TABLES = [
    'daily_logs', 'notes', 'body_measurements', 'user_settings', 'abstinence_goals',
    'abstinence_history', 'books', 'projects', 'habits', 'academic_courses',
    'academic_items', 'academic_grades', 'workout_templates', 'study_sessions',
    'custom_measurements', 'timer_alarms', 'timer_presets', 'timer_settings',
    'google_calendar_tokens', 'calendar_events',
];

console.log(`\nAnonymous reach against ${url}`);
console.log('='.repeat(72));

const exposed = [];
const absent = [];

for (const table of TABLES) {
    const { data, error } = await anon.from(table).select('*').limit(3);
    if (error) {
        // "relation does not exist" means the table is not there at all.
        if (/does not exist|Could not find the table|schema/i.test(error.message)) {
            absent.push(table);
            console.log(`  --   ${table.padEnd(24)} table not present`);
        } else {
            absent.push(table);
            console.log(`  --   ${table.padEnd(24)} refused: ${error.message.slice(0, 60)}`);
        }
        continue;
    }

    const rows = data?.length ?? 0;
    if (rows === 0) {
        console.log(`  ok   ${table.padEnd(24)} 0 rows returned (RLS holding)`);
    } else {
        exposed.push(table);
        console.log(`  >>>  ${table.padEnd(24)} ${rows} ROW(S) RETURNED TO ANONYMOUS`);
        for (const row of data ?? []) {
            const keys = Object.keys(row).filter(k => k !== 'vault');
            console.log(`         keys: ${keys.join(', ')}`);
        }
    }
}

console.log('='.repeat(72));
console.log(`tables exposing rows to an anonymous caller: ${exposed.length}`);
if (exposed.length) console.log('  ' + exposed.join(', '));
console.log(`tables absent or refused: ${absent.length}`);
if (absent.length) console.log('  ' + absent.join(', '));

// What a signed-in user can see, for contrast. Uses the anon key only -- this
// does not sign in, so it cannot report on the authenticated view.
console.log('\nNote: this script never signs in. It answers one question only --');
console.log('what does an unauthenticated caller get? Authenticated reach depends on');
console.log('the policies, which need a SQL connection to inspect directly.');

process.exit(exposed.length ? 1 : 0);