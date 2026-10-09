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
  CONSTRAINT habits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT unique_user_habit UNIQUE (user_id, name)
);
CREATE TABLE public.custom_measurements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  unit text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT custom_measurements_pkey PRIMARY KEY (id),
  CONSTRAINT custom_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT unique_user_custom_measurement UNIQUE (user_id, name)
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
  morning_mood integer CHECK (morning_mood IS NULL OR morning_mood >= 1 AND morning_mood <= 10),
  evening_mood integer CHECK (evening_mood IS NULL OR evening_mood >= 1 AND evening_mood <= 10),
  journal_entry text,
  journal_morning text,
  journal_evening text,
  journal_links text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
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
  cheat_day boolean DEFAULT false,
  CONSTRAINT daily_logs_pkey PRIMARY KEY (id),
  CONSTRAINT daily_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT daily_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT unique_user_date UNIQUE (user_id, log_date)
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
  CONSTRAINT daily_habit_logs_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES public.habits(id),
  CONSTRAINT unique_user_habit_date UNIQUE (user_id, habit_id, log_date)
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
  CONSTRAINT custom_measurement_logs_measurement_id_fkey FOREIGN KEY (measurement_id) REFERENCES public.custom_measurements(id),
  CONSTRAINT unique_user_measurement_date UNIQUE (user_id, measurement_id, log_date)
);
CREATE TABLE public.workout_template_exercises (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workout_template_id uuid NOT NULL,
  user_id uuid NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  exercise_name text NOT NULL,
  target_reps integer,
  target_weight real,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  position integer NOT NULL DEFAULT 0,
  exercise_id uuid,
  -- Must stay in step with ACTIVITY_TYPES in src/utils/workoutSets.ts. The client
  -- only ever sends those three values, so the CHECK costs nothing and it keeps a
  -- hand-written insert or a future query from parking a value the client cannot
  -- parse -- the stats rail would silently bucket it as strength.
  activity_type text NOT NULL DEFAULT 'strength'::text CHECK (activity_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text])),
  target_sets_detail jsonb,
  target_duration_minutes integer,
  target_distance_km real,
  updated_at timestamp with time zone DEFAULT now(),
  session_id uuid,
  -- No unique constraint on (workout_template_id, day_of_week). There was one --
  -- `unique_template_day` -- left over from when this table was
  -- `workout_template_days` and a template *was* a week. 0008 inserted
  -- workout_plan_sessions so a day could hold several sessions but never dropped
  -- it, so a template could hold only one exercise per weekday and the second
  -- add failed with a duplicate-key error the UI swallowed. Dropped by
  -- supabase/migrations/0010_drop_unique_template_day.sql. Order within a session
  -- is `position`; see workout_template_exercises_session_idx.
  CONSTRAINT workout_template_exercises_pkey PRIMARY KEY (id),
  CONSTRAINT workout_template_days_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT workout_template_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id),
  CONSTRAINT workout_template_exercises_workout_template_id_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id),
  CONSTRAINT workout_template_exercises_session_fkey FOREIGN KEY (session_id) REFERENCES public.workout_plan_sessions(id)
);
CREATE TABLE public.workout_completion_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workout_date date NOT NULL DEFAULT CURRENT_DATE,
  workout_template_id uuid,
  completed boolean DEFAULT false,
  intensity integer CHECK (intensity >= 1 AND intensity <= 10),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  duration_minutes integer,
  plan_session_id uuid,
  CONSTRAINT workout_completion_log_pkey PRIMARY KEY (id),
  CONSTRAINT workout_completion_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT workout_completion_log_workout_template_id_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id),
  CONSTRAINT workout_completion_log_plan_session_fkey FOREIGN KEY (plan_session_id) REFERENCES public.workout_plan_sessions(id),
  CONSTRAINT unique_user_workout_date UNIQUE (user_id, workout_date)
);
CREATE TABLE public.workout_exercises_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workout_completion_id uuid NOT NULL,
  user_id uuid NOT NULL,
  exercise_name text NOT NULL,
  reps integer,
  weight real,
  created_at timestamp with time zone DEFAULT now(),
  template_exercise_id uuid,
  exercise_id uuid,
  activity_type text NOT NULL DEFAULT 'strength'::text CHECK (activity_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text])),
  position integer NOT NULL DEFAULT 0,
  planned boolean NOT NULL DEFAULT false,
  completed boolean NOT NULL DEFAULT false,
  sets_detail jsonb,
  duration_minutes integer,
  distance_km real,
  notes text,
  CONSTRAINT workout_exercises_log_pkey PRIMARY KEY (id),
  CONSTRAINT workout_exercises_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT workout_exercises_log_template_exercise_id_fkey FOREIGN KEY (template_exercise_id) REFERENCES public.workout_template_exercises(id),
  CONSTRAINT workout_exercises_log_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id),
  CONSTRAINT workout_exercises_log_workout_completion_id_fkey FOREIGN KEY (workout_completion_id) REFERENCES public.workout_completion_log(id)
);
CREATE TABLE public.pr_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exercise_name text NOT NULL,
  weight real,
  reps integer,
  workout_date date NOT NULL,
  workout_completion_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  pr_entry_id uuid,
  CONSTRAINT pr_history_pkey PRIMARY KEY (id),
  CONSTRAINT pr_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT pr_history_pr_entry_id_fkey FOREIGN KEY (pr_entry_id) REFERENCES public.pr_entries(id),
  CONSTRAINT pr_history_workout_completion_id_fkey FOREIGN KEY (workout_completion_id) REFERENCES public.workout_completion_log(id)
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
  body_fat real,
  body_fat_method text CHECK (body_fat_method IS NULL OR body_fat_method = ANY (ARRAY['scale'::text, 'calipers'::text, 'navy'::text, 'manual'::text])),
  CONSTRAINT body_measurements_pkey PRIMARY KEY (id),
  CONSTRAINT weekly_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT unique_user_week UNIQUE (user_id, measure_date)
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
  CONSTRAINT academic_goals_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.academic_semesters(id),
  CONSTRAINT unique_course_goal UNIQUE (user_id, semester_id, course_name)
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
  CONSTRAINT study_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT unique_user_history_date UNIQUE (user_id, history_date)
);
CREATE TABLE public.study_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  daily_goal_minutes integer DEFAULT 60,
  weekly_goal_minutes integer DEFAULT 300,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT study_goals_pkey PRIMARY KEY (id),
  CONSTRAINT study_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT unique_user_goal UNIQUE (user_id)
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
  CONSTRAINT google_calendar_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT unique_user_calendar UNIQUE (user_id)
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
  cheat_days_allowed integer DEFAULT 1 CHECK (cheat_days_allowed IS NULL OR cheat_days_allowed >= 0),
  cheat_days_period text NOT NULL DEFAULT 'week'::text CHECK (cheat_days_period = ANY (ARRAY['week'::text, 'month'::text])),
  CONSTRAINT user_settings_pkey PRIMARY KEY (id),
  CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT unique_user_setting UNIQUE (user_id)
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
  CONSTRAINT book_progress_log_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id),
  CONSTRAINT unique_book_date UNIQUE (user_id, book_id, log_date)
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
  notes_position numeric NOT NULL DEFAULT 0,
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
  due_time time,
  order_index integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
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
CREATE TABLE public.pr_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exercise_id uuid,
  exercise_name text NOT NULL,
  source text NOT NULL DEFAULT 'manual'::text CHECK (source = ANY (ARRAY['template'::text, 'manual'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pr_entries_pkey PRIMARY KEY (id),
  CONSTRAINT pr_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT pr_entries_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id)
);
CREATE TABLE public.workout_plan_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workout_template_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  activity_type text NOT NULL DEFAULT 'strength'::text CHECK (activity_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text])),
  target_duration_minutes integer,
  target_intensity integer CHECK (target_intensity >= 1 AND target_intensity <= 10),
  notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT workout_plan_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT workout_plan_sessions_template_fkey FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id),
  CONSTRAINT workout_plan_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);


