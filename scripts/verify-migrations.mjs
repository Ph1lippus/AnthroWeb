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

// What the client actually sends: a base64 string as a plain SQL literal into a
// `bytea` column. Not a `\x` literal, which is the other way to write one. Used
// by both halves of the 0027 section below, so it lives out here rather than
// being declared inside either of them.
const SALT = 'q83v1pQ0Y8mZ2rT7wX9cV4bN6hJ1kL5dF0gA3sUyE8=';
const WRAPPED = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2G3h4I5j6K7l8M9n0=';
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

// 0020 pins the intended default (one free cheat day) and backfills the rows
// 0019 created as null. 0019's own test above asserts it still leaves a fresh
// row null, which is what makes 0020 the migration that decides the meaning.
console.log('\n== 0020 defaults the allowance to one ==');
if (!existsSync(`${dir}/0020_cheat_day_default.sql`)) {
    console.log('  --   no 0020_cheat_day_default.sql to replay');
} else {
    const full2 = readFileSync('sql.sql', 'utf8').split(/^INDEXES\.\s*$/m)[0];
    const stripped2 = full2
        .replace(/^[ \t]*cheat_days_allowed\b.*$/gm, '')
        .replace(/^[ \t]*cheat_days_period\b.*$/gm, '');

    const fresh2 = new PGlite();
    await bootstrap(fresh2);
    const base2 = await applyAllStatements(fresh2, stripped2);
    check('the stripped baseline applies', base2 === null, base2 ?? '');
    for (const statement of splitStatements(readFileSync(`${dir}/0019_cheat_day_allowance.sql`, 'utf8'))) {
        await fresh2.exec(statement);
    }

    await fresh2.exec(`insert into auth.users (id) values ('${USER}')`);
    await fresh2.exec(`insert into public.user_settings (user_id) values ('${USER}')`);
    const { rows: before2 } = await fresh2.query(
        `select cheat_days_allowed from public.user_settings where user_id = '${USER}'`,
    );
    check('the row 0019 created has no allowance yet', before2[0]?.cheat_days_allowed === null,
        JSON.stringify(before2[0]?.cheat_days_allowed));

    for (const statement of splitStatements(readFileSync(`${dir}/0020_cheat_day_default.sql`, 'utf8'))) {
        await fresh2.exec(statement);
    }

    const { rows: backfilled } = await fresh2.query(
        `select cheat_days_allowed from public.user_settings where user_id = '${USER}'`,
    );
    check('a pre-existing null allowance is backfilled to one',
        backfilled[0]?.cheat_days_allowed === 1, JSON.stringify(backfilled[0]?.cheat_days_allowed));

    const { rows: def } = await fresh2.query(
        `select column_default from information_schema.columns
          where table_schema='public' and table_name='user_settings' and column_name='cheat_days_allowed'`,
    );
    check('the column default is one', String(def[0]?.column_default ?? '').includes('1'), String(def[0]?.column_default));

    // A deliberate "no limit" is a null the user set, and there is no trigger to
    // re-apply the default, so a later clear stays cleared.
    await fresh2.exec(`update public.user_settings set cheat_days_allowed = null where user_id = '${USER}'`);
    const { rows: cleared } = await fresh2.query(
        `select cheat_days_allowed from public.user_settings where user_id = '${USER}'`,
    );
    check('clearing the allowance still stores null', cleared[0]?.cheat_days_allowed === null,
        JSON.stringify(cleared[0]?.cheat_days_allowed));

    let second2 = '';
    try {
        for (const statement of splitStatements(readFileSync(`${dir}/0020_cheat_day_default.sql`, 'utf8'))) await fresh2.exec(statement);
    } catch (error) {
        second2 = String(error.message ?? error).split('\n')[0];
    }
    check('running 0020 twice is a no-op', second2 === '', second2);
}

