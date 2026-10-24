-- Add updated_at to study_sessions so generic updated_at triggers (and clients
-- that stamp it) have a column to write to. Previously the table lacked it,
-- which made every UPDATE fail with "record new has no field updated_at".
ALTER TABLE public.study_sessions
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Backfill any rows that predate the column.
UPDATE public.study_sessions
    SET updated_at = COALESCE(updated_at, created_at, now())
    WHERE updated_at IS NULL;