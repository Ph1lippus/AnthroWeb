alter table workout_plan_sessions
    add column if not exists day_options int[] null;

alter table workout_plan_sessions
    add constraint workout_plan_sessions_day_options_check
    check (day_options is null or day_options <@ array[0, 1, 2, 3, 4, 5, 6]::int[]);
