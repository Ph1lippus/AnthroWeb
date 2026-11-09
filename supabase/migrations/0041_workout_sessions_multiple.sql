-- Allow more than one completed session per day and give sessions editable titles.
alter table public.workout_completion_log
    add column if not exists name text;

alter table public.workout_completion_log
    drop constraint if exists unique_user_workout_date;