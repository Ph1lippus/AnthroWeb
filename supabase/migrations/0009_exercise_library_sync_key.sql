-- The exercise library's upsert target.
--
-- It used to be `(user_id, lower(name))`, which PostgREST cannot express. Its
-- `on_conflict` parameter is a comma-separated list of column *names*, so
-- `user_id,lower(name)` was parsed as three columns -- `user_id`, `lower` and
-- `name` -- and every sync died on:
--
--     Could not write the exercise library: column "lower" does not exist
--
-- `(user_id, wger_id)` is the right key anyway: one row per wger exercise per
-- user, so a re-sync updates in place instead of duplicating. Custom exercises
-- carry `wger_id IS NULL`, and Postgres treats NULLs as distinct inside a unique
-- index, so they never collide with each other or with the catalogue.
--
-- The `lower(name)` index becomes non-unique. It still serves the picker's name
-- lookups, but it no longer forces the app to put a SQL expression in an upsert
-- target, and it no longer makes a hand-typed exercise collide with a catalogue
-- entry that happens to share its name.

DROP INDEX IF EXISTS public.exercises_user_id_name_idx;

CREATE UNIQUE INDEX IF NOT EXISTS exercises_user_id_wger_uniq
  ON public.exercises (user_id, wger_id);

CREATE INDEX IF NOT EXISTS exercises_user_id_name_idx
  ON public.exercises (user_id, lower(name));
