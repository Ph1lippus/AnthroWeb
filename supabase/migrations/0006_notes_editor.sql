-- =============================================================================
-- Notes: support the Notion-style page editor.
--
-- The notes page moved from a modal editor with an explicit Save button to a
-- full-page editor that autosaves ~1.5s after you stop typing. Three things have
-- to change for that to be correct:
--
--   1. `title` can no longer be NOT NULL. Creating a page and naming it as you
--      type means the first save has an empty title. The old constraint made a
--      blank page impossible to persist.
--
--   2. Row level security, which notes has never had. Migration 0003 enabled
--      RLS across the academic tables and explicitly deferred this one
--      ("those have their own access patterns ... and want a separate,
--      reviewed migration"). Filtering by user_id in the client is not a
--      security boundary: without RLS any authenticated user can read, change
--      or delete another user's notes through the Supabase API. That was
--      survivable at one write per deliberate click. It is not survivable when
--      every idle pause in the editor issues an UPDATE.
--
--   3. An index matching the list query exactly, so the notes page does not
--      sort the whole table on every load and every autosave invalidation.
--
-- Content format is deliberately unchanged: `content` stays `text` holding HTML.
-- The editor parses HTML in and serialises HTML out, so existing notes keep
-- rendering with no backfill step.
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema
-- -----------------------------------------------------------------------------

-- A page is created blank and titled as you type, so the first write is often an
-- empty title. Dropping the constraint is what makes that possible; the client
-- renders a blank title as "Untitled".
alter table public.notes
    alter column title drop not null;

-- Accent colour for the page, stored as a CSS colour string so adding a new
-- option later is a client-only change. Null means "no accent".
alter table public.notes
    add column if not exists notes_color text;

comment on column public.notes.notes_color is
    'Optional page accent colour, stored as a CSS colour string. Null renders no accent.';

-- The client has always typed is_pinned as a plain boolean, but the column was
-- declared nullable with no NOT NULL. Existing rows may already hold NULL,
-- which sorts unpredictably against `is_pinned desc` in the list query, so the
-- backfill has to run before the constraint can be added.
update public.notes
   set is_pinned = false
 where is_pinned is null;

alter table public.notes
    alter column is_pinned set default false;

alter table public.notes
    alter column is_pinned set not null;

-- -----------------------------------------------------------------------------
-- 2. Index for the list query
--
-- src/services/noteService.ts selects every note for a user ordered by
-- is_pinned desc, then updated_at desc. This composite index covers that query
-- in a single scan instead of sorting every row the account owns.
--
-- partial, because a pinned note is the exception rather than the norm: keeping
-- the pinned rows in a much smaller dedicated index keeps the common case small
-- while still letting the pinned-first ordering resolve from the index.
-- -----------------------------------------------------------------------------

create index if not exists notes_user_updated_idx
    on public.notes (user_id, updated_at desc);

create index if not exists notes_user_pinned_updated_idx
    on public.notes (user_id, updated_at desc)
    where is_pinned;

-- -----------------------------------------------------------------------------
-- 3. Row level security
--
-- notes carries only user_id -- no parent columns referencing another table --
-- so ownership is the whole rule, exactly like academic_semesters and
-- study_sessions in migration 0003. Generated in a loop for the same reason:
-- the four policies are identical and would otherwise be four copy-pasted
-- blocks.
--
-- The update policy matters most here. Autosave means an UPDATE is issued on
-- every idle pause, so `using` must restrict which rows can be targeted at all
-- and `with check` must stop a write from re-pointing user_id at someone else.
-- -----------------------------------------------------------------------------

alter table public.notes enable row level security;

drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
    for select using (auth.uid() = user_id);

drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes
    for insert with check (auth.uid() = user_id);

drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes
    for delete using (auth.uid() = user_id);