-- The exercise library's upsert target. The catalog below lists this index, but the
-- table definitions above do not carry it, so this is the only place it is
-- executable. syncExerciseLibrary upserts with on_conflict 'user_id,wger_id', which
-- PostgREST resolves against a real unique index -- without this every library sync
-- fails. Created by supabase/migrations/0009_exercise_library_sync_key.sql.
CREATE UNIQUE INDEX IF NOT EXISTS exercises_user_id_wger_uniq
  ON public.exercises (user_id, wger_id);


-- The alias index from 0010, executable. The catalog below lists it as
-- `public.lower_array(aliases)`, which is not a thing Postgres has: pg_catalog
-- ships lower(text), lower(anyrange) and lower(anymultirange) and no array
-- overload, so `lower(aliases)` fails with `function lower(text[]) does not
-- exist` rather than quietly doing nothing. lower_array is 0010's own immutable
-- wrapper and has to be created before this index.
CREATE OR REPLACE FUNCTION public.lower_array(a text[])
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
AS $$
  SELECT COALESCE(array(SELECT lower(x) FROM unnest(a) AS x), ARRAY[]::text[])
$$;

CREATE INDEX IF NOT EXISTS exercises_user_id_aliases_lower_gin
  ON public.exercises USING gin (public.lower_array(aliases));


