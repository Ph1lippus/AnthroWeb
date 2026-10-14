-- Let a note's private columns be NULL, which sealing requires.
--
-- THE BUG THIS FIXES
--
-- Locking a page failed outright:
--
--   Could not lock note: null value in column "content" of relation "notes"
--   violates not-null constraint
--
-- Sealing a row moves its private fields into one `vault` blob and then writes
-- `null` over each of them in the same round trip. That second half is not
-- optional -- a row that keeps its plaintext *and* gains a ciphertext blob is
-- strictly worse than either alone, because there are now two copies and a
-- future reader has to know which one is live. So `content`, `notes_tags`,
-- `notes_cover`, `notes_color` and `notes_icon` all get nulled on every
-- sealed write.
--
-- `notes.content` was `NOT NULL`, so that write was refused. The page appeared
-- to lock -- the dialog closed, the lock columns landed -- and the body was
-- simply still sitting there in the clear. The only symptom was a console error
-- nobody reads.
--
-- WHY A MIGRATION AND NOT A CODE CHANGE
--
-- The alternative is to stop blanking, and that is the one option that makes
-- the encryption worse rather than better. Leaving readable text next to its own
-- ciphertext means anyone with a database dump -- or a stolen backup, or a
-- curious SQL console -- reads the note without touching the key at all.
--
-- NULL is the correct resting state for a sealed column, and the constraint was
-- written before anything was ever sealed. It is not load-bearing: the app
-- treats a null private column as "sealed", and `openRow` refuses to guess when
-- a row carries a `vault` blob it cannot open.
--
-- `title` is deliberately NOT in this list. It moved to the clear columns in
-- `CLEAR_COLUMNS.notes` so the notes rail can list pages by name; it is never
-- blanked, so it never needs to be nullable, and leaving the constraint on it
-- keeps a genuinely required field required.

BEGIN;

-- ---------------------------------------------------------------------------
-- The five sealed columns of `notes`.
-- ---------------------------------------------------------------------------
-- `DROP NOT NULL` is idempotent in PostgreSQL, so this is safe to re-run: a
-- column that is already nullable is left alone rather than raising.
ALTER TABLE public.notes
  ALTER COLUMN content      DROP NOT NULL,
  ALTER COLUMN notes_tags   DROP NOT NULL,
  ALTER COLUMN notes_cover  DROP NOT NULL,
  ALTER COLUMN notes_color  DROP NOT NULL,
  ALTER COLUMN notes_icon   DROP NOT NULL;

COMMENT ON COLUMN public.notes.content IS
  'NULL once the row is sealed. The text lives in `vault`, encrypted under the note key. Non-NULL only while the vault is off or this row is not sealed.';
COMMENT ON COLUMN public.notes.notes_tags IS
  'NULL once the row is sealed; the array lives in `vault`.';
COMMENT ON COLUMN public.notes.notes_cover IS
  'NULL once the row is sealed; the value lives in `vault`.';
COMMENT ON COLUMN public.notes.notes_color IS
  'NULL once the row is sealed; the value lives in `vault`.';
COMMENT ON COLUMN public.notes.notes_icon IS
  'NULL once the row is sealed; the value lives in `vault`.';

-- ---------------------------------------------------------------------------
-- A sealed row must not be readable as an empty note.
--
-- Documentation rather than an enforced constraint: `vault` is written in the
-- same statement that nulls these columns, so any check would have to be
-- DEFERRABLE, and it is simpler to leave the write path alone. It is recorded
-- here because the invariant is easy to break by hand -- writing `vault = NULL`
-- over a sealed row destroys the text with no error and no way back.
--
-- Guarded, because `verify:migrations` applies every migration to a bare schema
-- with none of its siblings, so a bare COMMENT on a column 0024 adds would fail
-- there while succeeding perfectly well in production. Migrations are tested the
-- way they are run.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'vault'
  ) THEN
    COMMENT ON COLUMN public.notes.vault IS
      'Sealed payload: the row''s private fields, AES-256-GCM under the note key, AAD-bound to user_id|table|row. Present exactly when the row''s private columns are NULL. Clearing this column on a sealed row deletes the note''s contents irreversibly.';
  END IF;
END $$;

COMMIT;
