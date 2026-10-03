// Verifies sql.sql -- the schema of record -- against the invariants the app's
// queries actually depend on, by applying it to a real Postgres (PGlite/WASM) and
// exercising it.
//
// sql.sql is a GUI export, not a rebuildable dump: it interleaves a runnable
// CREATE TABLE section with catalog prose, one value per line. That is enough to
// apply, which is the only property that matters here -- it means the assertions
// below cannot pass against a hand-copied subset of the schema while the real
// thing is broken. The catalog sections are skipped; the runnable ones are not.
//
// supabase/migrations/ holds the steps that produced this file. It is not applied
// here: it is history, and this asserts where the schema ended up rather than how
// it got there. A migration that has not been run is caught by the assertions
// below failing, which is the point of having them.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { applyAllStatements, splitStatements } from './lib/split-sql.mjs';

const db = new PGlite();
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`); }
};
// Keep stack traces out of the output; the message is the useful part.
const quiet = fn => async (...args) => {
    try { return await fn(...args); }
    catch (e) { return { __error: e.message }; }
};

const ALICE = '11111111-1111-1111-1111-111111111111';

// The splitter lives in scripts/lib/split-sql.mjs because scripts/verify-migrations.mjs
// needs the same one, and two implementations of "where does a statement end"
// would eventually disagree about a migration. It handles '...' and "..." literals,
// -- comments and $$ ... $$ function bodies; migrations are full of the last one.

// ---- bootstrap -------------------------------------------------------------
// sql.sql is a context dump, not a runnable file. Two things stop it applying as
// it stands, and both are properties of a GUI export rather than of the schema:
//
//   1. Every table carries a foreign key into auth.users, which only exists
//      inside Supabase. Creating that one table is all it takes.
//   2. The tables are in the order the GUI listed them, not in dependency order --
//      `workout_exercises_log` is declared before the `exercises` it points at.
//      The file says so itself: "Table order and constraints may not be valid
//      for execution."
//
// So the statements are applied by retrying rather than in order: anything that
// fails on a missing relation goes back on the queue and the whole queue is run
// again, until a pass makes no progress. That is a topological sort with no
// dependency graph in it, and it degrades honestly -- a statement that still
// cannot run after a full round is reported with the reason, which is the whole
// point of applying the real file.
//
// Everything past the `INDEXES.` heading is catalog prose ("View definition", a
// column list, an index name, one value per line) and is cut off here. The DDL
// half is applied exactly as written.
const sqlFile = readFileSync('sql.sql', 'utf8');
const runnable = sqlFile.split(/^INDEXES\.\s*$/m)[0];

await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
`);

console.log('\n== sql.sql applies ==');
const schemaApplied = await applyAllStatements(db, runnable);
check('applies cleanly', !schemaApplied, schemaApplied ?? '');

const tables = (await db.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
)).rows.map(r => r.table_name);
check('all 37 tables are created', tables.length === 37, `${tables.length} tables`);

// ---------------------------------------------------------------------------
// Every table is per-user data, so `user_id` has to be NOT NULL with a foreign key
// into auth.users. A table missing either one silently becomes cross-user: the
// client filters on user_id, and a row with a NULL there never matches its owner.
// ---------------------------------------------------------------------------
console.log('\n== ownership ==');
const owned = (await db.query(
    `select c.relname as table
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (
            select 1 from pg_attribute a
             where a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0
        )`,
)).rows.map(r => r.table);

const nullableUser = (await db.query(
    `select table_name, column_name from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id' and is_nullable = 'YES'`,
)).rows.map(r => `${r.table_name}.${r.column_name}`);
check('no user_id is nullable', nullableUser.length === 0, nullableUser.join(',') || `across ${owned.length} tables`);

const userFks = (await db.query(
    `select c.conrelid::regclass::text as table
       from pg_constraint c
      where c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
        and c.conkey[1] = (
            select attnum from pg_attribute
             where attrelid = c.conrelid and attname = 'user_id' and attnum > 0
        )`,
)).rows.map(r => r.table);
const missingFk = owned.filter(t => !userFks.includes(t));
check('every user_id has a foreign key to auth.users', missingFk.length === 0, missingFk.join(',') || `${userFks.length} tables`);

