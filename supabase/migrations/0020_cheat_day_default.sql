-- Default the cheat-day allowance to one.
--
-- 0019 left `cheat_days_allowed` null for every row, which the client reads as
-- "no budget". That was the right way to keep existing users' history scoring
-- the way it always had, but the intended default is one free cheat day per
-- window, not an open-ended pass. Null still means "no limit" when a user
-- deliberately clears the box; this only changes what an unset row means.
--
-- The UPDATE backfills the rows 0019 created, so a budget of one applies from
-- the first toggle rather than waiting for the user to open the settings page.

ALTER TABLE public.user_settings
    ALTER COLUMN cheat_days_allowed SET DEFAULT 1;

UPDATE public.user_settings
    SET cheat_days_allowed = 1
    WHERE cheat_days_allowed IS NULL;
