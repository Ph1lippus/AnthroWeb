-- Split the single end-of-day `mood` rating into the two ratings it was always
-- standing in for.
--
-- The old column was filled in at night but read as "the mood of that day", so
-- every mood-based feature -- the score ring, the dashboard charts, the journal
-- graph -- had one number to work with and no way to show that a morning and an
-- evening can disagree by half the scale. That disagreement is the signal worth
-- seeing: it is the difference between how a day started and how it ended.
--
-- Both columns are nullable on purpose. A day with only an evening rating is a
-- real day, not a half-finished one, so NULL means "not rated" and is never
-- coerced to a midpoint -- a fabricated 5 would drag the averages toward calm
-- and make the whole series lie.
--
-- Ordering matters here and is the reason this is one transaction-worth of file:
-- the columns are added and populated *before* the old one is dropped, so no
-- write can land in the gap and no rating is ever lost.

ALTER TABLE public.daily_logs
    ADD COLUMN IF NOT EXISTS morning_mood integer,
    ADD COLUMN IF NOT EXISTS evening_mood integer;

-- Named constraints rather than inline column checks. A CHECK written inline in
-- the ADD COLUMN above would be auto-named `daily_logs_morning_mood_check`,
-- which is fine once but makes a later edit of the rule a drop-and-recreate
-- under a name nobody wrote on purpose. Naming them keeps 0014 idempotent: the
-- DO block below skips the constraint if it is already present, so re-running
-- this file on a half-applied database is safe.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_morning_mood_check'
    ) THEN
        ALTER TABLE public.daily_logs
            ADD CONSTRAINT daily_logs_morning_mood_check
            CHECK (morning_mood IS NULL OR morning_mood BETWEEN 1 AND 10);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_evening_mood_check'
    ) THEN
        ALTER TABLE public.daily_logs
            ADD CONSTRAINT daily_logs_evening_mood_check
            CHECK (evening_mood IS NULL OR evening_mood BETWEEN 1 AND 10);
    END IF;
END $$;

-- Backfill: the old rating was captured at night, so it is the evening rating.
-- Only the morning column stays NULL for these rows, which the average treats as
-- "no morning reading" rather than as a missing zero.
--
-- Guarded on the column still being there. This file is replayed against the
-- current sql.sql by verify:migrations, and sql.sql already describes the
-- post-migration shape -- so on a fresh verification database there is nothing
-- to copy, and an unguarded UPDATE would fail the moment someone applied this
-- to a database that had already been migrated. Guarding it costs one catalog
-- lookup and makes the file safe to run in any order, twice included.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'daily_logs'
          AND column_name = 'mood'
    ) THEN
        UPDATE public.daily_logs
        SET evening_mood = mood
        WHERE mood IS NOT NULL
          AND evening_mood IS NULL;
    END IF;
END $$;

-- Drop the old column last. Every reader of `mood` moved to the two new columns
-- in the same change as this migration, so nothing selects it by the time this
-- statement runs.
ALTER TABLE public.daily_logs DROP COLUMN IF EXISTS mood;

COMMENT ON COLUMN public.daily_logs.morning_mood IS
    'Subjective 1-10 mood rating for the start of the day, set on the journal page';
COMMENT ON COLUMN public.daily_logs.evening_mood IS
    'Subjective 1-10 mood rating for the end of the day, set on the journal page';