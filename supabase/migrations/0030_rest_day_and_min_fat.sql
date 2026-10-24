-- Rest days on daily logs and configurable minimum fat.
alter table daily_logs
    add column if not exists is_rest_day boolean not null default false;

alter table user_settings
    add column if not exists min_fat_g numeric default 50;