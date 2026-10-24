-- Habit priority tiers, scheduling, negative habits, and system habits.
alter table habits
    add column if not exists priority text not null default 'medium'
        check (priority in ('high', 'medium', 'low')),
    add column if not exists schedule_days int[] null,
    add column if not exists is_negative boolean not null default false,
    add column if not exists system_key text null,
    add column if not exists is_system boolean not null default false;

create index if not exists habits_user_system_key_idx
    on habits (user_id, system_key) where system_key is not null;