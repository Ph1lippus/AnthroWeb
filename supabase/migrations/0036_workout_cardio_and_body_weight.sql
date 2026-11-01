ALTER TABLE public.workout_completion_log
    ADD COLUMN IF NOT EXISTS body_weight numeric;

ALTER TABLE public.workout_exercises_log
    ADD COLUMN IF NOT EXISTS machine_level numeric,
    ADD COLUMN IF NOT EXISTS machine_incline numeric,
    ADD COLUMN IF NOT EXISTS machine_speed numeric,
    ADD COLUMN IF NOT EXISTS hr_max integer,
    ADD COLUMN IF NOT EXISTS hr_1_min integer,
    ADD COLUMN IF NOT EXISTS hr_2_min integer,
    ADD COLUMN IF NOT EXISTS calories numeric;

COMMENT ON COLUMN public.workout_completion_log.body_weight IS 'Body weight snapshot from the latest measurement when the workout was saved.';
COMMENT ON COLUMN public.workout_exercises_log.machine_level IS 'Machine resistance or program level used during cardio.';
COMMENT ON COLUMN public.workout_exercises_log.machine_incline IS 'Machine incline used during cardio.';
COMMENT ON COLUMN public.workout_exercises_log.machine_speed IS 'Machine speed used during cardio.';
COMMENT ON COLUMN public.workout_exercises_log.hr_max IS 'Maximum heart rate during this cardio exercise.';
COMMENT ON COLUMN public.workout_exercises_log.hr_1_min IS 'Heart rate one minute after cardio.';
COMMENT ON COLUMN public.workout_exercises_log.hr_2_min IS 'Heart rate two minutes after cardio.';
