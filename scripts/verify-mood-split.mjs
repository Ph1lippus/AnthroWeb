/**
 * Checks 0014_split_mood_columns.sql, which replaces `daily_logs.mood` with
 * `morning_mood` + `evening_mood`.
 *
 * verify:migrations replays every migration against the *current* sql.sql, and
 * sql.sql already describes the post-0014 shape -- so that script can only prove
 * the file is replayable against a database that has already been migrated. It
 * cannot reach the case this migration exists for: a live database that still
 * has the old `mood` column full of real ratings.
 *
 * So the interesting direction is built here from both ends. A `mood` column is
 * grafted back onto a scratch database, a row is written into it, and 0014 is
 * applied for real: the rating has to arrive in `evening_mood` and the old
 * column has to be gone. Then the whole file is applied a second time on top,
 * because a migration that can only be run once is a migration that gets run
 * twice by somebody in a hurry.
 */
import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

import { applyAllStatements, splitStatements } from './lib/split-sql.mjs';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const USER = '00000000-0000-0000-0000-0000000000dd';
const MIGRATION = 'supabase/migrations/0014_split_mood_columns.sql';

const sqlFile = readFileSync('sql.sql', 'utf8');
const runnable = sqlFile.split(/^INDEXES\.\s*$/m)[0];
const migration = splitStatements(readFileSync(MIGRATION, 'utf8'));

const freshDatabase = async () => {
    const db = new PGlite();
    await db.exec(`
        create schema if not exists auth;
        create table if not exists auth.users (id uuid primary key);
        do $$ begin
            if not exists (select 1 from pg_roles where rolname = 'authenticated') then
                create role authenticated nologin;
            end if;
            if not exists (select 1 from pg_roles where rolname = 'service_role') then
                create role service_role nologin bypassrls;
            end if;
        end $$;
        create or replace function auth.uid() returns uuid
            language sql stable as $$ select null::uuid $$;
    `);
    return db;
};

