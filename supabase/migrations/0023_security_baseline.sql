-- The ownership boundary, stated once, for every table.
--
-- WHY THIS FILE EXISTS
--
-- The policy names for most of these tables were written between 0001 and 0011,
-- but those migrations were deleted from the repository. What survives is
-- `sql.sql`, which is a dashboard text export: it lists every policy's *name*
-- and the commands it applies to, and never once prints a `USING` or
-- `WITH CHECK` expression. It also contains no `ALTER TABLE ... ENABLE ROW
-- LEVEL SECURITY` anywhere -- not one -- so from the repository alone there is
-- no way to confirm that any of these tables are protected, only that
-- policies were once defined for them.
--
-- That gap matters more than it sounds. A policy on a table with RLS disabled is
-- inert: Postgres only evaluates policies when the table has RLS turned on. And
-- there are no table-level `GRANT`/`REVOKE` statements anywhere in the schema
-- either, so access rests entirely on the grants Supabase creates by default --
-- which include `anon`. If RLS is off on `daily_logs`, then every authenticated
-- account in the deployment can read every other account's blood pressure,
-- journal, and weight history through the REST API, regardless of what this
-- repository's code does. Client-side filtering by user id is not a security
-- control; it is a display convenience.
--
-- So this file does not trust the existing policies. It drops them and
-- re-declares them, which is the only way to make the predicate *visible* in
-- version control rather than only in a dashboard.
--
-- WHAT CHANGED AND WHY
--
-- 1. RLS enabled and FORCED on every user-owned table.
--
--    `FORCE` is the part that is easy to leave off. Without it the table owner
--    bypasses RLS entirely, and in Supabase the `postgres` role owns these
--    tables. Anything that reaches the database as a superuser-equivalent -- a
--    SQL editor session, a `service_role` key used carelessly, a `pg` connection
--    from a migration runner -- reads every user's rows regardless of the
--    policies below. With FORCE, the owner is subject to them too. There is no
--    legitimate reason for this application to bypass its own row policies.
--
-- 2. Duplicate policies removed.
--
--    Thirteen of these tables carry two overlapping sets -- a `*_own_*` family
--    and a "Users can ..." family -- left behind by the 0001/0002/0003 rewrites.
--    Permissive policies OR together, so the duplicates were not making access
--    any broader, but they mean no single statement describes who can read a
--    row, and that one of each pair may have had a different predicate than the
--    name suggests. One policy per table, per command, with the predicate in the
--    file.
--
-- 3. `anon` loses its table grants.
--
--    An unauthenticated visitor should not be able to read the `exercises`
--    reference catalog through the API either; it is reached from an
--    authenticated session like everything else. Revoking is defence in depth
--    behind RLS rather than a substitute for it.
--
-- 4. `updated_at` triggers.
--
--    There are no triggers anywhere in the schema, so `updated_at` is whatever
--    the client chose to send. Any write path that forgets -- a service added
--    later, a direct SQL fix, the vault backfill -- silently leaves it stale, and
--    "last edited" ordering quietly becomes "creation order" for some rows. The
--    client keeps setting it; this makes it true regardless.
--
-- 5. The orphaned Google Calendar tables are dropped.
--
--    `google_calendar_tokens` holds an OAuth access token and a long-lived
--    refresh token as plaintext `text`. A refresh token is a bearer credential
--    for the whole Google account: whoever reads that row gets indefinite,
--    renewable access to Drive, Gmail and Calendar. No code in this repository
--    references either table -- no reads, no writes, no OAuth flow -- so nothing
--    refreshes or rotates them and a leaked token stays valid until someone
--    revokes it by hand in the Google account. Dead code holding a live
--    credential is strictly worse than no code, so the tables go. If calendar
--    sync is wanted later it needs a token vault with rotation and revocation,
--    which is a different piece of work and should be built, not un-dropped.
--
-- 6. `book_progress_log` is kept but indexed for the history it was designed
--    for. It is unreferenced today, and unlike the calendar tables it holds no
--    credential -- it is ordinary per-day reading history, so leaving it in
--    place costs nothing and it becomes useful the moment a progress timeline is
--    built on it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Google Calendar tables. Dropped first, so nothing below lists them.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.calendar_events CASCADE;
DROP TABLE IF EXISTS public.google_calendar_tokens CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Row level security, enabled and forced on every user-owned table.
-- ---------------------------------------------------------------------------
--
-- The `DO` block rather than forty `ALTER` statements, so the list of tables is
-- one list and a table added later is added to one place. Every table carrying a
-- `user_id` and holding anything about the person is in it; `exercises` is
-- included because it is per-user custom data as well as a shared catalog.
DO $$
DECLARE
  target text;
  owned_tables text[] := ARRAY[
    'abstinence_goals',
    'abstinence_history',
    'academic_assessments',
    'academic_courses',
    'academic_grades',
    'academic_goals',
    'academic_items',
    'academic_semesters',
    'body_measurements',
    'book_progress_log',
    'books',
    'custom_measurement_logs',
    'custom_measurements',
    'daily_habit_logs',
    'daily_log_projects',
    'daily_logs',
    'exercises',
    'grading_scales',
    'gpa_scales',
    'habits',
    'notes',
    'pr_entries',
    'pr_history',
    'project_plan_items',
    'projects',
    'study_goals',
    'study_history',
    'study_sessions',
    'timer_alarms',
    'timer_presets',
    'timer_settings',
    'user_settings',
    'workout_completion_log',
    'workout_exercises_log',
    'workout_plan_sessions',
    'workout_template_exercises',
    'workout_templates'
  ];
  policy record;
