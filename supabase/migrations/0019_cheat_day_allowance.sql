-- How many cheat days a user is allowed, and over what window.
--
-- A cheat day was previously always free: `daily_logs.cheat_day` drops the four
-- food macros from that day's score. That is right for the occasional planned
-- break but wrong as a permanent escape hatch, so the allowance makes the break
-- a budget. Within it a cheat day behaves as before -- macros recorded, left out
-- of the score. Past it the macros still do not move, but they are scored as 0
-- and logged, so the day's ring reflects the day off rather than shrugging at it.
--
-- The window is a setting rather than a fixed week because "one every now and
-- then" and "two a month" are different answers to the same question. `week`
-- means the ISO week (Monday-Sunday); `month` means the calendar month.
--
-- `cheat_days_allowed` is nullable on purpose and null is the default. Null
-- means "no budget", which is exactly how every existing user behaved before
-- this column existed, so nobody's history starts scoring differently the moment
-- the migration runs. A stored number, including 0, means the budget applies --
-- 0 being a deliberate "I never want a free one".
--
-- `cheat_days_period` is NOT NULL with a default so a reader never has to decide
-- what an absent window meant; only the allowance itself is optional.

ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS cheat_days_allowed integer
        CHECK (cheat_days_allowed IS NULL OR cheat_days_allowed >= 0);

ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS cheat_days_period text NOT NULL DEFAULT 'week'
        CHECK (cheat_days_period IN ('week', 'month'));
