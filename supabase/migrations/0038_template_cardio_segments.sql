alter table public.workout_template_exercises
    add column if not exists cardio_segments jsonb;
