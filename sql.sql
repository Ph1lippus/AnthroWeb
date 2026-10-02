-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  notes text,
  status text DEFAULT 'planned'::text CHECK (status = ANY (ARRAY['planned'::text, 'active'::text, 'paused'::text, 'maintenance'::text, 'completed'::text, 'archived'::text])),
  priority text DEFAULT 'medium'::text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  started_at date,
  deadline date,
  completed_at date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.habits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT habits_pkey PRIMARY KEY (id),
  CONSTRAINT habits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.custom_measurements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  unit text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT custom_measurements_pkey PRIMARY KEY (id),
  CONSTRAINT custom_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.workout_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT workout_templates_pkey PRIMARY KEY (id),
  CONSTRAINT workout_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.exercises (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wger_id integer,
  name text NOT NULL,
  category text,
  equipment text,
  muscles text[],
  aliases text[],
  activity_type text NOT NULL DEFAULT 'strength'::text CHECK (activity_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text])),
  is_custom boolean NOT NULL DEFAULT false,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT exercises_pkey PRIMARY KEY (id),
  CONSTRAINT exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.academic_semesters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  year integer NOT NULL,
  semester integer CHECK (semester >= 1 AND semester <= 3),
  start_date date,
  end_date date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT academic_semesters_pkey PRIMARY KEY (id),
  CONSTRAINT academic_semesters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.grading_scales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  max_score real,
  passing_score real,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT grading_scales_pkey PRIMARY KEY (id),
  CONSTRAINT grading_scales_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.daily_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  wake_time time without time zone,
  bedtime time without time zone,
  sleep_duration real,
  morning_systolic integer,
  morning_diastolic integer,
  morning_bpm integer,
  evening_systolic integer,
  evening_diastolic integer,
  evening_bpm integer,
  body_temperature real,
  calories integer,
  protein integer,
  carbs integer,
  fat integer,
  water integer,
  project_id uuid,
  project_work_done boolean DEFAULT false,
  daily_score real,
  mood integer CHECK (mood >= 1 AND mood <= 10),
  journal_entry text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  weight real,
  body_fat real,
  goal_snapshot jsonb,
  sleep_quality integer CHECK (sleep_quality >= 0 AND sleep_quality <= 10),
  morning_routine boolean DEFAULT false,
  evening_routine boolean DEFAULT false,
  fruit_serving boolean DEFAULT false,
  studied boolean DEFAULT false,
  journal boolean DEFAULT false,
  stretching boolean DEFAULT false,
  reading boolean DEFAULT false,
  no_sleep boolean DEFAULT false,
  gym boolean DEFAULT false,
  CONSTRAINT daily_logs_pkey PRIMARY KEY (id),
  CONSTRAINT daily_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT daily_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.daily_habit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  habit_id uuid NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_habit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT daily_habit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT daily_habit_logs_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES public.habits(id)
);
CREATE TABLE public.custom_measurement_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  measurement_id uuid NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  value real NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT custom_measurement_logs_pkey PRIMARY KEY (id),
  CONSTRAINT custom_measurement_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT custom_measurement_logs_measurement_id_fkey FOREIGN KEY (measurement_id) REFERENCES public.custom_measurements(id)
);
CREATE TABLE public.workout_template_exercises (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workout_template_id uuid NOT NULL,
  user_id uuid NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  position integer NOT NULL DEFAULT 0,
  exercise_id uuid,
  exercise_name text NOT NULL,
  activity_type text NOT NULL DEFAULT 'strength'::text CHECK (activity_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text])),
  target_sets_detail jsonb,
  target_reps integer,
  target_weight real,
  target_duration_minutes integer,
  target_distance_km real,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT workout_template_exercises_pkey PRIMARY KEY (id),
  CONSTRAINT workout_template_exercises_workout_template_id_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  CONSTRAINT workout_template_exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT workout_template_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE SET NULL
);
CREATE TABLE public.workout_completion_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workout_date date NOT NULL DEFAULT CURRENT_DATE,
  workout_template_id uuid,
  completed boolean NOT NULL DEFAULT false,
  intensity integer CHECK (intensity >= 1 AND intensity <= 10),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  duration_minutes integer,
  CONSTRAINT workout_completion_log_pkey PRIMARY KEY (id),
  CONSTRAINT workout_completion_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT workout_completion_log_workout_template_id_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id) ON DELETE SET NULL,
  CONSTRAINT workout_completion_log_user_date_key UNIQUE (user_id, workout_date)
);
CREATE TABLE public.workout_exercises_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workout_completion_id uuid NOT NULL,
  user_id uuid NOT NULL,
  template_exercise_id uuid,
  exercise_id uuid,
  exercise_name text NOT NULL,
  activity_type text NOT NULL DEFAULT 'strength'::text CHECK (activity_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text])),
  position integer NOT NULL DEFAULT 0,
  planned boolean NOT NULL DEFAULT false,
  completed boolean NOT NULL DEFAULT false,
  sets_detail jsonb,
  reps integer,
  weight real,
  duration_minutes integer,
  distance_km real,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT workout_exercises_log_pkey PRIMARY KEY (id),
  CONSTRAINT workout_exercises_log_workout_completion_id_fkey FOREIGN KEY (workout_completion_id) REFERENCES public.workout_completion_log(id) ON DELETE CASCADE,
  CONSTRAINT workout_exercises_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT workout_exercises_log_template_exercise_id_fkey FOREIGN KEY (template_exercise_id) REFERENCES public.workout_template_exercises(id) ON DELETE SET NULL,
  CONSTRAINT workout_exercises_log_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE SET NULL
);
CREATE TABLE public.pr_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exercise_id uuid,
  exercise_name text NOT NULL,
  source text NOT NULL DEFAULT 'manual'::text CHECK (source = ANY (ARRAY['template'::text, 'manual'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pr_entries_pkey PRIMARY KEY (id),
  CONSTRAINT pr_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT pr_entries_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE SET NULL
);
CREATE TABLE public.pr_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pr_entry_id uuid,
  exercise_name text NOT NULL,
  weight real,
  reps integer,
  workout_date date NOT NULL,
  workout_completion_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pr_history_pkey PRIMARY KEY (id),
  CONSTRAINT pr_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT pr_history_pr_entry_id_fkey FOREIGN KEY (pr_entry_id) REFERENCES public.pr_entries(id) ON DELETE CASCADE,
  CONSTRAINT pr_history_workout_completion_id_fkey FOREIGN KEY (workout_completion_id) REFERENCES public.workout_completion_log(id) ON DELETE CASCADE
);
CREATE TABLE public.body_measurements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  measure_date date NOT NULL DEFAULT CURRENT_DATE,
  wrist_left real,
  wrist_right real,
  neck real,
  shoulders real,
  chest real,
  forearm_left_relaxed real,
  forearm_left_flexed real,
  forearm_right_relaxed real,
  forearm_right_flexed real,
  bicep_left_relaxed real,
  bicep_left_flexed real,
  bicep_right_relaxed real,
  bicep_right_flexed real,
  waist real,
  hips real,
  thigh_left real,
  thigh_right real,
  calf_left real,
  calf_right real,
  waist_hip_ratio real,
  waist_height_ratio real,
  shoulder_waist_ratio real,
  shoulder_chest_ratio real,
  shoulder_hip_ratio real,
  thigh_calf_ratio real,
  bicep_ratio real,
  bicep_flexing_symmetry real,
  forearm_symmetry real,
  lean_body_mass real,
  fat_mass real,
  bmr real,
  ffmi real,
  adonis_index real,
  torso_taper real,
  leg_torso_ratio real,
  metabolic_age integer,
  muscle_quality real,
  dynamic_strength real,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  weight real,
  CONSTRAINT body_measurements_pkey PRIMARY KEY (id),
  CONSTRAINT weekly_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.books (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  current_page integer DEFAULT 0,
  progress real DEFAULT 0,
  status text DEFAULT 'planned'::text CHECK (status = ANY (ARRAY['planned'::text, 'reading'::text, 'completed'::text, 'dropped'::text])),
  notes text,
  started_at date,
  completed_at date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT books_pkey PRIMARY KEY (id),
  CONSTRAINT books_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.academic_grades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  semester_id uuid,
  grading_scale_id uuid,
  course_name text NOT NULL,
  grade real,
  weight real DEFAULT 1.0,
  attendance_grade real,
  attendance_weight real DEFAULT 0.0,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT academic_grades_pkey PRIMARY KEY (id),
  CONSTRAINT academic_grades_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT academic_grades_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.academic_semesters(id),
  CONSTRAINT academic_grades_grading_scale_id_fkey FOREIGN KEY (grading_scale_id) REFERENCES public.grading_scales(id)
);
CREATE TABLE public.academic_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  semester_id uuid,
  course_name text NOT NULL,
  target_grade real NOT NULL,
  current_grade real,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT academic_goals_pkey PRIMARY KEY (id),
  CONSTRAINT academic_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT academic_goals_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.academic_semesters(id)
);
CREATE TABLE public.academic_assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_name text NOT NULL,
  semester_id uuid,
  name text NOT NULL,
  grade real,
  weight real NOT NULL,
  is_completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT academic_assessments_pkey PRIMARY KEY (id),
  CONSTRAINT academic_assessments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT academic_assessments_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.academic_semesters(id)
);
CREATE TABLE public.study_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes integer NOT NULL,
  session_type text DEFAULT 'study'::text CHECK (session_type = ANY (ARRAY['study'::text, 'break'::text])),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT study_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT study_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.study_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  history_date date NOT NULL DEFAULT CURRENT_DATE,
  total_study_minutes integer DEFAULT 0,
  total_break_minutes integer DEFAULT 0,
  session_count integer DEFAULT 0,
  average_session_length real DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT study_history_pkey PRIMARY KEY (id),
  CONSTRAINT study_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.study_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  daily_goal_minutes integer DEFAULT 60,
  weekly_goal_minutes integer DEFAULT 300,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT study_goals_pkey PRIMARY KEY (id),
  CONSTRAINT study_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.google_calendar_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expiry_date timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT google_calendar_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT google_calendar_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  google_event_id text,
  title text NOT NULL,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  is_study_block boolean DEFAULT false,
  synced boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT calendar_events_pkey PRIMARY KEY (id),
  CONSTRAINT calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  gender text CHECK (gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text, 'prefer_not_to_say'::text])),
  height_cm real,
  date_of_birth date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  goal text CHECK (goal = ANY (ARRAY['maintain'::text, 'lose'::text, 'gain'::text])),
  starting_weight real,
  starting_bodyfat real,
  target_weight real,
  target_bodyfat real,
  last_measurement_date date,
  active_goals jsonb,
  weight_unit text NOT NULL DEFAULT 'kg'::text CHECK (weight_unit = ANY (ARRAY['kg'::text, 'lbs'::text])),
  goal_history jsonb,
  CONSTRAINT user_settings_pkey PRIMARY KEY (id),
  CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.book_progress_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL,
  previous_page integer DEFAULT 0,
  current_page integer NOT NULL,
  pages_read integer DEFAULT 0,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT book_progress_log_pkey PRIMARY KEY (id),
  CONSTRAINT book_progress_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT book_progress_log_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id)
);
CREATE TABLE public.notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  content text NOT NULL DEFAULT ''::text,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  notes_color text,
  notes_icon text,
  notes_cover text,
  notes_parent_id uuid,
  notes_deleted_at timestamp with time zone,
  notes_tags text[] NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT notes_pkey PRIMARY KEY (id),
  CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT notes_notes_parent_id_fkey FOREIGN KEY (notes_parent_id) REFERENCES public.notes(id)
);
CREATE TABLE public.project_plan_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  is_completed boolean DEFAULT false,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_plan_items_pkey PRIMARY KEY (id),
  CONSTRAINT project_plan_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_plan_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.abstinence_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  target_days integer,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT abstinence_goals_pkey PRIMARY KEY (id),
  CONSTRAINT abstinence_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.abstinence_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  duration_days integer NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT abstinence_history_pkey PRIMARY KEY (id),
  CONSTRAINT abstinence_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.daily_log_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  daily_log_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_log_projects_pkey PRIMARY KEY (id),
  CONSTRAINT daily_log_projects_daily_log_id_fkey FOREIGN KEY (daily_log_id) REFERENCES public.daily_logs(id),
  CONSTRAINT daily_log_projects_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT daily_log_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.academic_courses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  semester_id uuid,
  name text NOT NULL,
  code text,
  credits real NOT NULL DEFAULT 6 CHECK (credits > 0::double precision),
  order_index integer NOT NULL DEFAULT 0,
  final_grade real CHECK (final_grade IS NULL OR final_grade >= 0::double precision AND final_grade <= 100::double precision),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  minimum_grade real CHECK (minimum_grade IS NULL OR minimum_grade >= 0::double precision AND minimum_grade <= 100::double precision),
  CONSTRAINT academic_courses_pkey PRIMARY KEY (id),
  CONSTRAINT academic_courses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT academic_courses_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.academic_semesters(id)
);
CREATE TABLE public.academic_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'homework'::text CHECK (category = ANY (ARRAY['homework'::text, 'exam'::text, 'quiz'::text, 'project'::text, 'lab'::text, 'participation'::text, 'other'::text])),
  weight real NOT NULL DEFAULT 0 CHECK (weight >= 0::double precision AND weight <= 100::double precision),
  max_score real NOT NULL DEFAULT 100 CHECK (max_score > 0::double precision),
  score real CHECK (score IS NULL OR score >= 0::double precision),
  due_date date,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  minimum_grade real,
  CONSTRAINT academic_items_pkey PRIMARY KEY (id),
  CONSTRAINT academic_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT academic_items_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.academic_courses(id),
  CONSTRAINT academic_items_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.academic_items(id)
);
CREATE TABLE public.gpa_scales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  basis text NOT NULL DEFAULT 'percentage'::text CHECK (basis = ANY (ARRAY['percentage'::text, 'points'::text])),
  max_value real NOT NULL CHECK (max_value > 0::double precision),
  min_value real NOT NULL DEFAULT 0,
  is_preset boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  rounding text NOT NULL DEFAULT 'nearest'::text CHECK (rounding = ANY (ARRAY['nearest'::text, 'floor'::text, 'ceil'::text])),
  passing_grade real CHECK (passing_grade IS NULL OR passing_grade >= 0::double precision AND passing_grade <= 100::double precision),
  CONSTRAINT gpa_scales_pkey PRIMARY KEY (id),
  CONSTRAINT gpa_scales_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.gpa_scale_bands (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scale_id uuid NOT NULL,
  min_percentage real NOT NULL CHECK (min_percentage >= 0::double precision AND min_percentage <= 100::double precision),
  points real NOT NULL,
  letter text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gpa_scale_bands_pkey PRIMARY KEY (id),
  CONSTRAINT gpa_scale_bands_scale_id_fkey FOREIGN KEY (scale_id) REFERENCES public.gpa_scales(id)
);
-- ---------------------------------------------------------------------------
-- Indexes
--
-- Every workout table is read by (user_id, something) and written once per day,
-- so without these the client queries below are sequential scans over the
-- user's whole history.
-- ---------------------------------------------------------------------------
-- Serves the library lookup and backs the (user_id, lower(name)) upsert target
-- used when syncing from wger, so a re-sync updates rather than duplicating.
CREATE UNIQUE INDEX exercises_user_id_name_idx ON public.exercises (user_id, lower(name));
CREATE INDEX exercises_user_id_wger_idx ON public.exercises (user_id, wger_id);

