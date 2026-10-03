-- =============================================================================
-- TWO FIXES. NOTHING IS RENAMED, AND NOTHING THE APP NEEDS IS REMOVED.
--
-- 1. Drop `unique_template_day`, which was silently capping every template at
--    one exercise per weekday.
--
--    It was UNIQUE (workout_template_id, day_of_week), from when this table was
--    called `workout_template_days` and a template *was* a week: one row per
--    template per weekday, and nothing else. Migration 0008 inserted
--    `workout_plan_sessions` between the template and its exercises precisely so
--    that a day could hold several sessions -- its own header says so -- but the
--    constraint enforcing the old model survived the rename and was never
--    dropped.
--
--    The result was that the second exercise added to any day failed with:
--
--      duplicate key value violates unique constraint "unique_template_day"
--
--    and, because `ExerciseEditor.submit` awaited the mutation without a catch,
--    nothing appeared on screen at all.
--
--    Nothing needs it now. Order within a session is `position`, and
--    `workout_template_exercises_session_idx (session_id, position)` already
--    serves that read. `day_of_week` stays NOT NULL as the denormalised copy of
--    the session's day, which is what lets `getPlanForDay` find a weekday's plan
--    without a join.
--
--    RUN THIS FIRST. Nothing else here can be checked until a template can hold
--    more than one exercise on a day.
--
-- 2. Backfill `exercise_id` from the exercise name.
--
--    `exercises.muscles` and `exercises.equipment` have been populated by the wger
--    sync since 0009 and read by nothing -- there was no way to reach them. The
--    intended join key is `exercise_id`, but `ExerciseNameInput` dropped the id
--    when mapping search matches and omitted it on both pick paths, so
--    `exercise_id` was written as NULL for every exercise added through the UI.
--    The join therefore returned NULL for essentially every existing row.
--
--    The client now propagates the id, which fixes rows added from here on. This
--    backfills the rows that already exist, matching on the normalised name --
--    the same key `prs.exerciseKey` falls back to when there is no id, and the
--    same case-insensitive comparison the library already uses for lookups.
--
--    Best-effort by design: a name matching nothing is left NULL rather than
--    guessed at. Re-running is a no-op, because `exercise_id IS NULL` no longer
--    holds once a row has matched. Aliases are not matched here -- see section 3.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The constraint that made the second exercise of a day impossible.
--
-- The non-unique index it was served by is still the right index for "what is
-- planned on this weekday", so only the uniqueness goes.
-- -----------------------------------------------------------------------------
ALTER TABLE public.workout_template_exercises
  DROP CONSTRAINT IF EXISTS unique_template_day;


-- -----------------------------------------------------------------------------
-- 2. Point the existing rows at their library entry.
--
-- `DISTINCT ON` rather than a plain join because 0009 left `(user_id,
-- lower(name))` non-unique, so a hand-typed exercise and a catalogue entry can
-- share a name. Both carry the same muscles, so either answer is correct; taking
-- the lowest id just makes the result stable instead of arbitrary.
--
-- Split in two because the two tables mean different things by
-- `template_exercise_id`: on a log row it names the template row the exercise
-- came from, not a row of `exercises`. Matching each row on its own
-- `exercise_name` is the only join available to both.
-- -----------------------------------------------------------------------------
WITH library_match AS (
    SELECT DISTINCT ON (ex.user_id, lower(ex.name))
           ex.user_id,
           lower(ex.name) AS name_key,
           ex.id
      FROM public.exercises ex
     ORDER BY ex.user_id, lower(ex.name), ex.id
)
UPDATE public.workout_template_exercises t
   SET exercise_id = library_match.id
  FROM library_match
 WHERE t.exercise_id IS NULL
   AND library_match.user_id = t.user_id
   AND library_match.name_key = lower(t.exercise_name);

WITH library_match AS (
    SELECT DISTINCT ON (ex.user_id, lower(ex.name))
           ex.user_id,
           lower(ex.name) AS name_key,
           ex.id
      FROM public.exercises ex
     ORDER BY ex.user_id, lower(ex.name), ex.id
)
UPDATE public.workout_exercises_log l
   SET exercise_id = library_match.id
  FROM library_match
 WHERE l.exercise_id IS NULL
   AND library_match.user_id = l.user_id
   AND library_match.name_key = lower(l.exercise_name);


-- -----------------------------------------------------------------------------
-- 3. Index for the alias half of the picker search.
--
-- 0009 left `(user_id, lower(name))`, which serves the library's own lookups and
-- is kept under the same name. It serves neither backfill above nor `rankMatches`,
-- which checks `aliases` as well as `name`: a row can match a query by an alias
-- while its `name` differs from what the user typed, and the backfills match on
-- `name` only. This is what makes that match movable server-side.
--
-- It does not change the backfill above, and it is not read by the picker, which
-- filters the whole library in memory. It exists so a query over aliases is not a
-- sequential scan when one is written.
--
-- `lower` is `lower(text)`, `lower(anyrange)` and `lower(anymultirange)` in
-- pg_catalog and nothing else -- there is no array overload, so the obvious
-- `lower(aliases)` is a type error, not a no-op:
--
--     ERROR:  function lower(text[]) does not exist
--
-- The wrapper below lowers element-wise. It has to be declared IMMUTABLE or
-- Postgres refuses to index the expression, and it is genuinely immutable: it
-- reads nothing but its argument and lower() is itself immutable.
--
-- `array(...)` rather than `array_agg(...)` so a null or empty element array
-- yields an empty array instead of raising "array_agg called on zero rows", which
-- is what makes this usable on the many exercises with no aliases at all. Kept
-- in `public` with the rest of the schema rather than `extensions`, so it goes
-- through the migrations with everything else.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lower_array(a text[])
    RETURNS text[]
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
AS $$
    SELECT COALESCE(array(SELECT lower(x) FROM unnest(a) AS x), ARRAY[]::text[])
$$;

COMMENT ON FUNCTION public.lower_array(text[]) IS
    'Element-wise lower() for text[]. pg_catalog has no array overload of lower, '
    'and an expression index needs an immutable function.';

CREATE INDEX IF NOT EXISTS exercises_user_id_aliases_lower_gin
    ON public.exercises USING gin (public.lower_array(aliases));