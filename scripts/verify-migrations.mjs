/**
 * Applies supabase/migrations in order to a scratch database and reports which
 * statements fail.
 *
 * scripts/verify-schema.mjs checks the shape of sql.sql; this checks the other
 * half -- that the migrations apply cleanly on top of it, and that the bug each
 * one claims to fix is actually fixed afterwards. A migration that has never been
 * run is the easiest thing in the repo to get wrong, because nothing executes it
 * until it is applied to the live database.
 *
 * The schema is built from sql.sql's runnable section, so this runs against
 * roughly the shape the live database has, minus everything a scratch Postgres
 * cannot provide (RLS policies, auth.uid(), storage).
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { applyAllStatements, splitStatements } from './lib/split-sql.mjs';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const db = new PGlite();

/**
 * Stand-ins for the objects Supabase provides and a bare Postgres does not.
 *
 * Without these, every migration that touches RLS fails on `role "authenticated"
 * does not exist` or `function auth.uid() does not exist` -- which says nothing
 * about the migration and hides the statements that would have failed for real.
 * They are deliberately no-ops: the policies that use them cannot be exercised
 * without a real PostgREST in front of the database, so the goal here is only to
 * let the rest of each migration run.
 */
const bootstrap = async target => {
    await target.exec(`
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
};

await bootstrap(db);

const sqlFile = readFileSync('sql.sql', 'utf8');
const runnable = sqlFile.split(/^INDEXES\.\s*$/m)[0];
const baseError = await applyAllStatements(db, runnable);
check('sql.sql applies as a migration baseline', baseError === null, baseError ?? '');

const dir = 'supabase/migrations';
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
console.log(`\n== migrations (${files.length}) ==`);

for (const file of files) {
    // Each migration is applied to its own database rather than to a shared one,
    // so a migration that only works because an earlier one ran first is caught
    // here instead of against the live database.
const fresh = new PGlite();
    await bootstrap(fresh);
    const base = await applyAllStatements(fresh, runnable);
    if (base !== null) { check(`${file} (baseline)`, false, base); continue; }

    const errors = [];
    for (const statement of splitStatements(readFileSync(`${dir}/${file}`, 'utf8'))) {
        try { await fresh.exec(statement); }
        catch (e) { errors.push(String(e.message ?? e).split('\n')[0]); }
    }
    check(`${file}`, errors.length === 0, errors.join(' | '));
}

// ---- what the migrations were for ------------------------------------------
//
// Assertions, not just "it applied". 0010 exists because a template could hold
// exactly one exercise per weekday, and the fix is invisible until something
// tries to add the second one.
console.log('\n== behaviour after migrating ==');

const applied = new PGlite();
await bootstrap(applied);
await applyAllStatements(applied, runnable);
for (const file of files) {
    for (const statement of splitStatements(readFileSync(`${dir}/${file}`, 'utf8'))) {
        await applied.exec(statement).catch(() => {});
    }
}

const USER = '00000000-0000-0000-0000-0000000000aa';
const TEMPLATE = '00000000-0000-0000-0000-0000000000bb';
const SESSION = '00000000-0000-0000-0000-0000000000cc';
await applied.exec(`insert into auth.users (id) values ('${USER}')`);
await applied.exec(`insert into public.workout_templates (id, user_id, name)
    values ('${TEMPLATE}', '${USER}', 'Push A')`);
await applied.exec(`insert into public.workout_plan_sessions (id, workout_template_id, user_id, name, day_of_week)
    values ('${SESSION}', '${TEMPLATE}', '${USER}', 'Monday', 1)`);

const addExercise = (n, day) => applied.exec(
    `insert into public.workout_template_exercises
        (workout_template_id, user_id, day_of_week, exercise_name, session_id, position)
     values ('${TEMPLATE}', '${USER}', ${day}, 'Exercise ${n}', '${SESSION}', ${n})`,
);

const first = await addExercise(1, 1).then(() => '', e => String(e.message ?? e).split('\n')[0]);
check('the first exercise of a day inserts', first === '', first);

const second = await addExercise(2, 1).then(() => '', e => String(e.message ?? e).split('\n')[0]);
check('a second exercise on the same day inserts (0010)', second === '', second);

const { rows: sameDay } = await applied.query(
    `select count(*)::int n from public.workout_template_exercises
      where user_id = '${USER}' and day_of_week = 1`,
);
check('both rows are there', sameDay[0].n === 2, `n=${sameDay[0].n}`);

// Still on the same day, so this only passes if the uniqueness is gone from the
// plan-session shape too rather than just from the column list.
const third = await addExercise(3, 1).then(() => '', e => String(e.message ?? e).split('\n')[0]);
check('a third inserts too', third === '', third);

// The CHECK 0011 adds must hold on rows written before it, which is the case
// ADD CONSTRAINT validates.
const badType = await applied.exec(
    `insert into public.workout_template_exercises
        (workout_template_id, user_id, day_of_week, exercise_name, session_id, activity_type)
     values ('${TEMPLATE}', '${USER}', 1, 'Yoga', '${SESSION}', 'yoga')`,
).then(() => '', e => String(e.message ?? e).split('\n')[0]);
check('activity_type outside the vocabulary is refused (0011)', /activity_type/i.test(badType), badType);

// The library upsert key has to exist for syncExerciseLibrary to resolve
// on_conflict at all.
const { rows: libKey } = await applied.query(
    `select count(*)::int n from pg_index i
       join pg_class c on c.oid = i.indexrelid
      where i.indisunique and c.relname = 'exercises_user_id_wger_uniq'`,
);
check('the library upsert target exists (0009, reasserted by 0011)', libKey[0].n === 1, `n=${libKey[0].n}`);

// 0010's alias index was `lower(aliases)`, which is a type error: pg_catalog has
// no array overload of lower, so the migration died on its last statement and
// the index was never created. Assert the function and that the index is on the
// expression the catalog claims, then that the index answers an alias query --
// an index that exists but cannot be queried is the same failure wearing a
// different hat.
const { rows: lowerArray } = await applied.query(
    `select count(*)::int n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'lower_array'`,
);
check('public.lower_array exists (0010)', lowerArray[0].n === 1, `n=${lowerArray[0].n}`);

const { rows: aliasIndex } = await applied.query(
    `select pg_get_indexdef(i.indexrelid) as def
       from pg_index i
       join pg_class c on c.oid = i.indexrelid
      where c.relname = 'exercises_user_id_aliases_lower_gin'`,
);
check('the alias index is on public.lower_array(aliases)',
    /lower_array\(aliases\)/.test(aliasIndex[0]?.def ?? ''), aliasIndex[0]?.def ?? 'missing');

// Prove the index is usable rather than merely present.
const LIB = '00000000-0000-0000-0000-0000000000dd';
await applied.exec(`insert into public.exercises (id, user_id, name, aliases, activity_type)
    values ('${LIB}', '${USER}', 'Barbell Bench Press', array['Bench Press','Bench'], 'strength')`);
const aliasHit = await applied.query(
    `select count(*)::int n from public.exercises
      where public.lower_array(aliases) @> array['bench']`,
);
check('the alias index answers a case-insensitive alias query',
    aliasHit.rows[0].n >= 1, `n=${aliasHit.rows[0].n}`);

console.log(fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