INDEXES.

Table	Columns	Name	
abstinence_goals

id

abstinence_goals_pkey


View definition

abstinence_history

id

abstinence_history_pkey


View definition

academic_assessments

id

academic_assessments_pkey


View definition

academic_courses

id

academic_courses_pkey


View definition

academic_courses

semester_id

academic_courses_semester_idx


View definition

academic_courses

user_id

academic_courses_user_idx


View definition

academic_courses

user_id, semester_id, order_index

academic_courses_user_semester_idx


View definition

academic_goals

id

academic_goals_pkey


View definition

academic_grades

id

academic_grades_pkey


View definition

academic_items

course_id

academic_items_course_idx


View definition

academic_items

parent_id

academic_items_parent_idx


View definition

academic_items

id

academic_items_pkey


View definition

academic_items

user_id, course_id, order_index

academic_items_user_course_idx


View definition

academic_items

user_id

academic_items_user_idx


View definition

academic_semesters

id

academic_semesters_pkey


View definition

book_progress_log

id

book_progress_log_pkey


View definition

books

id

books_pkey


View definition

calendar_events

id

calendar_events_pkey


View definition

custom_measurement_logs

id

custom_measurement_logs_pkey


View definition

custom_measurements

id

custom_measurements_pkey


View definition

daily_habit_logs

id

daily_habit_logs_pkey


View definition

daily_habit_logs

user_id, habit_id, log_date

daily_habit_logs_user_habit_date_key


View definition

daily_log_projects

daily_log_id, project_id

daily_log_projects_daily_log_project_key


View definition

daily_log_projects

id

daily_log_projects_pkey


View definition

daily_logs

id

daily_logs_pkey


View definition

exercises

id

exercises_pkey


View definition

exercises

user_id, (expression)

exercises_user_id_name_idx


View definition

exercises

user_id, wger_id

exercises_user_id_wger_idx


View definition

exercises

user_id, wger_id

exercises_user_id_wger_uniq


View definition

exercises

public.lower_array(aliases)

exercises_user_id_aliases_lower_gin
-- Added by supabase/migrations/0010_drop_unique_template_day.sql, for the
-- alias half of the exercise search. `rankMatches` checks `aliases` as well as
-- `name`, so a query can match a row whose `name` differs from what was typed --
-- and a client-side id fix cannot help there, because there is no row on the
-- server to backfill from. GIN's array operator class indexes each element, so
-- this answers lower_array(aliases) @> ARRAY[lower(...)].
--
-- lower_array() is that migration's own immutable wrapper: pg_catalog has no
-- array overload of lower, so plain `lower(aliases)` is a type error rather than
-- a no-op, and an expression index needs an immutable function. It matches the
-- function 0010 creates, which is the only reason the index below can exist.
--
-- The 0010 backfill itself matches on `name` only. This index is for moving that
-- match server-side, not for the backfill it sits beside.


View definition

google_calendar_tokens

id

google_calendar_tokens_pkey


View definition

gpa_scale_bands

id

gpa_scale_bands_pkey


View definition

gpa_scale_bands

scale_id, min_percentage

gpa_scale_bands_scale_idx


View definition

gpa_scales

id

gpa_scales_pkey


View definition

gpa_scales

user_id

gpa_scales_user_idx


View definition

gpa_scales

user_id, sort_order

gpa_scales_user_order_idx


View definition

grading_scales

id

grading_scales_pkey


View definition

habits

id

habits_pkey


View definition

abstinence_goals

user_id

idx_abstinence_goals_user_id


View definition

abstinence_history

user_id

idx_abstinence_history_user_id


View definition

academic_assessments

user_id, course_name

idx_academic_assessments_user_course


View definition

academic_goals

user_id

idx_academic_goals_user_id


View definition

academic_grades

user_id

idx_academic_grades_user_id