const columnsOf = async (db, table) => {
    const { rows } = await db.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = $1`,
        [table],
    );
    return rows.map(r => r.column_name);
};

const runMigration = async (db) => {
    const errors = [];
    for (const statement of migration) {
        try { await db.exec(statement); }
        catch (e) { errors.push(String(e.message ?? e).split('\n')[0]); }
    }
    return errors;
};

// ---------------------------------------------------------------------------
// The schema of record already carries the new columns and no `mood`. This is
// what verify:migrations replays against, and it has to hold or every other
// check below is measuring the wrong database.
// ---------------------------------------------------------------------------
console.log('== sql.sql describes the post-migration shape ==');
const baseline = await freshDatabase();
const baseError = await applyAllStatements(baseline, runnable);
check('sql.sql applies', baseError === null, baseError ?? '');

const baselineColumns = await columnsOf(baseline, 'daily_logs');
check('daily_logs.morning_mood exists', baselineColumns.includes('morning_mood'));
check('daily_logs.evening_mood exists', baselineColumns.includes('evening_mood'));
check('daily_logs.mood is gone', !baselineColumns.includes('mood'));

// ---------------------------------------------------------------------------
// The real case: a live database that predates the migration, with ratings in it.
// ---------------------------------------------------------------------------
console.log('\n== 0014 against a database that still has the old column ==');

const legacy = await freshDatabase();
await applyAllStatements(legacy, runnable);
// Put the schema back the way it was before 0014 ran. This is the only honest
// way to reach that state here: sql.sql is the *result* of the migration, so the
// pre-migration shape has to be reconstructed rather than read off it.
await legacy.exec(`alter table public.daily_logs
    add column mood integer check (mood >= 1 and mood <= 10)`);
await legacy.exec(`insert into auth.users (id) values ('${USER}')`);
await legacy.exec(`insert into public.daily_logs (user_id, log_date, mood)
    values ('${USER}', '2026-01-05', 8)`);
await legacy.exec(`insert into public.daily_logs (user_id, log_date, mood)
    values ('${USER}', '2026-01-06', null)`);

const firstRun = await runMigration(legacy);
check('0014 applies cleanly', firstRun.length === 0, firstRun.join(' | '));

const migrated = await columnsOf(legacy, 'daily_logs');
check('morning_mood was added', migrated.includes('morning_mood'));
check('evening_mood was added', migrated.includes('evening_mood'));
check('mood was dropped', !migrated.includes('mood'));

const { rows: carried } = await legacy.query(
    `select morning_mood, evening_mood from public.daily_logs
      where log_date = '2026-01-05'`,
);
check('the old rating became the evening rating',
    carried[0]?.evening_mood === 8, JSON.stringify(carried[0]));
check('the morning rating was left unset rather than invented',
    carried[0]?.morning_mood === null, JSON.stringify(carried[0]));

const { rows: untouched } = await legacy.query(
    `select evening_mood from public.daily_logs where log_date = '2026-01-06'`,
);
check('a day that was never rated stays NULL',
    untouched[0]?.evening_mood === null, JSON.stringify(untouched[0]));

// The rating is still readable under its new name -- the point of a backfill.
const { rows: readback } = await legacy.query(
    `select evening_mood from public.daily_logs
      where user_id = '${USER}' and log_date = '2026-01-05'`,
);
check('the rating survived the drop', readback[0]?.evening_mood === 8);

// ---------------------------------------------------------------------------
// Replay. Someone will run this twice, and a file that only works once turns a
// routine re-run into an incident.
// ---------------------------------------------------------------------------
console.log('\n== replaying 0014 on an already-migrated database ==');
const secondRun = await runMigration(legacy);
check('0014 is idempotent', secondRun.length === 0, secondRun.join(' | '));

const { rows: afterReplay } = await legacy.query(
    `select evening_mood from public.daily_logs where log_date = '2026-01-05'`,
);
check('the replay did not disturb the data',
    afterReplay[0]?.evening_mood === 8, JSON.stringify(afterReplay[0]));

// ---------------------------------------------------------------------------
// The CHECK constraints. Named in the migration rather than inline so the whole
// file can be replayed, so the names are worth pinning down: a constraint that
// only exists under a Postgres-generated name is one a future migration cannot
// reason about.
// ---------------------------------------------------------------------------
console.log('\n== rating bounds ==');
// One date per insert. `daily_logs` is unique on (user_id, log_date), so reusing
// a date would fail on that constraint instead, and every "accepts" case would
// report a duplicate key rather than the bound it was actually testing.
let day = 0;
for (const column of ['morning_mood', 'evening_mood']) {
    const tryValue = value => legacy.exec(
        `insert into public.daily_logs (user_id, log_date, ${column})
         values ('${USER}', '2026-06-${String(++day).padStart(2, '0')}', ${value})`,
    ).then(() => '', e => String(e.message ?? e).split('\n')[0]);

    for (const value of [0, 11, -1]) {
        const err = await tryValue(value);
        check(`${column} rejects ${value}`, err.includes(column), err || 'accepted');
    }
    for (const value of [1, 5, 10]) {
        const err = await tryValue(value);
        check(`${column} accepts ${value}`, err === '', err);
    }
    const err = await tryValue('null');
    check(`${column} accepts NULL (a day with no rating is a real day)`, err === '', err);
}

// ---------------------------------------------------------------------------
// The columns the app's own selects name. A dropped `mood` still sitting in a
// service's select list fails at runtime, on the user's screen, and not here --
// unless it is pinned down here.
// ---------------------------------------------------------------------------
console.log('\n== the client reads the columns that exist ==');

/**
 * Strips comments so the search below sees code rather than prose.
 *
 * These files discuss the dropped column constantly -- that is what a migration
 * comment is for -- so searching the raw text for the word finds its own
 * documentation and reports it as a live reference. Blanking comments keeps the
 * rationale in the source and still leaves every real use of the identifier
 * findable.
 *
 * Not string-aware, deliberately: `dataKey="mood"` is exactly the kind of
 * reference worth failing on, so leaving string contents in place is the
 * conservative choice.
 */
const stripComments = source => source
    // Block comments, including the JSDoc blocks above every export.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Line comments, to end of line.
    .replace(/\/\/[^\n]*/g, '');

// Every file that reads or writes a daily log. A file listed here that does not
// exist is not a failure -- nothing below depends on any one of them.
const COLUMN_FILES = [
    'src/services/dailyLogService.ts',
    'src/utils/dailyScoring.ts',
    'src/utils/moodSeries.ts',
    'src/Components/Dashboard/MetricsCharts.tsx',
    'src/Components/Dashboard/AnalysisCards.tsx',
    'src/Pages/DailyLogHistoryPage.tsx',
    'src/Pages/DailyLogPage.tsx',
    'src/Pages/JournalPage.tsx',
    'src/Pages/JournalEditPage.tsx',
    'src/Pages/MindChartsPage.tsx',
    'src/Components/Journal/Mood.tsx',
    'src/Components/Journal/JournalEditor.tsx',
    'src/Components/MindCharts/TopicNetwork.tsx',
    'src/Components/MindCharts/MoodStatCards.tsx',
    'src/Components/MindCharts/MoodBandChart.tsx',
    'src/Components/Measurement/MeasurementEditor.tsx',
    'src/Components/Measurement/DerivedMetrics.tsx',
    'src/Pages/MeasurementsPage.tsx',
].filter(file => existsSync(file));

// Reading a dropped column off a stored log is already impossible by the time
// this runs: `DailyLog` has no `mood` member, so `log.mood` is a compile error and
// `npm run build` catches it. It is not re-checked here, because a grep for
// `.mood` cannot tell that from the graph's own per-node `.mood`, which is a
// computed value in `utils/moodSeries` and correctly named for what it is.
//
// What is *not* caught by the compiler is a column name inside a string: a
// hand-written select list, or a payload key. Those are plain text to TypeScript,
// so this is where the check earns its place.
/**
 * A quoted `mood` that is *exactly* the column name.
 *
 * Both delimiters must be on the same string literal with nothing between them,
 * which is what a column name in a query looks like -- `'mood'` in a select list,
 * `"mood"` in a template. Prose that merely mentions the column lives in a
 * *comment*, and comments are already stripped above, so the two never overlap
 * and no negative lookahead is needed to tell them apart.
 *
 * This deliberately does not try to catch `mood:` as an object key. That shape is
 * indistinguishable in plain text from a TypeScript parameter annotation
 * (`(mood: number | null) => ...`), which appears legitimately throughout
 * `moodSeries.ts` and the graph. The two places a payload key would reach Postgres
 * are checked structurally further down, where the literal is extracted and read.
 */
const COLUMN_NAME_STRING = /(['"`])mood\1/;

