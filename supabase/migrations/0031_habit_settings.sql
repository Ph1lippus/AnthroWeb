alter table user_settings
    add column if not exists habit_settings jsonb not null default '{}'::jsonb;