// 0027 converts the wrapped keys from `bytea` to `text`. Applying cleanly is the
// easy half and the main loop above already proves it; what matters is the value
// that comes out the other side, because the two obvious conversions disagree and
// only one of them is right.
//
// The client writes base64 *text* into these columns. Postgres reads a plain
// string into `bytea` as escape format, so the bytes stored are the ASCII of that
// base64. `convert_from(col,'UTF8')` reads them back as text and gets the base64
// again. `encode(col,'base64')` would re-encode those ASCII bytes and produce a
// string that decodes to the base64 text rather than to the key -- a wrong answer
// that looks like a working one, which is the worst shape for this to fail in.
console.log('\n== 0027 converts a bytea key column without mangling it ==');
if (!existsSync(`${dir}/0027_key_material_text.sql`)) {
    console.log('  --   no 0027_key_material_text.sql to replay');
} else {
    const fresh3 = new PGlite();
    await bootstrap(fresh3);
    const base3 = await applyAllStatements(fresh3, runnable);
    check('the baseline applies', base3 === null, base3 ?? '');
    for (const file of ['0024_vault.sql', '0025_note_lock_recovery.sql']) {
        for (const statement of splitStatements(readFileSync(`${dir}/${file}`, 'utf8'))) {
            await fresh3.exec(statement);
        }
    }

    const { rows: typesBefore } = await fresh3.query(
        `select table_name, column_name, data_type from information_schema.columns
          where table_schema='public'
            and (table_name, column_name) in (
              ('user_settings','vault_pin_salt'), ('user_settings','vault_pin_wrapped'),
              ('notes','lock_salt'), ('notes','lock_key_pin'))`,
    );
    check('0024 really did declare them bytea',
        typesBefore.length === 4 && typesBefore.every(r => r.data_type === 'bytea'),
        JSON.stringify(typesBefore.map(r => `${r.table_name}.${r.column_name}=${r.data_type}`)));

    await fresh3.exec(`insert into auth.users (id) values ('${USER}')`);

    // Exactly what the client sends: a base64 string as a plain SQL literal into a
    // bytea column. Not a `\x` literal, which is the other way to write one.
    await fresh3.exec(
        `insert into public.user_settings
            (user_id, vault_enabled, vault_version, vault_pin_salt, vault_pin_iterations,
             vault_pin_wrapped, vault_recovery_salt, vault_recovery_iterations, vault_recovery_wrapped)
         values ('${USER}', true, 1, '${SALT}', 600000, '${WRAPPED}',
                 '${SALT}', 600000, '${WRAPPED}')`,
    );
    await fresh3.exec(
        `insert into public.notes (user_id, title, lock_enabled, lock_salt, lock_iterations, lock_key_pin)
         values ('${USER}', 'Locked page', true, '${SALT}', 600000, '${WRAPPED}')`,
    );

    // What PostgREST sends back while the column is still bytea. This is the exact
    // string that reached `atob` and produced
    // "Failed to execute 'atob' on 'Window': The string to be decoded is not
    // correctly encoded."
    const { rows: hexBefore } = await fresh3.query(
        `select lock_salt::text as raw from public.notes where title = 'Locked page'`,
    );
    check('a bytea column reaches the client as \\x-prefixed hex',
        /^\\x[0-9a-f]+$/.test(hexBefore[0]?.raw ?? ''), String(hexBefore[0]?.raw));
    check('which is not something atob accepts',
        !/^[A-Za-z0-9+/]*={0,2}$/.test(hexBefore[0]?.raw ?? ''), String(hexBefore[0]?.raw));

    const migration3 = readFileSync(`${dir}/0027_key_material_text.sql`, 'utf8');
    for (const statement of splitStatements(migration3)) await fresh3.exec(statement);

    const { rows: typesAfter } = await fresh3.query(
        `select table_name, column_name, data_type from information_schema.columns
          where table_schema='public'
            and (table_name, column_name) in (
              ('user_settings','vault_pin_salt'), ('user_settings','vault_pin_wrapped'),
              ('user_settings','account_recovery_verifier'),
              ('notes','lock_salt'), ('notes','lock_key_pin'), ('notes','lock_key_account'))`,
    );
    check('every one of them is text now',
        typesAfter.length === 6 && typesAfter.every(r => r.data_type === 'text'),
        JSON.stringify(typesAfter.map(r => `${r.table_name}.${r.column_name}=${r.data_type}`)));

    const { rows: settings } = await fresh3.query(
        `select vault_pin_salt, vault_pin_wrapped from public.user_settings where user_id = '${USER}'`,
    );
    check('the stored salt comes back as the base64 that was written',
        settings[0]?.vault_pin_salt === SALT, String(settings[0]?.vault_pin_salt));
    check('and so does the wrapped key',
        settings[0]?.vault_pin_wrapped === WRAPPED, String(settings[0]?.vault_pin_wrapped));

    const { rows: note } = await fresh3.query(
        `select lock_salt, lock_key_pin from public.notes where title = 'Locked page'`,
    );
    check('and the page lock\'s salt and key',
        note[0]?.lock_salt === SALT && note[0]?.lock_key_pin === WRAPPED,
        JSON.stringify(note[0]));

    // The thing the wrong conversion produces, so the difference is on the record
    // rather than only implied: `encode(...,'base64')` of the same bytes.
    const { rows: doubled } = await fresh3.query(`select encode('${SALT}'::bytea, 'base64') as v`);
    check('encode() would have produced something else entirely',
        doubled[0].v !== SALT && doubled[0].v !== WRAPPED, doubled[0].v);

    // Untouched rows stay null rather than becoming the empty string, which would
    // read as "armed with no salt" rather than "never armed".
    await fresh3.exec(`insert into public.notes (user_id, title) values ('${USER}', 'Plain page')`);
    const { rows: plain } = await fresh3.query(
        `select lock_salt, lock_key_pin from public.notes where title = 'Plain page'`,
    );
    check('a page that was never locked still reads as null',
        plain[0]?.lock_salt === null && plain[0]?.lock_key_pin === null,
        JSON.stringify(plain[0]));

    // The armed-row CHECK has to survive the type change, and still mean what it
    // meant: a locked page with no PIN wrap is not a lock.
    let noWrap = '';
    try {
        await fresh3.exec(
            `insert into public.notes (user_id, title, lock_enabled, lock_salt, lock_iterations)
             values ('${USER}', 'Half armed', true, '${SALT}', 600000)`,
        );
    } catch (error) {
        noWrap = String(error.message ?? error).split('\n')[0];
    }
    check('and a locked page with no PIN wrap is still refused', noWrap !== '', noWrap || 'accepted');

    let second3 = '';
    try {
        for (const statement of splitStatements(migration3)) await fresh3.exec(statement);
    } catch (error) {
        second3 = String(error.message ?? error).split('\n')[0];
    }
    check('running 0027 twice is a no-op', second3 === '', second3);
    const { rows: stillThere } = await fresh3.query(
        `select vault_pin_salt from public.user_settings where user_id = '${USER}'`,
    );
    check('and the salt is not re-encoded on the second pass',
        stillThere[0]?.vault_pin_salt === SALT, String(stillThere[0]?.vault_pin_salt));
}

