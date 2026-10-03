-- =============================================================================
-- WORKOUT PLAN SESSIONS
--
-- The one table this change adds, and the one column on an existing table.
--
-- Why: a template used to *be* a week. `workout_template_exercises` carried a
-- `day_of_week` and that was the whole structure, which made "a session" a
-- concept with nowhere to live -- there was no layer between the template and
-- its exercises, so you could not have two different workouts on a Tuesday, and
-- you could not name one.
--
-- Now a template is just a name (like a semester), it holds sessions (like
-- courses), and a session holds exercises. A session carries its own weekday, so
-- a template can put three sessions on a Friday and none on a Saturday, and each
-- one can be a different kind of workout.
--
--   workout_templates
--     └── workout_plan_sessions        ← this file
--           └── workout_template_exercises.session_id  ← this file
--
-- Additive and backwards compatible. `workout_template_exercises.day_of_week` is
-- kept and still NOT NULL: it is now a denormalised copy of the session's day, so
-- a template created before this change keeps working with no backfill and
-- `getPlanForDay` keeps its fast path. Rows whose `session_id` is NULL are the
-- pre-existing ones, and the app groups those by weekday exactly as before.
--
-- RUN THIS against the live database before using the workouts page. It is safe
-- to run twice: every statement is IF NOT EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The session itself.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_plan_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workout_template_id uuid NOT NULL,
  user_id uuid NOT NULL,

  -- What it is called inside the template: "Push", "Legs", "Upper body".
  name text NOT NULL,

  -- Which day it belongs to. 0 = Sunday .. 6 = Saturday, matching
  -- `Date.getDay()` and the column already on workout_template_exercises.
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),

  -- The kind of workout. Drives which editor the session's exercises get:
  -- strength gets sets/reps/weight, cardio and mobility get a duration.
  activity_type text NOT NULL DEFAULT 'strength'::text
    CHECK (activity_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text])),

  -- How long it should take, and how hard it should feel.
  target_duration_minutes integer,
  target_intensity integer CHECK (target_intensity >= 1 AND target_intensity <= 10),

  notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT workout_plan_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT workout_plan_sessions_template_fkey
    FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  CONSTRAINT workout_plan_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Reading a template's week in one go, which is what the template card does.
CREATE INDEX IF NOT EXISTS workout_plan_sessions_template_idx
  ON public.workout_plan_sessions (workout_template_id, day_of_week, position);

-- Seeding a day reads by weekday across the user's active template.
CREATE INDEX IF NOT EXISTS workout_plan_sessions_user_day_idx
  ON public.workout_plan_sessions (user_id, day_of_week);

-- -----------------------------------------------------------------------------
-- 2. Exercises belong to a session.
--
-- Nullable on purpose: rows that existed before this change have no session, and
-- must keep working. ON DELETE CASCADE because an exercise with no session is not
-- a thing that means anything.
-- -----------------------------------------------------------------------------
ALTER TABLE public.workout_template_exercises
  ADD COLUMN IF NOT EXISTS session_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_template_exercises_session_fkey'
  ) THEN
    ALTER TABLE public.workout_template_exercises
      ADD CONSTRAINT workout_template_exercises_session_fkey
      FOREIGN KEY (session_id) REFERENCES public.workout_plan_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- The template card reads one session's exercises at a time.
CREATE INDEX IF NOT EXISTS workout_template_exercises_session_idx
  ON public.workout_template_exercises (session_id, position);

-- -----------------------------------------------------------------------------
-- 3. Which planned session a performed day came from.
--
-- `target_intensity` on a session is what it is *meant* to feel like. To say
-- whether you actually went above or below that, the log has to know which
-- planned session it was following -- the template alone is not enough now that
-- a week can hold several sessions per day.
--
-- Nullable and ON DELETE SET NULL: a logged workout stays valid if the plan it
-- came from is deleted, and simply loses the comparison.
-- -----------------------------------------------------------------------------
ALTER TABLE public.workout_completion_log
  ADD COLUMN IF NOT EXISTS plan_session_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_completion_log_plan_session_fkey'
  ) THEN
    ALTER TABLE public.workout_completion_log
      ADD CONSTRAINT workout_completion_log_plan_session_fkey
      FOREIGN KEY (plan_session_id) REFERENCES public.workout_plan_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Access control.
--
-- The table needs its own policies. Every existing table in this schema is
-- secured by policies that were applied through the dashboard rather than
-- written down here -- `sql.sql` contains no RLS at all -- so a table created by
-- this file arrives with row security off (or on with no policy), and the first
-- insert fails with:
--
--   403 new row violates row-level security policy for table "workout_plan_sessions"
--
-- The app's model everywhere else is ownership by `user_id` compared against
-- `auth.uid()`, so that is what these do. Same shape for all four commands, and
-- `DROP ... IF EXISTS` first so re-running this file does not collide with the
-- policies it already made.
--
-- The grants matter as well as the policies: creating a table does not give
-- `authenticated` any rights on it, and a policy is not consulted until the
-- privilege to reach the table exists.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_plan_sessions TO authenticated;

ALTER TABLE public.workout_plan_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workout_plan_sessions_select_own ON public.workout_plan_sessions;
CREATE POLICY workout_plan_sessions_select_own ON public.workout_plan_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workout_plan_sessions_insert_own ON public.workout_plan_sessions;
CREATE POLICY workout_plan_sessions_insert_own ON public.workout_plan_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workout_plan_sessions_update_own ON public.workout_plan_sessions;
CREATE POLICY workout_plan_sessions_update_own ON public.workout_plan_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workout_plan_sessions_delete_own ON public.workout_plan_sessions;
CREATE POLICY workout_plan_sessions_delete_own ON public.workout_plan_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. Anything this file added to a table that already has policies.
--
-- Column additions are covered by the existing table-level policies, but only if
-- the role's grant on that table was not written as an explicit column list. These
-- two statements are the difference between a column that works and a permission
-- error naming a column nobody has ever heard of.
-- -----------------------------------------------------------------------------
GRANT UPDATE (session_id) ON public.workout_template_exercises TO authenticated;
GRANT UPDATE (plan_session_id) ON public.workout_completion_log TO authenticated;