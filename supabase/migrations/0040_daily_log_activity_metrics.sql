-- Store the daily activity measurements shown in the Daily Log.
-- These are separate from workout session details: they describe the whole day,
-- including days without a logged workout.
ALTER TABLE public.daily_logs
    ADD COLUMN IF NOT EXISTS steps integer,
    ADD COLUMN IF NOT EXISTS phone_usage integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'daily_logs_steps_non_negative'
    ) THEN
        ALTER TABLE public.daily_logs
            ADD CONSTRAINT daily_logs_steps_non_negative
            CHECK (steps IS NULL OR steps >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'daily_logs_phone_usage_non_negative'
    ) THEN
        ALTER TABLE public.daily_logs
            ADD CONSTRAINT daily_logs_phone_usage_non_negative
            CHECK (phone_usage IS NULL OR phone_usage >= 0);
    END IF;
END $$;
