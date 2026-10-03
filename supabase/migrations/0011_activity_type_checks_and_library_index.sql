-- =============================================================================
-- Three schema gaps that sql.sql's runnable DDL section had been missing.
--
-- These were found by scripts/verify-schema.mjs, which applies sql.sql to a
-- scratch database and asserts the invariants the client depends on. Each one
-- below already existed in the catalog half of sql.sql, or is implied by a
-- constraint that did -- sql.sql was documenting a schema the DDL did not build.
--
-- Nothing here changes behaviour the app can see. These are constraints the
-- client has been honouring in TypeScript all along; the database just was not
-- enforcing them.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 + 2. activity_type vocabulary on the two workout tables missing the CHECK.
--
-- `exercises` and `workout_plan_sessions` both pin activity_type to
-- ACTIVITY_TYPES. `workout_template_exercises` and `workout_exercises_log` did
-- not, so the same column held a free-text value on four tables out of which two
-- were checked.
--
-- The client only ever sends those three values -- `ActivityType` is the type of
-- every write, and syncExerciseLibrary coerces anything unrecognised to
-- 'strength' before it reaches the wire -- so this cannot reject a write the
-- app is capable of making. What it prevents is the silent case: a value the
-- client cannot parse is not an error, it is `workoutStats.kindTotals` bucketing
-- a cardio entry as strength, and `useWorkouts` casting it back with `as
-- ActivityType` (line 263 of workoutStats.ts) which types a lie rather than
-- raising one.
--
-- ADD CONSTRAINT validates existing rows, which is the point -- a table with
-- rows outside the vocabulary should fail here, loudly, rather than keep them.
-- The client cannot have written any, so this is expected to apply cleanly.
--
-- Named rather than left to Postgres so the names are stable across the two
-- tables. IF NOT EXISTS is not available for ADD CONSTRAINT, hence the guard:
-- re-running the migration is a no-op instead of an error.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'workout_template_exercises_activity_type_check'
    ) THEN
        ALTER TABLE public.workout_template_exercises
            ADD CONSTRAINT workout_template_exercises_activity_type_check
            CHECK (activity_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text]));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'workout_exercises_log_activity_type_check'
    ) THEN
        ALTER TABLE public.workout_exercises_log
            ADD CONSTRAINT workout_exercises_log_activity_type_check
            CHECK (activity_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text]));
    END IF;
END
$$;


-- -----------------------------------------------------------------------------
-- 3. The library's upsert target, as an executable statement.
--
-- 0009 already created this index on the live database, so this is a no-op
-- there. It is here because sql.sql lists `exercises_user_id_wger_uniq` in its
-- catalog section but no CREATE INDEX appears in its runnable DDL -- which meant
-- a database built from sql.sql had no unique index for syncExerciseLibrary's
-- `on_conflict: 'user_id,wger_id'` to resolve against, and every library sync
-- against a fresh build would fail the same way 0009's own comment describes:
--
--     Could not write the exercise library: column "lower" does not exist
--
-- Kept as an index rather than promoted to a UNIQUE constraint to match what is
-- already on the live database, so applying this changes nothing there.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS exercises_user_id_wger_uniq
    ON public.exercises (user_id, wger_id);
