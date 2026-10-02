// Verifies sql.sql -- the schema of record -- against the invariants the app's
// queries actually depend on, by applying it to a real Postgres (PGlite/WASM) and
// exercising it.
//
// This replaced an earlier harness that applied per-step files from
// supabase/migrations. Those files are gone by design: the schema is maintained in
// sql.sql, so applying sql.sql itself is both closer to the truth and impossible to
// silently drift from, where a hand-copied table in a test script can differ from
// the real schema while every assertion still passes.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

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

// ---- bootstrap -------------------------------------------------------------
// sql.sql is a context dump, not a runnable file: every table carries a foreign key
// into auth.users, which only exists inside Supabase. Creating that one table is all
// it takes to make the whole dump apply -- and it is done before loading, because
// the very first CREATE TABLE references it.
await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
`);

console.log('\n== sql.sql applies ==');
const schemaApplied = await quiet(() => db.exec(readFileSync('sql.sql', 'utf8')))();
check('applies cleanly', !schemaApplied.__error, schemaApplied.__error ?? '');

const tables = (await db.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
)).rows.map(r => r.table_name);
check('all 34 tables are created', tables.length === 34, `${tables.length} tables`);

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

await db.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);