// ---------------------------------------------------------------------------
// projects.status. The status list exists in two places -- the CHECK in sql.sql and
// PROJECT_STATUSES in the client -- and the failure mode is drift: one gets a value
// the other does not know. Both directions are checked, by trying the insert rather
// than by reading the constraint text.
// ---------------------------------------------------------------------------
console.log('\n== projects.status ==');
const svc = readFileSync('src/services/projectService.ts', 'utf8');
const clientStatuses = [...(svc.match(/PROJECT_STATUSES[^=]*=\s*\[([^\]]*)\]/s)?.[1] ?? '')
    .matchAll(/'([^']+)'/g)].map(m => m[1]);
check('PROJECT_STATUSES was found in the client', clientStatuses.length > 0, clientStatuses.join(','));

await db.exec(`insert into auth.users (id) values ('${ALICE}');`);
await db.exec(`insert into public.projects (user_id, title) values ('${ALICE}', 'Probe');`);

const setStatus = async (s) => (await quiet(() => db.query(
    `update public.projects set status = '${s}' where title = 'Probe' returning status`,
)))();

for (const s of clientStatuses) {
    const res = await setStatus(s);
    check(`accepts '${s}'`, !res.__error && res.rows[0]?.status === s, res.__error ?? String(res.rows[0]?.status));
}

const junk = await setStatus('done');
check('rejects an unknown status', !!junk.__error, junk.__error ?? 'was allowed');

// The other direction: a status the CHECK allows but the client does not know
// about would never render, sort or count correctly.
//
// Read from the constraint definition rather than pg_enum: the schema declares an
// inline `CHECK (status = ANY (ARRAY[...]))`, which is a check constraint, not an
// enum type, so a pg_enum join finds nothing. That query "passes" by returning an
// empty set and proves nothing at all -- this one reads the literals back out.
const statusChecks = (await db.query(`
    select pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'public.projects'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%'
`)).rows.map(r => r.def);
check('projects.status has a CHECK constraint', statusChecks.length > 0, statusChecks.join(' | '));

const dbStatuses = [...new Set(
    statusChecks.flatMap(def => [...def.matchAll(/'([^']+)'/g)]).map(m => m[1]),
)].sort();
const orphanStatus = dbStatuses.filter(s => !clientStatuses.includes(s));
check('no status exists that the client does not know', orphanStatus.length === 0,
    orphanStatus.join(',') || dbStatuses.join(','));
check('the constraint and the client list the same statuses',
    dbStatuses.length === clientStatuses.length,
    `db: ${dbStatuses.join(',')} | client: ${clientStatuses.join(',')}`);

// ---------------------------------------------------------------------------
// notes. The app reads and writes these column names directly, so a rename here is
// a runtime error rather than a visible one.
// ---------------------------------------------------------------------------
console.log('\n== notes columns ==');
const cols = (await db.query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='notes' order by column_name`,
)).rows.map(r => r.column_name);
for (const c of ['id', 'user_id', 'title', 'content', 'is_pinned', 'notes_color', 'notes_icon',
    'notes_cover', 'notes_parent_id', 'notes_deleted_at', 'notes_tags']) {
    check(`column ${c}`, cols.includes(c), cols.join(','));
}
// A real regression: notes used a bare `deleted_at`, which collided with the
// trashed-row filter every query shares. Prefixed is the only correct name.
check('no unprefixed deleted_at column', !cols.includes('deleted_at'));

const titleNull = (await db.query(
    `select is_nullable from information_schema.columns
      where table_schema='public' and table_name='notes' and column_name='title'`,
)).rows[0]?.is_nullable;
// Sub-pages are untitled until the user names them, so a NOT NULL title would make
// the blank page the editor inserts impossible to create.
check('title allows null (untitled sub-pages)', titleNull === 'YES', titleNull);

const parentFk = (await db.query(
    `select count(*)::int as n from pg_constraint
      where conrelid = 'public.notes'::regclass and contype = 'f'
        and confrelid = 'public.notes'::regclass`,
)).rows[0]?.n;
check('notes_parent_id references notes', parentFk > 0, `foreign keys to self: ${parentFk}`);

// ---------------------------------------------------------------------------
// Workouts. Everything here is an invariant the client assumes and Postgres is
// the only thing that can enforce, so each one is asserted by trying the write
// rather than by reading the schema -- a constraint that exists in the catalog
// text but not in the table is exactly the failure this file exists to catch.
// ---------------------------------------------------------------------------
console.log('\n== workouts ==');

// Uniqueness can be enforced two ways and PostgREST accepts either, so both count:
// a UNIQUE constraint (pg_constraint contype='u') or a standalone unique index
// (pg_index). The library key is the second kind -- 0009 creates a unique *index*,
// not a constraint -- so reading constraints alone reported it as missing.
const uniqueConstraints = (await db.query(
    `select conrelid::regclass::text as table, conname,
            pg_get_constraintdef(oid) as def
       from pg_constraint
      where contype = 'u' and connamespace = 'public'::regnamespace`,
)).rows;

const uniqueIndexes = (await db.query(
    `select i.indrelid::regclass::text as table, c.relname as name,
            pg_get_indexdef(i.indexrelid) as def
       from pg_index i
       join pg_class c on c.oid = i.indexrelid
       join pg_namespace n on n.oid = c.relnamespace
      where i.indisunique and n.nspname = 'public'`,
)).rows;

const uniqueRules = [
    ...uniqueConstraints.map(r => ({ ...r, kind: 'constraint' })),
    ...uniqueIndexes.map(r => ({ ...r, kind: 'index' })),
];

const hasUnique = (table, columns) => uniqueRules.some(row =>
    row.table === table
    // The definition renders as UNIQUE (a, b) or UNIQUE (a, expression).
    // A unique index def ends in the bare column list, so match on it either way.
    && (row.def.replace(/\s+/g, ' ').includes(`(${columns})`)
        || row.def.replace(/\s+/g, ' ').endsWith(`(${columns})`)));

// 0008 split a template's day out into workout_plan_sessions, which is what lets a
// day hold several sessions. `unique_template_day` was UNIQUE
// (workout_template_id, day_of_week) from before that split and was never dropped,
// so a template could hold exactly one exercise per weekday and the second add
// failed with a duplicate-key error the UI swallowed. Dropped in 0010.
check(
    'no unique constraint on (workout_template_id, day_of_week)',
    !hasUnique('workout_template_exercises', 'workout_template_id, day_of_week'),
    uniqueRules
        .filter(row => row.table === 'workout_template_exercises')
        .map(row => `${row.conname} (${row.kind}) ${row.def}`).join(' | ') || 'none',
);

// One session per user per day is the opposite kind of invariant: the daily log's
// gym column is keyed by date and the heat grid colours a square from it, so two
// rows for one day would have nothing to decide between them.
check(
    'one workout session per user per day',
    hasUnique('workout_completion_log', 'user_id, workout_date'),
    uniqueRules
        .filter(row => row.table === 'workout_completion_log')
        .map(row => `${row.conname} (${row.kind}) ${row.def}`).join(' | ') || 'none',
);

// exercise_id is the join to the library, and the muscles and equipment behind the
// stats rail hang off it. A template row written before the picker propagated the
// id has it NULL, which is a silent missing join rather than an error.
const tplCols = (await db.query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='workout_template_exercises'`,
)).rows.map(r => r.column_name);
for (const c of ['exercise_id', 'session_id', 'day_of_week', 'position', 'activity_type']) {
    check(`workout_template_exercises.${c}`, tplCols.includes(c), tplCols.join(','));
}

