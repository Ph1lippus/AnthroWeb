-- Extend study sessions for timer capture and analysis.
--
-- `run_key` is the idempotency token: a timer run generates one when it starts,
-- and the unique partial index below means a reload that re-observes a finished
-- run cannot insert a second row for it. `mode`/`source` record where the row
-- came from so manual entries and timer runs stay distinguishable in analytics.
ALTER TABLE public.study_sessions
  ADD COLUMN IF NOT EXISTS mode text
    CHECK (mode IS NULL OR mode = ANY (ARRAY['countdown'::text, 'stopwatch'::text, 'interval'::text])),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source = ANY (ARRAY['timer'::text, 'manual'::text])),
  ADD COLUMN IF NOT EXISTS run_key text,
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ended_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS planned_minutes integer,
  ADD COLUMN IF NOT EXISTS break_minutes integer;

CREATE UNIQUE INDEX IF NOT EXISTS study_sessions_user_run_key_idx
  ON public.study_sessions (user_id, run_key)
  WHERE run_key IS NOT NULL;

-- One row per user for study goals (daily/weekly targets).
CREATE TABLE IF NOT EXISTS public.study_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  daily_goal_minutes integer NOT NULL DEFAULT 60,
  weekly_goal_minutes integer NOT NULL DEFAULT 300,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT study_goals_pkey PRIMARY KEY (id),
  CONSTRAINT study_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

ALTER TABLE public.study_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own study goals" ON public.study_goals;
CREATE POLICY "Users can manage their own study goals"
  ON public.study_goals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Daily aggregates for tracking/analysis.
CREATE TABLE IF NOT EXISTS public.study_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  history_date date NOT NULL DEFAULT CURRENT_DATE,
  total_study_minutes integer NOT NULL DEFAULT 0,
  total_break_minutes integer NOT NULL DEFAULT 0,
  session_count integer NOT NULL DEFAULT 0,
  average_session_length real NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT study_history_pkey PRIMARY KEY (id),
  CONSTRAINT study_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT unique_user_history_date UNIQUE (user_id, history_date)
);

ALTER TABLE public.study_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own study history" ON public.study_history;
CREATE POLICY "Users can manage their own study history"
  ON public.study_history
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);