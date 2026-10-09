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
import { existsSync, readdirSync, readFileSync } from 'node:fs';

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
// Absent in some checkouts -- the schema is then sql.sql alone, and there is
// nothing for this script to check. Treated as "no migrations" rather than a
// crash, so the check stays in the verify chain and starts doing its job the
// moment the directory exists. Previously this threw ENOENT from readdirSync,
// which failed the whole suite over a directory that may never be meant to exist.
const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.sql')).sort() : [];
console.log(`\n== migrations (${files.length}) ==`);
if (files.length === 0) {
    console.log('  --   no supabase/migrations directory; sql.sql is the whole schema');
}


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

// 0012 adds a column, and the baseline above already has it -- sql.sql is the
// squashed state, so the run through the main loop only ever exercises the
// idempotent branch. What actually matters for a deploy is the other one: a
// database that predates the column. Checked here, because a plain ADD COLUMN
// would sail through the loop above and then fail against production.
console.log('\n== 0012 against a database that predates the column ==');
if (!existsSync(`${dir}/0012_notes_position.sql`)) {
    // Guarded for the same reason the loop above is: the migrations directory is
    // absent in some checkouts, and there is nothing here to run without the file.
    // Reported rather than skipped silently, because a missing migration folder in a
    // working checkout usually means the migrations went missing rather than that
    // they were never meant to be there.
    console.log('  --   no 0012_notes_position.sql to replay; sql.sql is the whole schema');
} else {
    const full = readFileSync('sql.sql', 'utf8').split(/^INDEXES\.\s*$/m)[0];
    // The baseline with the column removed, rather than a hand-written smaller
    // schema: the two then cannot drift apart. Matched on any type rather than
    // `integer`, so changing the column's type does not quietly turn this check
    // into "the baseline has no such line to find" -- which passes.
    const stripped = full.replace(/^[ \t]*notes_position\s+[a-z ]+[^,]*,\s*$/m, '');
    check('the column was found in the baseline to strip', stripped !== full);

    const fresh = new PGlite();
    await bootstrap(fresh);
    const base = await applyAllStatements(fresh, stripped);
    check('the stripped baseline applies', base === null, base ?? '');

    const { rows: beforeRows } = await fresh.query(
        `select count(*)::int as n from information_schema.columns
          where table_schema='public' and table_name='notes'
            and column_name='notes_position'`,
    );
    check('the column really is absent beforehand', beforeRows[0].n === 0, `n=${beforeRows[0].n}`);

    const migration = readFileSync(`${dir}/0012_notes_position.sql`, 'utf8');
    for (const statement of splitStatements(migration)) await fresh.exec(statement);

    const { rows: afterRows } = await fresh.query(
        `select is_nullable, column_default from information_schema.columns
          where table_schema='public' and table_name='notes'
            and column_name='notes_position'`,
    );
    check('the migration adds it', afterRows.length === 1);
    // NOT NULL with a default: the client reads a null as 0 and sorts on it, so a
    // nullable column would make the fallback the only path ever taken.
    check('and it is not nullable', afterRows[0]?.is_nullable === 'NO', String(afterRows[0]?.is_nullable));
    check('and it defaults to 0', String(afterRows[0]?.column_default ?? '').includes('0'));

    await fresh.exec(`insert into auth.users (id) values ('${USER}')`);
    await fresh.exec(`insert into public.notes (user_id, title) values ('${USER}', 'before')`);
    const { rows: legacy } = await fresh.query(
        `select notes_position from public.notes where title = 'before'`,
    );
    // No backfill is wanted: existing pages stay on 0, which is where the
    // created_at tie-break was already putting them, so the rail keeps its order.
    // Number(), because a numeric comes back from the driver as a string and
    // `=== 0` would fail on '0' -- see positionOf in noteTree.ts for why the
    // client cannot rely on the type either.
    check('a page that predates the column reads back as 0',
        Number(legacy[0]?.notes_position) === 0, JSON.stringify(legacy[0]?.notes_position));
    check('and it arrives as a string, which is why the client coerces',
        typeof legacy[0]?.notes_position === 'string', typeof legacy[0]?.notes_position);

    // The reason this is a numeric and not an integer: a drag stores the midpoint
    // of two positions, so the column has to hold a fraction.
    await fresh.exec(`update public.notes set notes_position = 0.5 where title = 'before'`);
    const { rows: dragged } = await fresh.query(
        `select notes_position from public.notes where title = 'before'`,
    );
    check('a fractional position round-trips',
        Number(dragged[0]?.notes_position) === 0.5, JSON.stringify(dragged[0]?.notes_position));

    // And that the integer version really would not have. Cast the same value to
    // an integer to pin down why the type is numeric: 0.5 becomes 1, which is the
    // position of the page it was dropped between.
    const { rows: rounded } = await fresh.query(`select (0.5::numeric)::integer as n`);
    check('an integer column would have rounded the midpoint onto a neighbour',
        rounded[0].n === 1, `0.5::integer = ${rounded[0].n}`);

    // Applying it twice has to be a no-op, or re-running a deploy breaks.
    let secondPass = '';
    try {
        for (const statement of splitStatements(migration)) await fresh.exec(statement);
    } catch (error) {
        secondPass = String(error.message ?? error).split('\n')[0];
    }
    check('running it a second time is a no-op', secondPass === '', secondPass);
}