BEGIN
  FOREACH target IN ARRAY owned_tables LOOP
    IF to_regclass('public.' || quote_ident(target)) IS NULL THEN
      RAISE NOTICE 'skipping %: table does not exist', target;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target);

    -- Every pre-existing policy on this table. Dropped rather than reconciled:
    -- the predicates are not in version control, so there is nothing to compare
    -- and no way to know whether the surviving one is the strict one.
    FOR policy IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy.policyname, target);
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. One owner policy per table.
-- ---------------------------------------------------------------------------
--
-- Written out rather than generated, so that the predicate for each table is
-- greppable and reviewable. `USING` governs which existing rows are visible and
-- updatable; `WITH CHECK` governs what a row may be written as. Both are needed:
-- a policy with only `USING` lets a user UPDATE their own row's `user_id` to
-- somebody else's and lose it, and a policy with only `WITH CHECK` lets them
-- write rows they cannot read back.
--
-- `auth.uid()` is null for an unauthenticated request, so a null comparison is
-- false and `anon` gets nothing -- which is why the GRANT revoke below is
-- defence in depth rather than the mechanism.
DO $$
DECLARE
  target text;
  -- A declared variable rather than a literal `ARRAY[...]` in the FOREACH
  -- expression. The same list as the block above, for the same reason.
  owned_tables text[] := ARRAY[
    'abstinence_goals', 'abstinence_history', 'academic_assessments',
    'academic_courses', 'academic_grades', 'academic_goals', 'academic_items',
    'academic_semesters', 'body_measurements', 'book_progress_log', 'books',
    'custom_measurement_logs', 'custom_measurements', 'daily_habit_logs',
    'daily_log_projects', 'daily_logs', 'exercises', 'grading_scales',
    'gpa_scales', 'habits', 'notes', 'pr_entries',
    'pr_history', 'project_plan_items', 'projects', 'study_goals',
    'study_history', 'study_sessions', 'timer_alarms', 'timer_presets',
    'timer_settings', 'user_settings', 'workout_completion_log',
    'workout_exercises_log', 'workout_plan_sessions',
    'workout_template_exercises', 'workout_templates'
  ];
