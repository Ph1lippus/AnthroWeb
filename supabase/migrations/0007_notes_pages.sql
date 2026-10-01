-- =============================================================================
-- Notes: sub-pages, trash, icons, covers and tags.
--
-- Migration 0006 made the notes page a real editor (autosave, TipTap, page
-- accents). This adds the page-level model around it, so notes can nest, be
-- thrown away without being lost, and be labelled.
--
-- The nesting policy is the interesting part. A self-referencing parent_id is
-- exactly the shape that produces "infinite recursion detected in policy for
-- relation notes": a policy that reads notes to decide whether you may write
-- notes is evaluated against notes, so it recurses. Migration 0002 hit this on
-- academic_items and 0003 documented the fix. The ownership check therefore
-- lives in a SECURITY DEFINER function, which evaluates with the table owner's
-- rights and so is not re-checked against the policy.
--
-- That function reads auth.uid() itself rather than taking the caller's user id
-- as an argument. A SECURITY DEFINER function runs with elevated rights, so
-- trusting a passed-in user_id would let a caller validate a parent belonging to
-- somebody else.
--
-- Adding a trash column changes what every read path has to mean. A note with
-- deleted_at set is not gone, but it must not appear in the list, the search
-- index, or the editor. The partial indexes below assume that.
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------

-- Emoji shown beside the title in the rail and above the page.
alter table public.notes
    add column if not exists notes_icon text;

comment on column public.notes.notes_icon is
    'Optional emoji shown beside the title.';

-- Cover image URL, drawn across the top of the page.
alter table public.notes
    add column if not exists notes_cover text;

comment on column public.notes.notes_cover is
    'Optional cover image URL drawn above the page.';

-- Sub-page hierarchy. Null means a top-level page, which is every existing row.
--
-- on delete set null: removing a page must not remove its children. The children
-- are promoted to the top level, which is what a filesystem does and what a user
-- deleting a folder of notes would expect.
--
-- on delete restrict would be the alternative, but it turns "delete this page"
-- into a failure the user cannot act on.
alter table public.notes
    add column if not exists notes_parent_id uuid
        references public.notes (id) on delete set null;

comment on column public.notes.notes_parent_id is
    'Parent page id, or null for a top-level page.';

-- Soft delete. Null means live.
alter table public.notes
    add column if not exists notes_deleted_at timestamptz;

comment on column public.notes.notes_deleted_at is
    'When the note was thrown away, or null while it is live.';

alter table public.notes
    add column if not exists notes_tags text[] not null default '{}';

comment on column public.notes.notes_tags is
    'Free-form labels used to group pages.';

-- -----------------------------------------------------------------------------
-- 2. Indexes
--
-- Every predicate below is on notes_deleted_at, not deleted_at. The column carries
-- the notes_ prefix like the rest of this table's additions, and a partial index
-- that names the wrong column is a hard 42703 rather than a silent no-op -- which
-- is what made the first run of this script roll back entirely.
--
-- The list query filters on notes_deleted_at, so the index from 0006 is now the
-- wrong shape: it still serves live notes correctly, but a partial index over live
-- rows only is both smaller and lets the planner skip the trashed ones outright.
-- -----------------------------------------------------------------------------

create index if not exists notes_user_live_updated_idx
    on public.notes (user_id, updated_at desc)
    where notes_deleted_at is null;

create index if not exists notes_user_live_pinned_updated_idx
    on public.notes (user_id, updated_at desc)
    where is_pinned and notes_deleted_at is null;

-- Resolving a page's children is the rail tree's only query.
create index if not exists notes_user_parent_idx
    on public.notes (user_id, notes_parent_id)
    where notes_deleted_at is null;

-- Tag filtering. GIN is what makes the array containment operator indexable;
-- without it a tag filter is a sequential scan of every note.
create index if not exists notes_tags_idx
    on public.notes using gin (notes_tags)
    where notes_deleted_at is null;

-- -----------------------------------------------------------------------------
-- 3. RLS for the self-reference
--
-- Without the SECURITY DEFINER indirection these policies recurse. The function
-- is stable and security definer, with the search path pinned so a hostile
-- schema cannot shadow `notes` inside it.
--
-- The check is deliberately "the parent is one of mine", not "the parent is
-- live". Requiring a live parent would mean restoring a page failed with an
-- opaque policy error whenever its parent was still sitting in the trash, which
-- is the single most likely way to hit it: throw a parent away, throw a child
-- away, restore the child first. The client already copes with a parent it
-- cannot see -- buildNoteTree treats the page as a root and noteAncestors drops
-- it from the trail -- so allowing it is safe and predictable.
-- -----------------------------------------------------------------------------

create or replace function public.note_parent_is_valid(
    p_note_id uuid,
    p_parent_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    -- No parent is always valid: that is the top level.
    select p_parent_id is null
        or (
            -- A page cannot be its own parent. The insert case passes a null
            -- note id because the row does not exist yet.
            p_parent_id is distinct from p_note_id
            and exists (
                select 1
                from public.notes parent
                where parent.id = p_parent_id
                  and parent.user_id = auth.uid()
            )
        );
$$;

revoke all on function public.note_parent_is_valid(uuid, uuid) from public;
grant execute on function public.note_parent_is_valid(uuid, uuid) to authenticated;

-- Insert and update are the only operations that can introduce a bad parent.
-- Select and delete stay the flat ownership checks from 0006.
drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes
    for insert with check (
        auth.uid() = user_id
        and public.note_parent_is_valid(null, notes_parent_id)
    );

drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes
    for update using (auth.uid() = user_id)
    with check (
        auth.uid() = user_id
        and public.note_parent_is_valid(id, notes_parent_id)
    );

-- -----------------------------------------------------------------------------
-- 4. Existing rows
--
-- The NOT NULL on notes_tags has a default, so every existing row is already
-- valid; this is only here so the backfill is explicit for anyone who added a
-- column by hand earlier.
-- -----------------------------------------------------------------------------

update public.notes
   set notes_tags = '{}'
 where notes_tags is null;
