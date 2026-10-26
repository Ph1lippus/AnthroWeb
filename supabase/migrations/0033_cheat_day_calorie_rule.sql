-- Per-user cheat-day calorie rule: maintenance target and ceiling.
-- The scorer judges cheat-day calories against maintenance (<= full marks,
-- > ceiling = zero, graded between). Protein, water, carbs and fat always
-- score normally against their own goals. Null means "not set" -- the user
-- chooses these values on the goals page.
ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS cheat_maintenance_calories integer,
    ADD COLUMN IF NOT EXISTS cheat_calorie_ceiling integer;

COMMENT ON COLUMN public.user_settings.cheat_maintenance_calories IS 'Maintenance calorie target used to score cheat-day calories.';
COMMENT ON COLUMN public.user_settings.cheat_calorie_ceiling IS 'Calorie ceiling above which cheat-day calories score zero.';
