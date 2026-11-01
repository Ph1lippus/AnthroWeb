alter table public.workout_completion_log
    add column if not exists start_time time,
    add column if not exists machine text,
    add column if not exists distance_km numeric,
    add column if not exists calories numeric,
    add column if not exists avg_hr integer,
    add column if not exists max_hr integer;

alter table public.workout_exercises_log
    add column if not exists cardio_segments jsonb,
    add column if not exists avg_hr integer,
    add column if not exists avg_watts numeric,
    add column if not exists max_watts numeric;