CREATE INDEX workout_template_exercises_template_day_idx
  ON public.workout_template_exercises (workout_template_id, day_of_week, position);
-- Serves "what is today's plan" without loading the whole template.
CREATE INDEX workout_template_exercises_user_day_idx
  ON public.workout_template_exercises (user_id, day_of_week);

-- The unique constraint on (user_id, workout_date) already indexes the leading
-- column; this one serves the history list, which is always ordered by date desc.
CREATE INDEX workout_completion_log_user_date_idx
  ON public.workout_completion_log (user_id, workout_date DESC);

CREATE INDEX workout_exercises_log_completion_idx
  ON public.workout_exercises_log (workout_completion_id);
CREATE INDEX workout_exercises_log_user_exercise_idx
  ON public.workout_exercises_log (user_id, exercise_id);
CREATE INDEX workout_exercises_log_user_name_idx
  ON public.workout_exercises_log (user_id, lower(exercise_name));

CREATE INDEX pr_entries_user_id_idx ON public.pr_entries (user_id);
CREATE INDEX pr_history_user_entry_idx ON public.pr_history (user_id, pr_entry_id, workout_date DESC);
CREATE INDEX pr_history_user_name_idx ON public.pr_history (user_id, lower(exercise_name), workout_date DESC);

CREATE UNIQUE INDEX workout_templates_single_active_idx
  ON public.workout_templates (user_id) WHERE is_active;
