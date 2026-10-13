-- One row per book, enforced by the database instead of by a cleanup modal.
--
-- `books` has had nothing but a primary key on `id` since it was created, and
-- `title` is not unique either. Every write path is a plain INSERT -- creating a
-- book, and importing a CSV -- so running the same import twice leaves two rows
-- for the same book, and nothing in the app can stop that from being the normal
-- case rather than the accidental one. The "check duplicates" screen exists
-- because of this: it is a repair tool for a constraint that was never written.
--
-- The unique key is on `lower(title)`, not on `title`. `title` is
-- `NOT NULL`, so a bare unique index would work, but it would treat "Dune" and
-- "dune" as different books -- and a title typed on a phone keyboard is exactly
-- the kind of value that arrives with the wrong capitalisation. Case-folded is
-- what "the same book" actually means here, and it is the same treatment
-- `exercises` already gets through the `lower_array()` wrapper in migration
-- 0010.
--
-- Applied to an existing table, so this has to clean up before it constrains.
-- Deduplication keeps the row with the most progress rather than the oldest or
-- the newest: the furthest one read is the one that took the longest to arrive
-- at, and keeping a half-read duplicate over a finished copy would be a small
-- and entirely pointless data loss. `ROW_NUMBER` rather than `DISTINCT ON` so
-- this reads the same on every Postgres 11+.
--
-- `DELETE` rather than an update-to-null, because there is no third state here:
-- either you have read it or you have not, and the surviving row is the one that
-- says.

BEGIN;

-- Deduplication, into a quarantine table rather than into the void.
--
-- The surviving row is the one with the most progress, but "most progress" is a
-- heuristic and a heuristic that quietly deletes is a heuristic that can lose
-- data. So nothing is deleted outright: every row that loses is copied into
-- `books_merged` first, with a pointer to the row that replaced it. If the
-- ranking turns out to have been wrong for some book, moving that row back is a
-- single INSERT and no history is gone.
--
-- `books_merged` is a real table rather than a comment saying "we logged it",
-- because a log of deleted rows that the user cannot query is not a backup.
CREATE TABLE IF NOT EXISTS public.books_merged (
  -- The row exactly as it was, so it can be restored unchanged.
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  current_page integer DEFAULT 0,
  progress real DEFAULT 0,
  status text,
  notes text,
  started_at date,
  completed_at date,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  -- Which row won, so it is obvious what this was folded into.
  merged_into uuid,
  merged_at timestamp with time zone DEFAULT now(),
  -- Why it lost, which is the ranking key that decided it. Without this a
  -- quarantine row is just a duplicate and you have to re-derive the answer.
  merged_because text
);

COMMENT ON TABLE public.books_merged IS
  'Books removed by migration 0022 while adding the unique index. Each row is restorable verbatim; merged_into points at the row that replaced it.';

-- Rows that share a case-folded title, for one user, where they are not
-- already the same row.
CREATE TEMP TABLE duplicate_books AS
SELECT
  id,
  user_id,
  title,
  total_pages,
  current_page,
  progress,
  status,
  notes,
  started_at,
  completed_at,
  created_at,
  updated_at,
  ROW_NUMBER() OVER (
    PARTITION BY user_id, lower(title)
    ORDER BY
      -- Most progress first; `total_pages` of 0 means "not yet started", and a
      -- NULL `current_page` sorts last under this DESC because NULLs sort last
      -- ascending by default and are reversed here.
      COALESCE(current_page, 0) DESC,
      COALESCE(total_pages, 0) DESC,
      -- Then the oldest, so the survivor is the row that has existed longest
      -- and is most likely to be the one referenced elsewhere.
      created_at ASC NULLS LAST,
      id ASC
  ) AS dupe_rank,
  -- The winner for this group, recorded on the losers as they are archived.
  FIRST_VALUE(id) OVER (
    PARTITION BY user_id, lower(title)
    ORDER BY
      COALESCE(current_page, 0) DESC,
      COALESCE(total_pages, 0) DESC,
      created_at ASC NULLS LAST,
      id ASC
  ) AS winner_id
FROM public.books;

-- Quarantine the losers before deleting them.
INSERT INTO public.books_merged (
  id, user_id, title, total_pages, current_page, progress, status, notes,
  started_at, completed_at, created_at, updated_at, merged_into, merged_because
)
SELECT
  id, user_id, title, total_pages, current_page, progress, status, notes,
  started_at, completed_at, created_at, updated_at, winner_id,
  'another copy of the same title had more progress'
FROM duplicate_books
WHERE dupe_rank > 1
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.books
WHERE id IN (SELECT id FROM duplicate_books WHERE dupe_rank > 1);

DROP TABLE duplicate_books;

-- The unique key is an INDEX, not a table constraint.
--
-- `lower(title)` is an expression, and Postgres does not accept expressions in a
-- UNIQUE *constraint* -- `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE (user_id,
-- lower(title))` is a syntax error, not a silent no-op. A unique INDEX is the
-- only way to express this, and it is sufficient: `INSERT ... ON CONFLICT
-- (user_id, lower(title))` infers against unique indexes, not just named
-- constraints, so PostgREST's `onConflict` works against it exactly as it would
-- against a constraint.
ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_user_title_uniq;
DROP INDEX IF EXISTS public.books_user_title_uniq_idx;

CREATE UNIQUE INDEX IF NOT EXISTS books_user_title_uniq_idx
  ON public.books (user_id, lower(title));

COMMIT;