View definition

academic_semesters

user_id

idx_academic_semesters_user_id


View definition

body_measurements

user_id, measure_date

idx_body_measurements_user_date


View definition

book_progress_log

book_id

idx_book_progress_log_book_id


View definition

book_progress_log

user_id, log_date

idx_book_progress_log_user_date


View definition

books

status

idx_books_status


View definition

books

user_id

idx_books_user_id


View definition

calendar_events

user_id, start_time

idx_calendar_events_user_start


View definition

custom_measurement_logs

user_id, log_date

idx_custom_measurement_logs_user_date


View definition

custom_measurements

user_id

idx_custom_measurements_user_id


View definition

daily_habit_logs

user_id, log_date

idx_daily_habit_logs_user_date


View definition

daily_logs

user_id, log_date

idx_daily_logs_user_date


View definition

habits

user_id

idx_habits_user_id


View definition

notes

user_id, is_pinned

idx_notes_pinned


View definition

notes

user_id

idx_notes_user_id


View definition

pr_history

user_id, exercise_name

idx_pr_history_user_exercise


View definition

projects

user_id

idx_projects_user_id


View definition

study_history

user_id, history_date

idx_study_history_user_date


View definition

study_sessions

user_id, session_date

idx_study_sessions_user_date


View definition

user_settings

user_id

idx_user_settings_user_id


View definition

body_measurements

user_id, measure_date

idx_weekly_measurements_user_date


View definition

workout_completion_log

user_id, workout_date

idx_workout_completion_log_user_date


View definition

workout_completion_log

user_id, workout_date

idx_workout_completion_user_date


View definition

workout_exercises_log

workout_completion_id

idx_workout_exercises_log_completion


View definition

workout_template_exercises

workout_template_id

idx_workout_template_days_template


View definition

workout_templates

user_id

idx_workout_templates_user_id


View definition

notes

id

notes_pkey


View definition

notes

notes_tags

notes_tags_idx


View definition

notes

user_id, updated_at

notes_user_live_pinned_updated_idx


View definition

notes

user_id, updated_at

notes_user_live_updated_idx


View definition

notes

user_id, notes_parent_id

notes_user_parent_idx


View definition

notes

user_id, updated_at

notes_user_pinned_updated_idx


View definition

notes

user_id, updated_at

notes_user_updated_idx


View definition

pr_entries

id

pr_entries_pkey


View definition

pr_entries

user_id

pr_entries_user_id_idx


View definition

pr_history

id

pr_history_pkey


View definition

pr_history

user_id, pr_entry_id, workout_date

pr_history_user_entry_idx


View definition

pr_history

user_id, (expression), workout_date

pr_history_user_name_idx


View definition

project_plan_items

id

project_plan_items_pkey


View definition

projects

id

projects_pkey


View definition

study_goals

id

study_goals_pkey


View definition

study_history

id

study_history_pkey


View definition

study_sessions

id

study_sessions_pkey


View definition

book_progress_log

user_id, book_id, log_date

unique_book_date


View definition

academic_goals

user_id, semester_id, course_name

unique_course_goal


View definition

workout_template_exercises

id

workout_template_days_pkey


View definition

google_calendar_tokens

user_id

unique_user_calendar


View definition

custom_measurements

user_id, name

unique_user_custom_measurement


View definition

daily_logs

user_id, log_date

unique_user_date


View definition

study_goals

user_id

unique_user_goal


View definition

habits

user_id, name

unique_user_habit


View definition

daily_habit_logs

user_id, habit_id, log_date

unique_user_habit_date


View definition

study_history

user_id, history_date

unique_user_history_date


View definition

custom_measurement_logs

user_id, measurement_id, log_date

unique_user_measurement_date


View definition

user_settings

user_id

unique_user_setting


View definition

body_measurements

user_id, measure_date

unique_user_week


View definition

workout_completion_log

user_id, workout_date

unique_user_workout_date


View definition

body_measurements

user_id, measure_date

uq_body_measurements_user_date


View definition

user_settings

id

user_settings_pkey


View definition

body_measurements

id

weekly_measurements_pkey


View definition

workout_completion_log

id

workout_completion_log_pkey


View definition

workout_completion_log

user_id, workout_date

workout_completion_log_user_date_idx


View definition

workout_completion_log

user_id, workout_date

workout_completion_log_user_date_key


View definition

workout_exercises_log

workout_completion_id