// 0027 was first written as one `DO $$` loop, and it worked here and failed in
// the dashboard with "relation \"column_type\" does not exist".
//
// `splitStatements` -- the helper above, and every migration harness in this repo
// -- understands dollar-quoted bodies. A SQL dashboard does not necessarily: it
// splits on `;` alone, cuts the block in half, and the fragment
// `SELECT format_type(...) INTO column_type ...` is *valid* plain SQL, because
// `SELECT ... INTO` in SQL means "into this table". So it ran, and failed on a
// relation nobody has ever heard of.
//
// A migration that only works under this repo's splitter is a migration that
// cannot be applied. These checks run the file the other way round: split on `;`
// alone, execute each piece on its own, and require the same result.
console.log('\n== 0027 survives being split on semicolons alone ==');
if (!existsSync(`${dir}/0027_key_material_text.sql`)) {
    console.log('  --   no 0027_key_material_text.sql to replay');
} else {
    const source = readFileSync(`${dir}/0027_key_material_text.sql`, 'utf8');

    const naive = source
        .split(';')
        .map(part => part.replace(/^\s*--.*$/gm, ''))
        .map(part => part.trim())
        .filter(Boolean);

    // Checked against the statements, not the file. The header explains at length
    // why there is no `DO $$` here, and it names `$$` and `DECLARE` while doing
    // it -- which is prose, and prose is exactly what a `;`-splitter throws away.
    const sql = naive.join('\n');
    check('no statement opens a dollar-quoted body',
        !sql.includes('$$'), 'a DO block cannot survive a client that splits on ;');
    check('and none carries plpgsql-only syntax',
        !/\bDO\b/i.test(sql) && !/\bDECLARE\b/i.test(sql) && !/\bRAISE\b/i.test(sql),
        'plpgsql only parses inside a dollar-quoted body');

    // The precondition underneath all of it. A splitter that cuts on the first
    // semicolon it finds also cuts a *comment* in half, and the tail no longer
    // starts with `--`, so it stops looking like prose and becomes the exact
    // broken fragment the error above describes. Not hypothetical either: this
    // file's own header did it until it was rewritten, and the check above caught
    // it by tripping on the word DO in a paragraph explaining DO.
    const semicolonsInComments = source
        .split(/\r?\n/)
        .map((line, i) => (/^\s*--/.test(line) && line.includes(';') ? i + 1 : 0))
        .filter(Boolean);
    check('no comment line carries a semicolon',
        semicolonsInComments.length === 0,
        semicolonsInComments.map(n => `line ${n}`).join(', '));

    // Applied to a database that already has the columns as bytea, written to
    // first, because a conversion that quietly does nothing would pass on an
    // empty table.
    const naive3 = new PGlite();
    await bootstrap(naive3);
    const naiveBase = await applyAllStatements(naive3, runnable);
    check('the baseline applies', naiveBase === null, naiveBase ?? '');
    for (const file of ['0024_vault.sql', '0025_note_lock_recovery.sql']) {
        for (const statement of splitStatements(readFileSync(`${dir}/${file}`, 'utf8'))) {
            await naive3.exec(statement);
        }
    }
    await naive3.exec(`insert into auth.users (id) values ('${USER}')`);
    await naive3.exec(
        `insert into public.user_settings (user_id, vault_pin_salt, vault_pin_iterations)
         values ('${USER}', '${SALT}', 600000)`,
    );

    const failures = [];
    for (const statement of naive) {
        // `BEGIN;` / `COMMIT;` are transaction control, and PGlite's `exec`
        // manages its own; running them through the loop adds nothing.
        if (/^(BEGIN|COMMIT|END)\b/i.test(statement)) continue;
        try {
            await naive3.exec(statement);
        } catch (error) {
            // Reported as it happens. One failure leaves the session inside an
            // aborted transaction, so every statement after it fails too and the
            // list at the end would name forty symptoms of one cause.
            failures.push(`${String(error.message ?? error).split('\n')[0]} << ${statement.slice(0, 90)}`);
            console.log(`   piece failed: ${failures[failures.length - 1]}`);
        }
    }
    check('every semicolon-separated piece runs on its own',
        failures.length === 0, failures.join(' | '));

    // Each piece gets its own session, because a failure aborts the one it was in.
    const after = new PGlite();
    await bootstrap(after);
    const afterBase = await applyAllStatements(after, runnable);
    check('a second baseline applies', afterBase === null, afterBase ?? '');
    for (const file of ['0024_vault.sql', '0025_note_lock_recovery.sql']) {
        for (const statement of splitStatements(readFileSync(`${dir}/${file}`, 'utf8'))) {
            await after.exec(statement);
        }
    }
    await after.exec(`insert into auth.users (id) values ('${USER}')`);
    await after.exec(
        `insert into public.user_settings (user_id, vault_pin_salt, vault_pin_iterations)
         values ('${USER}', '${SALT}', 600000)`,
    );
    for (const statement of naive) {
        if (/^(BEGIN|COMMIT|END)\b/i.test(statement)) continue;
        await after.exec(statement);
    }

    const { rows: naiveType } = await after.query(
        `select data_type from information_schema.columns
          where table_schema='public' and table_name='user_settings'
            and column_name='vault_pin_salt'`,
    );
    check('and the conversion still happened', naiveType[0]?.data_type === 'text',
        String(naiveType[0]?.data_type));
    const { rows: naiveValue } = await after.query(
        `select vault_pin_salt from public.user_settings where user_id = '${USER}'`,
    );
    check('with the stored base64 intact', naiveValue[0]?.vault_pin_salt === SALT,
        String(naiveValue[0]?.vault_pin_salt));
}


console.log(fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
