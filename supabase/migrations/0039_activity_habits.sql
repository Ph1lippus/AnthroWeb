-- Activity habits are separate from workout session details. The daily log
-- records that an activity happened; the Workouts page records what was done.
alter table public.daily_logs
    add column if not exists cardio boolean default false,
    add column if not exists mobility boolean default false;