workout_exercises_log_completion_idx


View definition

workout_exercises_log

id

workout_exercises_log_pkey


View definition

workout_exercises_log

user_id, exercise_id

workout_exercises_log_user_exercise_idx


View definition

workout_exercises_log

user_id, (expression)

workout_exercises_log_user_name_idx


View definition

workout_plan_sessions

id

workout_plan_sessions_pkey


View definition

workout_plan_sessions

workout_template_id, day_of_week, position

workout_plan_sessions_template_idx


View definition

workout_plan_sessions

user_id, day_of_week

workout_plan_sessions_user_day_idx


View definition

workout_template_exercises

id

workout_template_days_pkey


View definition

workout_template_exercises

session_id, position

workout_template_exercises_session_idx


View definition

workout_template_exercises

workout_template_id, day_of_week, position

workout_template_exercises_template_day_idx


View definition

workout_template_exercises

user_id, day_of_week

workout_template_exercises_user_day_idx


View definition

workout_templates

id

workout_templates_pkey


View definition

workout_templates

user_id

workout_templates_single_active_idx


View definition




POLICIES 


abstinence_goals

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own abstinence goals
DELETE	
public


Users can insert own abstinence goals
INSERT	
public


Users can update own abstinence goals
UPDATE	
public


Users can view own abstinence goals
SELECT	
public

abstinence_history

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own abstinence history
DELETE	
public


Users can insert own abstinence history
INSERT	
public


Users can update own abstinence history
UPDATE	
public


Users can view own abstinence history
SELECT	
public

academic_assessments

Disable RLS

Create policy

Name	Command	Applied to	Actions

academic_assessments_delete
DELETE	
public


academic_assessments_insert
INSERT	
public


academic_assessments_select
SELECT	
public


academic_assessments_update
UPDATE	
public


Users can delete own academic_assessments
DELETE	
public


Users can insert own academic_assessments
INSERT	
public


Users can update own academic_assessments
UPDATE	
public


Users can view own academic_assessments
SELECT	
public

academic_courses

Disable RLS

Create policy

Name	Command	Applied to	Actions

academic_courses_delete
DELETE	
public


academic_courses_insert
INSERT	
public


academic_courses_own_rows
ALL	
authenticated


academic_courses_select
SELECT	
public


academic_courses_update
UPDATE	
public

academic_goals

Disable RLS

Create policy

Name	Command	Applied to	Actions

academic_goals_delete
DELETE	
public


academic_goals_insert
INSERT	
public


academic_goals_select
SELECT	
public


academic_goals_update
UPDATE	
public


Users can delete own academic_goals
DELETE	
public


Users can insert own academic_goals
INSERT	
public


Users can update own academic_goals
UPDATE	
public


Users can view own academic_goals
SELECT	
public

academic_grades

Disable RLS

Create policy

Name	Command	Applied to	Actions

academic_grades_delete
DELETE	
public


academic_grades_insert
INSERT	
public


academic_grades_select
SELECT	
public


academic_grades_update
UPDATE	
public


Users can delete own academic_grades
DELETE	
public


Users can insert own academic_grades
INSERT	
public


Users can update own academic_grades
UPDATE	
public


Users can view own academic_grades
SELECT	
public

academic_items

Disable RLS

Create policy

Name	Command	Applied to	Actions

academic_items_delete
DELETE	
public


academic_items_insert
INSERT	
public


academic_items_own_rows
ALL	
authenticated


academic_items_select
SELECT	
public


academic_items_update
UPDATE	
public

academic_semesters

Disable RLS

Create policy

Name	Command	Applied to	Actions

academic_semesters_delete
DELETE	
public


academic_semesters_insert
INSERT	
public


academic_semesters_select
SELECT	
public


academic_semesters_update
UPDATE	
public


Users can delete own academic_semesters
DELETE	
public


Users can insert own academic_semesters
INSERT	
public


Users can update own academic_semesters
UPDATE	
public


Users can view own academic_semesters
SELECT	
public

body_measurements

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own weekly_measurements
DELETE	
public


Users can insert own weekly_measurements
INSERT	
public


Users can update own weekly_measurements
UPDATE	
public


Users can view own weekly_measurements
SELECT	
public

book_progress_log

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own book progress
DELETE	
public


Users can insert own book progress
INSERT	
public


Users can update own book progress
UPDATE	
public


Users can view own book progress
SELECT	
public

books

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own books
DELETE	
public


