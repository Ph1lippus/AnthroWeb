// Runs the real migration files against a real Postgres (PGlite/WASM), on a
// schema mirroring sql.sql, then exercises the RLS as the authenticated role.
// Catches the column-name and syntax class of error eyeballing cannot, and
// verifies the policies actually restrict rather than merely existing.
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
const BOB = '22222222-2222-2222-2222-222222222222';

// ---- bootstrap ----
// Supabase provides these roles; PGlite does not, and 0007 grants to
// `authenticated`, so without them the script fails at a point unrelated to its
// actual logic.
await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create or replace function auth.uid() returns uuid
        language sql stable as $$
            select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
    create schema if not exists public;
`);

// Exactly the notes table from sql.sql.
await db.exec(`
    CREATE TABLE public.notes (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      title text NOT NULL,
      content text NOT NULL DEFAULT ''::text,
      is_pinned boolean DEFAULT false,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now(),
      CONSTRAINT notes_pkey PRIMARY KEY (id),
      CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
    );
`);

await db.exec(`insert into auth.users (id) values ('${ALICE}'), ('${BOB}');`);
await db.exec(`insert into public.notes (user_id, title) values ('${ALICE}', 'Existing note');`);

// Supabase's default table grants, which the migrations assume exist.
await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on public.notes to authenticated;
`);

const applyMigration = async (label, path) => {
    try {
        await db.exec(readFileSync(path, 'utf8'));
        console.log(`\n-- ${label}: applied`);
        return true;
    } catch (e) {
        console.log(`\n-- ${label}: FAILED -> ${e.message}`);
        return false;
    }
};

console.log('\n== migrations ==');
check('0006 applies cleanly', await applyMigration('0006', 'supabase/migrations/0006_notes_editor.sql'));
check('0007 applies cleanly', await applyMigration('0007', 'supabase/migrations/0007_notes_pages.sql'));

console.log('\n== columns ==');
const cols = (await db.query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='notes' order by column_name`,
)).rows.map(r => r.column_name);
for (const c of ['title','is_pinned','notes_color','notes_icon','notes_cover','notes_parent_id','notes_deleted_at','notes_tags']) {
    check(`column ${c}`, cols.includes(c), cols.join(','));
}
check('no unprefixed deleted_at column', !cols.includes('deleted_at'));

console.log('\n== title is nullable ==');
const nullability = (await db.query(
    `select is_nullable from information_schema.columns
      where table_schema='public' and table_name='notes' and column_name='title'`,
)).rows[0];
check('title allows null', nullability.is_nullable === 'YES', nullability.is_nullable);

console.log('\n== indexes ==');
const idx = (await db.query(
    `select indexname from pg_indexes where schemaname='public' and tablename='notes'`,
)).rows.map(r => r.indexname);
for (const i of ['notes_user_live_updated_idx','notes_user_live_pinned_updated_idx','notes_user_parent_idx','notes_tags_idx']) {
    check(`index ${i}`, idx.includes(i), idx.join(','));
}

console.log('\n== policies exist ==');
const pol = (await db.query(`select policyname from pg_policies where tablename='notes'`)).rows.map(r => r.policyname);
for (const p of ['notes_select','notes_insert','notes_update','notes_delete']) {
    check(`policy ${p}`, pol.includes(p), pol.join(','));
}

// ---------------------------------------------------------------------------
// RLS behaviour, as the authenticated role. The table owner bypasses RLS, so
// every query below switches role first -- otherwise these assertions pass
// vacuously and prove nothing.
// ---------------------------------------------------------------------------
const asUser = async (uid, fn) => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
    try { return await fn(); } finally { await db.exec('reset role;'); }
};

console.log('\n== RLS as authenticated ==');
check('authenticated role is not the owner',
    (await db.query(`select rolsuper, rolbypassrls from pg_roles where rolname='authenticated'`)).rows[0].rolbypassrls === false);

await asUser(ALICE, async () => {
    const all = (await db.query('select title from public.notes')).rows.map(r => r.title);
    check('owner reads own note', all.includes('Existing note'), all.join(','));

    const blank = (await db.query(
        `insert into public.notes (user_id, title, content) values ('${ALICE}', '', '') returning id`,
    )).rows[0];
    check('blank page can be created (title nullable)', !!blank);

    const child = (await db.query(
        `insert into public.notes (user_id, title, notes_parent_id)
         values ('${ALICE}','Child','${blank.id}') returning id`,
    )).rows[0];
    check('child can be parented to own page', !!child);

    // Self-parenting must be refused.
    const selfParent = await quiet(() => db.query(
        `update public.notes set notes_parent_id = id where id = '${blank.id}'`,
    ))();
    check('page cannot become its own parent', !!selfParent.__error, selfParent.__error ?? 'was allowed');

    // Tag round-trip.
    const tagged = await quiet(() => db.query(
        `update public.notes set notes_tags = array['exam','notes'] where id = '${child.id}' returning notes_tags`,
    ))();
    check('tags can be written', !tagged.__error && /exam/.test(String(tagged.rows[0].notes_tags)), tagged.__error ?? String(tagged.rows[0].notes_tags));

    // Soft delete hides it from the live list.
    await db.query(`update public.notes set notes_deleted_at = now() where id = '${child.id}'`);
    const live = (await db.query(`select title from public.notes where notes_deleted_at is null`)).rows.map(r => r.title);
    check('trashed page leaves the live list', !live.includes('Child'), live.join(','));
    const bin = (await db.query(`select title from public.notes where notes_deleted_at is not null`)).rows.map(r => r.title);
    check('trashed page is in the trash query', bin.includes('Child'), bin.join(','));
});

await asUser(BOB, async () => {
    const seen = (await db.query('select title from public.notes')).rows.map(r => r.title);
    check('other account sees nothing of alice', !seen.includes('Existing note') && !seen.includes('Child'), seen.join(',') || '(empty)');

    const aliceChild = (await db.query(`select id from public.notes`)).rows[0];
    if (aliceChild) {
        const stolen = await quiet(() => db.query(`delete from public.notes where id = '${aliceChild.id}'`))();
        check('cannot delete another account note', !!stolen.__error, stolen.__error ?? 'was allowed');
    }

    const parented = await quiet(() => db.query(
        `insert into public.notes (user_id, title, notes_parent_id) values ('${BOB}','mine', gen_random_uuid())`,
    ))();
    check('cannot parent to a non-existent/foreign parent', !!parented.__error, parented.__error ?? 'was allowed');
});

console.log('\n== restore while parent is trashed ==');
const parentRow = (await db.query(
    `select id from public.notes where title = 'Child' limit 1`,
)).rows[0];
await asUser(ALICE, async () => {
    // Trash the parent as well, then restore the child. This is the sequence the
    // relaxed parent check exists for.
    await db.query(`update public.notes set notes_deleted_at = now() where title = ''`);
    const restored = await quiet(() => db.query(
        `update public.notes set notes_deleted_at = null where id = '${parentRow.id}' returning id`,
    ))();
    check('restore works while parent is trashed', !restored.__error, restored.__error ?? 'ok');
});

console.log('\n== idempotency ==');
check('0006 re-runs cleanly', await applyMigration('0006 again', 'supabase/migrations/0006_notes_editor.sql'));
check('0007 re-runs cleanly', await applyMigration('0007 again', 'supabase/migrations/0007_notes_pages.sql'));

await db.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