for (const file of COLUMN_FILES) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const match = COLUMN_NAME_STRING.exec(source);
    check(`${file} names no dropped column in a string`, match === null,
        match ? `found at offset ${match.index}: ${source.slice(match.index, match.index + 60).replace(/\n/g, ' ')}` : '');
}

// Nothing may still *write* the old name. A save payload is the one place a
// dropped column can be reintroduced quietly: PostgREST would reject the unknown
// key, so the autosave would fail on every keystroke and the user would be the
// one to find out. This is checked by key, not by identifier, because `mood:` as
// an object key is the shape a column write actually takes.


// The two literals in the client that name columns for Postgres. A stray `mood`
// in either is the exact failure this migration would otherwise ship: it passes
// every type check in the repo and 400s on the dashboard in production.
const serviceSource = stripComments(readFileSync('src/services/dailyLogService.ts', 'utf8'));

const selectList = /\.select\(\s*'([^']*)'\s*\)/.exec(serviceSource)?.[1] ?? '';
const selectedColumns = selectList ? selectList.split(',').map(c => c.trim()) : [];
check('the daily-logs select list was found', selectedColumns.length > 0);
check('the daily-logs select names no dropped column',
    !selectedColumns.includes('mood'), selectedColumns.join(','));
check('the daily-logs select carries both new mood columns',
    selectedColumns.includes('morning_mood') && selectedColumns.includes('evening_mood'),
    selectedColumns.join(','));

// The upsert body, up to the options object that follows it.
const upsertBody = /\.upsert\(\s*\{([\s\S]*?)\}\s*,\s*\{/.exec(serviceSource)?.[1] ?? '';
const upsertKeys = [...upsertBody.matchAll(/^\s+([a-z_]+)\s*:/gm)].map(m => m[1]);
check('the daily-log upsert body was found', upsertKeys.length > 20, `${upsertKeys.length} keys`);
check('the daily-log upsert writes no dropped column',
    !upsertKeys.includes('mood'), upsertKeys.join(','));
check('the daily-log upsert writes both new mood columns',
    upsertKeys.includes('morning_mood') && upsertKeys.includes('evening_mood'),
    upsertKeys.filter(k => k.endsWith('mood')).join(',') || 'no mood columns at all');

// The two new names have to actually be used, or a migration that changed the
// schema without moving the reads would pass every check above by having nothing
// left to find.
const service = readFileSync('src/services/dailyLogService.ts', 'utf8');
for (const column of ['morning_mood', 'evening_mood']) {
    check(`dailyLogService reads and writes ${column}`,
        (service.match(new RegExp(column, 'g')) ?? []).length >= 3,
        'expected the name in the interface, the select list and the upsert');
}

await baseline.close();
await legacy.close();

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
// Two PGlite instances mean two WASM runtimes, and PGlite tears its event loop
// handles down on its own schedule. Calling process.exit while that is still in
// flight trips a libuv assertion on Windows and prints an unhandled failure
// after the real verdict. One macrotask is enough for the close promises to
// settle; the exit code is what a CI reads, so the noise above would otherwise
// read as a crash.
await new Promise(resolve => setTimeout(resolve, 0));
process.exit(fail === 0 ? 0 : 1);