Users can insert own books
INSERT	
public


Users can update own books
UPDATE	
public


Users can view own books
SELECT	
public

calendar_events

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own calendar_events
DELETE	
public


Users can insert own calendar_events
INSERT	
public


Users can update own calendar_events
UPDATE	
public


Users can view own calendar_events
SELECT	
public

custom_measurement_logs

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own custom_measurement_logs
DELETE	
public


Users can insert own custom_measurement_logs
INSERT	
public


Users can update own custom_measurement_logs
UPDATE	
public


Users can view own custom_measurement_logs
SELECT	
public

custom_measurements

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own custom_measurements
DELETE	
public


Users can insert own custom_measurements
INSERT	
public


Users can update own custom_measurements
UPDATE	
public


Users can view own custom_measurements
SELECT	
public

daily_habit_logs

Disable RLS

Create policy

Name	Command	Applied to	Actions

daily_habit_logs_own_delete
DELETE	
public


daily_habit_logs_own_insert
INSERT	
public


daily_habit_logs_own_select
SELECT	
public


daily_habit_logs_own_update
UPDATE	
public


Users can delete own daily_habit_logs
DELETE	
public


Users can insert own daily_habit_logs
INSERT	
public


Users can update own daily_habit_logs
UPDATE	
public


Users can view own daily_habit_logs
SELECT	
public

daily_log_projects

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete their own daily log projects
DELETE	
public


Users can insert their own daily log projects
INSERT	
public


Users can select their own daily log projects
SELECT	
public

daily_logs

Disable RLS

Create policy

Name	Command	Applied to	Actions

daily_logs_own_delete
DELETE	
public


daily_logs_own_insert
INSERT	
public


daily_logs_own_select
SELECT	
public


daily_logs_own_update
UPDATE	
public


Users can delete own daily_logs
DELETE	
public


Users can insert own daily_logs
INSERT	
public


Users can update own daily_logs
UPDATE	
public


Users can view own daily_logs
SELECT	
public

exercises

Disable RLS

Create policy

Name	Command	Applied to	Actions

exercises_own_delete
DELETE	
public


exercises_own_insert
INSERT	
public


exercises_own_select
SELECT	
public


exercises_own_update
UPDATE	
public

google_calendar_tokens

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own google_calendar_tokens
DELETE	
public


Users can insert own google_calendar_tokens
INSERT	
public


Users can update own google_calendar_tokens
UPDATE	
public


Users can view own google_calendar_tokens
SELECT	
public

gpa_scale_bands

Disable RLS

Create policy

Name	Command	Applied to	Actions

gpa_scale_bands_delete
DELETE	
public


gpa_scale_bands_insert
INSERT	
public


gpa_scale_bands_own_rows
ALL	
authenticated


gpa_scale_bands_select
SELECT	
public


gpa_scale_bands_update
UPDATE	
public

gpa_scales

Disable RLS

Create policy

Name	Command	Applied to	Actions

gpa_scales_delete
DELETE	
public


gpa_scales_insert
INSERT	
public


gpa_scales_own_rows
ALL	
authenticated


gpa_scales_select
SELECT	
public


gpa_scales_update
UPDATE	
public

grading_scales

Disable RLS

Create policy

Name	Command	Applied to	Actions

grading_scales_delete
DELETE	
public


grading_scales_insert
INSERT	
public


grading_scales_select
SELECT	
public


grading_scales_update
UPDATE	
public


Users can delete own grading_scales
DELETE	
public


Users can insert own grading_scales
INSERT	
public


Users can update own grading_scales
UPDATE	
public


Users can view own grading_scales
SELECT	
public

habits

Disable RLS

Create policy

Name	Command	Applied to	Actions

habits_own_delete
DELETE	
public


habits_own_insert
INSERT	
public


habits_own_select
SELECT	
public


habits_own_update
UPDATE	
public


Users can delete own habits
DELETE	
public


Users can insert own habits
INSERT	
public


Users can update own habits
UPDATE	
public


Users can view own habits
SELECT	
public

notes

Disable RLS

Create policy

Name	Command	Applied to	Actions

notes_delete
DELETE	
public


notes_insert
INSERT	
public


notes_select
SELECT	
public


notes_update
UPDATE	
public


Users can delete own notes
DELETE	
public


Users can insert own notes
INSERT	
public


Users can update own notes
UPDATE	
public


Users can view own notes
SELECT	
public