// `sets` was an aggregate column that drifted from the per-set jsonb detail and
// could disagree with it -- the detail is what `parseSetDetail` reads. Only the
// detail is read now.
const logCols = (await db.query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='workout_exercises_log'`,
)).rows.map(r => r.column_name);
check('workout_exercises_log has sets_detail', logCols.includes('sets_detail'), logCols.join(','));
check('workout_exercises_log has no aggregate sets', !logCols.includes('sets'), logCols.join(','));

// activity_type has to accept exactly ACTIVITY_TYPES in src/utils/workoutSets.ts.
// Drift in either direction is a runtime failure: a value the client cannot parse
// falls back to 'strength', and a value the CHECK refuses is a rejected insert.
const clientTypes = [...(readFileSync('src/utils/workoutSets.ts', 'utf8')
    .match(/ACTIVITY_TYPES\s*=\s*\[([^\]]*)\]/)?.[1] ?? '')
    .matchAll(/'([^']+)'/g)].map(m => m[1]);
check('ACTIVITY_TYPES was found in the client', clientTypes.length > 0, clientTypes.join(','));

// Every table holding activity_type has to agree with ACTIVITY_TYPES, not just
// the two that happened to have a CHECK. `exercises` and `workout_plan_sessions`
// did; `workout_template_exercises` and `workout_exercises_log` did not, so the
// vocabulary was enforced on half the tables that use it.
for (const table of [
    'exercises',
    'workout_template_exercises',
    'workout_exercises_log',
    'workout_plan_sessions',
]) {
    const defs = (await db.query(
        `select pg_get_constraintdef(oid) as def from pg_constraint
          where conrelid = $1::regclass and contype = 'c'
            and pg_get_constraintdef(oid) like '%activity_type%'`,
        [`public.${table}`],
    )).rows.map(r => r.def);
    const dbTypes = [...new Set(defs.flatMap(def => [...def.matchAll(/'([^']+)'/g)]).map(m => m[1]))];
    check(`${table}.activity_type has a CHECK`, defs.length > 0, defs.join(' | '));
    check(
        `${table}.activity_type matches ACTIVITY_TYPES`,
        dbTypes.length === clientTypes.length && clientTypes.every(t => dbTypes.includes(t)),
        `db: ${dbTypes.join(',')} | client: ${clientTypes.join(',')}`,
    );
}

// Reading a CHECK definition is not the same as the CHECK firing. Assert the
// rejection too: a CHECK that exists but does not constrain is the exact failure
// this file exists to catch, and `defs.length > 0` alone cannot tell them apart.
//
// Three details keep the probe honest rather than incidentally passing:
//
//  - user_id is ALICE, not gen_random_uuid(). Every one of these tables has an FK
//    to auth.users, so a random uuid trips that FK first and the insert is
//    refused for a reason that has nothing to do with activity_type.
//  - the error must name the CHECK. An FK refusal matches /violates/ too, so
//    matching on that alone would let this pass with the CHECK still absent.
//  - the whole thing runs in a transaction that is rolled back either way, so a
//    CHECK that does *not* fire leaves the table exactly as it found it and the
//    checks after this cannot be reading a probe row. PGlite's `transaction`
//    rolls back on a throw, and an accepted insert is turned into a throw by the
//    sentinel below -- so both outcomes leave nothing behind.
const ACCEPTED = Symbol('probe-accepted');
for (const [table, insert] of [
    ['workout_template_exercises',
        `(workout_template_id, user_id, day_of_week, exercise_name, activity_type)
         values (gen_random_uuid(), '${ALICE}', 0, 'verify-schema-probe', 'yoga')`],
    ['workout_exercises_log',
        `(workout_completion_id, user_id, exercise_name, activity_type)
         values (gen_random_uuid(), '${ALICE}', 'verify-schema-probe', 'yoga')`],
]) {
    let message = '';
    try {
        await db.transaction(async tx => {
            await tx.exec(`insert into public.${table} ${insert}`);
            throw ACCEPTED;
        });
    } catch (e) {
        if (e !== ACCEPTED) message = e.message;
    }
    check(
        `${table}.activity_type CHECK rejects a value outside ACTIVITY_TYPES`,
        /activity_type/i.test(message),
        message
            ? message.split('\n')[0]
            : 'the insert was accepted, so the CHECK is not enforcing',
    );
}

// The library's upsert key. PostgREST reads on_conflict as a comma-separated list
// of plain column names, so this has to be real columns: it was `user_id,lower(name)`
// once, which it parsed as three columns named user_id, lower and name, and every
// sync failed. 0009 moved it to (user_id, wger_id).
//
// Scoped to syncExerciseLibrary's own body -- the file has four `onConflict`
// targets, and the first one in the file is the exercise reorder's `id`.
const svcSrc = readFileSync('src/services/workoutService.ts', 'utf8');
const syncBody = svcSrc.slice(
    svcSrc.indexOf('export const syncExerciseLibrary'),
    svcSrc.indexOf('export const', svcSrc.indexOf('export const syncExerciseLibrary') + 10),
);
const conflictTarget = syncBody.match(/onConflict:\s*'([^']+)'/)?.[1];
check('the library sync upsert names plain columns',
    !!conflictTarget && !/[()\s]/.test(conflictTarget),
    conflictTarget ?? 'not found in syncExerciseLibrary');
check(
    'the library sync upsert target has a unique index',
    hasUnique('exercises', (conflictTarget ?? '').split(',').map(s => s.trim()).join(', ')),
    `target: ${conflictTarget}`,
);
check('exercises has no unique constraint on lower(name)',
    !uniqueRules.some(row => row.table === 'exercises' && /lower/.test(row.def)),
    uniqueRules.filter(row => row.table === 'exercises').map(row => row.def).join(' | '));
const muscleCols = (await db.query(
    `select data_type, udt_name from information_schema.columns
      where table_schema='public' and table_name='exercises' and column_name in ('muscles','aliases')`,
)).rows;
check('exercises.muscles is text[]', muscleCols.some(r => r.udt_name === '_text'),
    muscleCols.map(r => `${r.udt_name}`).join(','));
check('exercises.aliases is text[]', muscleCols.some(r => r.udt_name === '_text'),
    muscleCols.map(r => `${r.udt_name}`).join(','));

await db.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
