-- Add a midday mood rating and rename sleep_quality to morning_feel.

ALTER TABLE public.daily_logs
    ADD COLUMN IF NOT EXISTS midday_mood integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_midday_mood_check'
    ) THEN
        ALTER TABLE public.daily_logs
            ADD CONSTRAINT daily_logs_midday_mood_check
            CHECK (midday_mood IS NULL OR midday_mood BETWEEN 1 AND 10);
    END IF;
END $$;

-- Rename sleep_quality to morning_feel if the old column is still present.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'daily_logs'
          AND column_name = 'sleep_quality'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'daily_logs'
          AND column_name = 'morning_feel'
    ) THEN
        ALTER TABLE public.daily_logs RENAME COLUMN sleep_quality TO morning_feel;
    END IF;
END $$;

COMMENT ON COLUMN public.daily_logs.midday_mood IS
    'Subjective 1-10 mood rating for the middle of the day, set on the journal page';
COMMENT ON COLUMN public.daily_logs.morning_feel IS
    'Subjective 0-10 rating of how you feel in the morning';