pr_entries

Disable RLS

Create policy

Name	Command	Applied to	Actions

pr_entries_own_delete
DELETE	
public


pr_entries_own_insert
INSERT	
public


pr_entries_own_select
SELECT	
public


pr_entries_own_update
UPDATE	
public

pr_history

Disable RLS

Create policy

Name	Command	Applied to	Actions

pr_history_own_delete
DELETE	
public


pr_history_own_insert
INSERT	
public


pr_history_own_select
SELECT	
public


pr_history_own_update
UPDATE	
public


Users can delete own pr_history
DELETE	
public


Users can insert own pr_history
INSERT	
public


Users can update own pr_history
UPDATE	
public


Users can view own pr_history
SELECT	
public

project_plan_items

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete their own plan items
DELETE	
public


Users can insert plan items for their own projects
INSERT	
public


Users can update their own plan items
UPDATE	
public


Users can view their own plan items
SELECT	
public

projects

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own projects
DELETE	
public


Users can insert own projects
INSERT	
public


Users can update own projects
UPDATE	
public


Users can view own projects
SELECT	
public

study_goals

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own study_goals
DELETE	
public


Users can insert own study_goals
INSERT	
public


Users can update own study_goals
UPDATE	
public


Users can view own study_goals
SELECT	
public

study_history

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own study_history
DELETE	
public


Users can insert own study_history
INSERT	
public


Users can update own study_history
UPDATE	
public


Users can view own study_history
SELECT	
public

study_sessions

Disable RLS

Create policy

Name	Command	Applied to	Actions

study_sessions_delete
DELETE	
public


study_sessions_insert
INSERT	
public


study_sessions_select
SELECT	
public


study_sessions_update
UPDATE	
public


Users can delete own study_sessions
DELETE	
public


Users can insert own study_sessions
INSERT	
public


Users can update own study_sessions
UPDATE	
public


Users can view own study_sessions
SELECT	
public

user_settings

Disable RLS

Create policy

Name	Command	Applied to	Actions

user_settings_delete
DELETE	
public


user_settings_insert
INSERT	
public


user_settings_select
SELECT	
public


user_settings_update
UPDATE	
public


Users can delete own settings
DELETE	
public


Users can insert own settings
INSERT	
public


Users can update own settings
UPDATE	
public


Users can view own settings
SELECT	
public

workout_completion_log

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own workout_completion_log
DELETE	
public


Users can insert own workout_completion_log
INSERT	
public


Users can update own workout_completion_log
UPDATE	
public


Users can view own workout_completion_log
SELECT	
public


workout_completion_log_own_delete
DELETE	
public


workout_completion_log_own_insert
INSERT	
public


workout_completion_log_own_select
SELECT	
public


workout_completion_log_own_update
UPDATE	
public

workout_exercises_log

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own workout_exercises_log
DELETE	
public


Users can insert own workout_exercises_log
INSERT	
public


Users can update own workout_exercises_log
UPDATE	
public


Users can view own workout_exercises_log
SELECT	
public


workout_exercises_log_own_delete
DELETE	
public


workout_exercises_log_own_insert
INSERT	
public


workout_exercises_log_own_select
SELECT	
public


workout_exercises_log_own_update
UPDATE	
public

workout_plan_sessions

Disable RLS

Create policy

Name	Command	Applied to	Actions

workout_plan_sessions_delete_own
DELETE	
public


workout_plan_sessions_insert_own
INSERT	
public


workout_plan_sessions_select_own
SELECT	
public


workout_plan_sessions_update_own
UPDATE	
public

workout_template_exercises

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own workout_template_days
DELETE	
public


Users can insert own workout_template_days
INSERT	
public


Users can update own workout_template_days
UPDATE	
public


Users can view own workout_template_days
SELECT	
public


workout_template_exercises_own_delete
DELETE	
public


workout_template_exercises_own_insert
INSERT	
public


workout_template_exercises_own_select
SELECT	
public


workout_template_exercises_own_update
UPDATE	
public

workout_templates

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete own workout_templates
DELETE	
public


Users can insert own workout_templates
INSERT	
public


Users can update own workout_templates
UPDATE	
public


Users can view own workout_templates
SELECT	
public


workout_templates_own_delete
DELETE	
public


workout_templates_own_insert
INSERT	
public


workout_templates_own_select
SELECT	
public


workout_templates_own_update
UPDATE	
public
