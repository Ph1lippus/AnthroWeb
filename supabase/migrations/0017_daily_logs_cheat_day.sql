-- A "cheat day" flag on the daily log.
--
-- Mirrors `no_sleep`: one boolean the day's form ticks, but where no_sleep
-- nulls the sleep fields and scores the night as 0, a cheat day leaves every
-- food value stored exactly as typed and simply stops the four food macros
-- (calories, protein, carbs, fat) from counting in the day's score. Hydration
-- is unaffected -- water still scores against its goal, because drinking is
-- the one nutrition habit that a day off the plan does not excuse.
--
-- The values stay in their columns on purpose: the dashboard charts plot what
-- was actually eaten, and history should show the day honestly. Only the
-- score ring ignores them.

ALTER TABLE public.daily_logs
    ADD COLUMN IF NOT EXISTS cheat_day boolean DEFAULT false;