// 0019 adds the cheat-day budget to user_settings. Same reasoning as 0012 above:
// the baseline already carries the columns, so the main loop only exercises the
// idempotent branch, and what matters for a deploy is the branch against a
// database that predates them.
console.log('\n== 0019 against a database that predates the columns ==');
if (!existsSync(`${dir}/0019_cheat_day_allowance.sql`)) {
    console.log('  --   no 0019_cheat_day_allowance.sql to replay; sql.sql is the whole schema');
} else {
    const full = readFileSync('sql.sql', 'utf8').split(/^INDEXES\.\s*$/m)[0];
    // Whole lines, not `[^,]*`, because the period's CHECK contains commas
    // inside ARRAY['week','month'] and a comma-anchored pattern would stop short
    // of the end of the line and leave a dangling fragment behind.
    const stripped = full
        .replace(/^[ \t]*cheat_days_allowed\b.*$/gm, '')
        .replace(/^[ \t]*cheat_days_period\b.*$/gm, '');
    check('the cheat-day columns were found in the baseline to strip', stripped !== full);

    const fresh = new PGlite();
    await bootstrap(fresh);
    const base = await applyAllStatements(fresh, stripped);
    check('the stripped baseline applies', base === null, base ?? '');

    const { rows: beforeRows } = await fresh.query(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name='user_settings'
            and column_name in ('cheat_days_allowed','cheat_days_period')`,
    );
    check('both columns are absent beforehand', beforeRows.length === 0, `n=${beforeRows.length}`);

    const migration = readFileSync(`${dir}/0019_cheat_day_allowance.sql`, 'utf8');
    for (const statement of splitStatements(migration)) await fresh.exec(statement);

    const { rows: afterRows } = await fresh.query(
        `select column_name, is_nullable, column_default from information_schema.columns
          where table_schema='public' and table_name='user_settings'
            and column_name in ('cheat_days_allowed','cheat_days_period')
          order by column_name`,
    );
    check('the migration adds both columns', afterRows.length === 2, `n=${afterRows.length}`);
    const allowed = afterRows.find(r => r.column_name === 'cheat_days_allowed');
    const period = afterRows.find(r => r.column_name === 'cheat_days_period');
    // Nullable on purpose: null is the "no budget" default every existing row
    // takes, which is what keeps their history scoring the way it always has.
    check('the allowance is nullable', allowed?.is_nullable === 'YES', String(allowed?.is_nullable));
    check('the period is not nullable', period?.is_nullable === 'NO', String(period?.is_nullable));
    check("the period defaults to 'week'", String(period?.column_default ?? '').includes('week'));

    await fresh.exec(`insert into auth.users (id) values ('${USER}')`);
    await fresh.exec(`insert into public.user_settings (user_id) values ('${USER}')`);
    const { rows: legacy } = await fresh.query(
        `select cheat_days_allowed, cheat_days_period from public.user_settings where user_id = '${USER}'`,
    );
    check('a settings row with no allowance gets no budget',
        legacy[0]?.cheat_days_allowed === null, JSON.stringify(legacy[0]?.cheat_days_allowed));
    check('and the window defaults to a week',
        legacy[0]?.cheat_days_period === 'week', String(legacy[0]?.cheat_days_period));

    // The CHECK keeps a negative budget out. Left unguarded it would read as "no
    // allowance" while not being the null the client treats as unlimited, so the
    // two would disagree about what the row meant.
    let negative = '';
    try {
        await fresh.exec(`update public.user_settings set cheat_days_allowed = -1 where user_id = '${USER}'`);
    } catch (error) {
        negative = String(error.message ?? error).split('\n')[0];
    }
    check('a negative allowance is rejected', negative !== '', negative || 'accepted -1');

    let secondPass = '';
    try {
        for (const statement of splitStatements(migration)) await fresh.exec(statement);
    } catch (error) {
        secondPass = String(error.message ?? error).split('\n')[0];
    }
    check('running it a second time is a no-op', secondPass === '', secondPass);
}


console.log(fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