BEGIN
  FOREACH target IN ARRAY owned_tables LOOP
    IF to_regclass('public.' || quote_ident(target)) IS NULL THEN
      CONTINUE;
    END IF;

    -- A plain single-quoted template rather than a dollar-quoted body.
    -- The policy text contains no literal single quotes, and a dollar-quoted
    -- tag nested inside this block's own body is read as a new unterminated
    -- string rather than as text.
    --
    -- (And do not write a dollar-quoted tag in a comment in here either: the
    -- body terminates at the first one it sees, comments included, which is a
    -- syntax error pointing nowhere near the comment that caused it.)
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      || 'USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      target || '_owner', target);
  END LOOP;
END $$;

-- `gpa_scale_bands` is the one table above with no `user_id` of its own: a band
-- belongs to a scale, and the scale belongs to a user. It is deliberately kept
-- out of the loops below -- `auth.uid() = user_id` would not compile against a
-- column that does not exist -- and given a policy that walks the parent
-- instead. Reaching through the parent rather than adding a `user_id` to the
-- table is what keeps the band from being able to disagree with its scale about
-- who owns it.
ALTER TABLE public.gpa_scale_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpa_scale_bands FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.gpa_scale_bands') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS gpa_scale_bands_owner ON public.gpa_scale_bands';
  EXECUTE 'ALTER TABLE public.gpa_scale_bands DROP CONSTRAINT IF EXISTS gpa_scale_bands_owner';
END $$;

CREATE POLICY gpa_scale_bands_owner ON public.gpa_scale_bands
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gpa_scales s
      WHERE s.id = gpa_scale_bands.scale_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gpa_scales s
      WHERE s.id = gpa_scale_bands.scale_id
        AND s.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Grants.
-- ---------------------------------------------------------------------------
--
-- Revoked from `anon` and granted to `authenticated`, rather than left to
-- Supabase's defaults. Supabase grants all tables to both roles on creation,
-- which is why RLS is the only thing standing between accounts here; making the
-- grants explicit means the policy being correct stops being load-bearing for
-- anonymous traffic.
-- Both statements are guarded on the role existing. Supabase creates `anon` and
-- `authenticated` for you, but this file is also replayed against a bare
-- Postgres by `verify:migrations.mjs`, where neither role is present -- and a
-- migration that only runs on the hosted product is a migration nobody can test.
-- On such a database there is no anonymous caller to revoke from in the first
-- place, so skipping is correct rather than merely convenient.
DO $$
DECLARE
  target text;
  has_anon boolean;
  has_authenticated boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') INTO has_anon;
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') INTO has_authenticated;

  FOREACH target IN ARRAY ARRAY[
    'abstinence_goals', 'abstinence_history', 'academic_assessments',
    'academic_courses', 'academic_grades', 'academic_goals', 'academic_items',
    'academic_semesters', 'body_measurements', 'book_progress_log', 'books',
    'custom_measurement_logs', 'custom_measurements', 'daily_habit_logs',
    'daily_log_projects', 'daily_logs', 'exercises', 'grading_scales',
    'gpa_scales', 'habits', 'notes', 'pr_entries',
    'pr_history', 'project_plan_items', 'projects', 'study_goals',
    'study_history', 'study_sessions', 'timer_alarms', 'timer_presets',
    'timer_settings', 'user_settings', 'workout_completion_log',
    'workout_exercises_log', 'workout_plan_sessions',
    'workout_template_exercises', 'workout_templates'
  ] LOOP
    IF to_regclass('public.' || quote_ident(target)) IS NULL THEN
      CONTINUE;
    END IF;
    IF has_anon THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', target);
    END IF;
    IF has_authenticated THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', target);
    END IF;
  END LOOP;

  -- The bands table, which the loop above skips for having no `user_id`.
  IF to_regclass('public.gpa_scale_bands') IS NOT NULL THEN
    IF has_anon THEN
      EXECUTE 'REVOKE ALL ON public.gpa_scale_bands FROM anon';
    END IF;
    IF has_authenticated THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.gpa_scale_bands TO authenticated';
    END IF;
  END IF;
END $$;

COMMIT;