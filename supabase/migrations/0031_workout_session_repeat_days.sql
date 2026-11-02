alter table workout_plan_sessions
    add column if not exists repeat_on_days boolean not null default false;
