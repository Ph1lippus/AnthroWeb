-- ============================================================
-- ANTHROWEB + PROTOMO DATABASE (Final with user_id on all tables)
-- ============================================================

-- ============================================================
-- TABLES WITHOUT DEPENDENCIES (Created First)
-- ============================================================

-- 1.1 Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    started_at DATE,
    deadline DATE,
    completed_at DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.2 Habits
CREATE TABLE IF NOT EXISTS habits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_habit UNIQUE (user_id, name)
);

-- 1.3 Custom Measurements
CREATE TABLE IF NOT EXISTS custom_measurements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_custom_measurement UNIQUE (user_id, name)
);

-- 1.4 Workout Templates
CREATE TABLE IF NOT EXISTS workout_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.5 Academic Semesters
CREATE TABLE IF NOT EXISTS academic_semesters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    year INTEGER NOT NULL,
    semester INTEGER CHECK (semester >= 1 AND semester <= 3),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.6 Grading Scales
CREATE TABLE IF NOT EXISTS grading_scales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    max_score REAL,
    passing_score REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLES WITH DEPENDENCIES
-- ============================================================

-- 1.7 Daily Logs
CREATE TABLE IF NOT EXISTS daily_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Sleep
    wake_time TIME,
    bedtime TIME,
    sleep_duration INTEGER,
    
    -- Blood pressure, heart rate, temperature
    morning_systolic INTEGER,
    morning_diastolic INTEGER,
    morning_bpm INTEGER,
    evening_systolic INTEGER,
    evening_diastolic INTEGER,
    evening_bpm INTEGER,
    body_temperature REAL,
    
    -- Nutrition
    calories INTEGER,
    protein INTEGER,
    carbs INTEGER,
    fat INTEGER,
    water INTEGER,
    
    -- Project work
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    project_work_done BOOLEAN DEFAULT FALSE,
    
    -- Scoring
    daily_score REAL,
    
    -- Journal
    mood INTEGER CHECK (mood >= 1 AND mood <= 10),
    journal_entry TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_date UNIQUE (user_id, log_date)
);

-- 1.8 Daily Habit Logs
CREATE TABLE IF NOT EXISTS daily_habit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_habit_date UNIQUE (user_id, habit_id, log_date)
);

-- 1.9 Custom Measurement Logs
CREATE TABLE IF NOT EXISTS custom_measurement_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    measurement_id UUID NOT NULL REFERENCES custom_measurements(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    value REAL NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_measurement_date UNIQUE (user_id, measurement_id, log_date)
);

-- 1.10 Workout Template Days (now has user_id)
CREATE TABLE IF NOT EXISTS workout_template_days (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workout_template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    exercise_name TEXT NOT NULL,
    target_sets INTEGER,
    target_reps INTEGER,
    target_weight REAL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_template_day UNIQUE (workout_template_id, day_of_week)
);

-- 1.11 Workout Completion Log
CREATE TABLE IF NOT EXISTS workout_completion_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workout_date DATE NOT NULL DEFAULT CURRENT_DATE,
    workout_template_id UUID REFERENCES workout_templates(id) ON DELETE SET NULL,
    day_of_week INTEGER,
    completed BOOLEAN DEFAULT FALSE,
    intensity INTEGER CHECK (intensity >= 1 AND intensity <= 10),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_workout_date UNIQUE (user_id, workout_date)
);

-- 1.12 Workout Exercises Log (now has user_id)
CREATE TABLE IF NOT EXISTS workout_exercises_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workout_completion_id UUID NOT NULL REFERENCES workout_completion_log(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    sets INTEGER,
    reps INTEGER,
    weight REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.13 PR History (now has user_id)
CREATE TABLE IF NOT EXISTS pr_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    weight REAL,
    reps INTEGER,
    workout_date DATE NOT NULL,
    workout_completion_id UUID REFERENCES workout_completion_log(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.14 Weekly Body Measurements
CREATE TABLE IF NOT EXISTS weekly_measurements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    measure_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Basic
    age INTEGER,
    weight REAL,
    visceral_level INTEGER,
    body_fat REAL,
    
    -- Girth measurements (cm)
    wrist_left REAL,
    wrist_right REAL,
    neck REAL,
    shoulders REAL,
    chest REAL,
    forearm_left_relaxed REAL,
    forearm_left_flexed REAL,
    forearm_right_relaxed REAL,
    forearm_right_flexed REAL,
    bicep_left_relaxed REAL,
    bicep_left_flexed REAL,
    bicep_right_relaxed REAL,
    bicep_right_flexed REAL,
    waist REAL,
    hips REAL,
    thigh_left REAL,
    thigh_right REAL,
    calf_left REAL,
    calf_right REAL,
    
    -- Computed values
    waist_hip_ratio REAL,
    waist_height_ratio REAL,
    shoulder_waist_ratio REAL,
    shoulder_chest_ratio REAL,
    shoulder_hip_ratio REAL,
    thigh_calf_ratio REAL,
    bicep_ratio REAL,
    bicep_flexing_symmetry REAL,
    forearm_symmetry REAL,
    lean_body_mass REAL,
    fat_mass REAL,
    bmr REAL,
    ffmi REAL,
    adonis_index REAL,
    torso_taper REAL,
    leg_torso_ratio REAL,
    metabolic_age INTEGER,
    muscle_quality REAL,
    dynamic_strength REAL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_week UNIQUE (user_id, measure_date)
);

-- 1.15 Books
CREATE TABLE IF NOT EXISTS books (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    total_pages INTEGER NOT NULL DEFAULT 0,
    current_page INTEGER DEFAULT 0,
    progress REAL DEFAULT 0,
    status TEXT DEFAULT 'reading' CHECK (status IN ('reading', 'completed', 'dropped')),
    notes TEXT,
    started_at DATE,
    completed_at DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.16 Academic Grades
CREATE TABLE IF NOT EXISTS academic_grades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    semester_id UUID REFERENCES academic_semesters(id) ON DELETE CASCADE,
    grading_scale_id UUID REFERENCES grading_scales(id) ON DELETE SET NULL,
    course_name TEXT NOT NULL,
    grade REAL,
    weight REAL DEFAULT 1.0,
    attendance_grade REAL,
    attendance_weight REAL DEFAULT 0.0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.17 Academic Goals
CREATE TABLE IF NOT EXISTS academic_goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    semester_id UUID REFERENCES academic_semesters(id) ON DELETE CASCADE,
    course_name TEXT NOT NULL,
    target_grade REAL NOT NULL,
    current_grade REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_course_goal UNIQUE (user_id, semester_id, course_name)
);

-- 1.18 Academic Assessments
CREATE TABLE IF NOT EXISTS academic_assessments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    course_name TEXT NOT NULL,
    semester_id UUID REFERENCES academic_semesters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    grade REAL,
    weight REAL NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- SECTION 2: PROTOMO TABLES
-- ============================================================

-- 2.1 Study Sessions
CREATE TABLE IF NOT EXISTS study_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    duration_minutes INTEGER NOT NULL,
    session_type TEXT DEFAULT 'study' CHECK (session_type IN ('study', 'break')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.2 Study History
CREATE TABLE IF NOT EXISTS study_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    history_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_study_minutes INTEGER DEFAULT 0,
    total_break_minutes INTEGER DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    average_session_length REAL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_history_date UNIQUE (user_id, history_date)
);

-- 2.3 Study Goals
CREATE TABLE IF NOT EXISTS study_goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    daily_goal_minutes INTEGER DEFAULT 60,
    weekly_goal_minutes INTEGER DEFAULT 300,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_goal UNIQUE (user_id)
);

-- 2.4 Google Calendar Integration
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_calendar UNIQUE (user_id)
);

-- 2.5 Calendar Events
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    google_event_id TEXT,
    title TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_study_block BOOLEAN DEFAULT FALSE,
    synced BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- SECTION 3: INDEXES
-- ============================================================

CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, log_date);
CREATE INDEX idx_habits_user_id ON habits(user_id);
CREATE INDEX idx_daily_habit_logs_user_date ON daily_habit_logs(user_id, log_date);
CREATE INDEX idx_weekly_measurements_user_date ON weekly_measurements(user_id, measure_date);
CREATE INDEX idx_custom_measurements_user_id ON custom_measurements(user_id);
CREATE INDEX idx_custom_measurement_logs_user_date ON custom_measurement_logs(user_id, log_date);
CREATE INDEX idx_books_user_id ON books(user_id);
CREATE INDEX idx_workout_templates_user_id ON workout_templates(user_id);
CREATE INDEX idx_workout_template_days_template ON workout_template_days(workout_template_id);
CREATE INDEX idx_workout_completion_user_date ON workout_completion_log(user_id, workout_date);
CREATE INDEX idx_pr_history_user_exercise ON pr_history(user_id, exercise_name);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_academic_semesters_user_id ON academic_semesters(user_id);
CREATE INDEX idx_academic_grades_user_id ON academic_grades(user_id);
CREATE INDEX idx_academic_goals_user_id ON academic_goals(user_id);
CREATE INDEX idx_academic_assessments_user_course ON academic_assessments(user_id, course_name);
CREATE INDEX idx_study_sessions_user_date ON study_sessions(user_id, session_date);
CREATE INDEX idx_study_history_user_date ON study_history(user_id, history_date);
CREATE INDEX idx_calendar_events_user_start ON calendar_events(user_id, start_time);

-- ============================================================
-- SECTION 4: ROW LEVEL SECURITY (RLS) – Now all tables have user_id
-- ============================================================

DO $$ 
DECLARE 
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT unnest(ARRAY[
            'daily_logs',
            'habits',
            'daily_habit_logs',
            'weekly_measurements',
            'custom_measurements',
            'custom_measurement_logs',
            'books',
            'workout_templates',
            'workout_template_days',
            'workout_completion_log',
            'workout_exercises_log',
            'pr_history',
            'projects',
            'academic_semesters',
            'grading_scales',
            'academic_grades',
            'academic_goals',
            'academic_assessments',
            'study_sessions',
            'study_history',
            'study_goals',
            'google_calendar_tokens',
            'calendar_events'
        ])
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('CREATE POLICY "Users can view own %I" ON %I FOR SELECT USING (auth.uid() = user_id)', tbl, tbl);
        EXECUTE format('CREATE POLICY "Users can insert own %I" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)', tbl, tbl);
        EXECUTE format('CREATE POLICY "Users can update own %I" ON %I FOR UPDATE USING (auth.uid() = user_id)', tbl, tbl);
        EXECUTE format('CREATE POLICY "Users can delete own %I" ON %I FOR DELETE USING (auth.uid() = user_id)', tbl, tbl);
    END LOOP;
END;
$$;

-- ============================================================
-- SECTION 5: TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
DECLARE 
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT unnest(ARRAY[
            'daily_logs',
            'habits',
            'daily_habit_logs',
            'weekly_measurements',
            'custom_measurements',
            'custom_measurement_logs',
            'books',
            'workout_templates',
            'workout_completion_log',
            'projects',
            'academic_semesters',
            'academic_grades',
            'academic_goals',
            'academic_assessments',
            'study_sessions',
            'study_history',
            'study_goals',
            'google_calendar_tokens',
            'calendar_events'
        ])
    LOOP
        EXECUTE format('CREATE TRIGGER update_%I_updated_at 
            BEFORE UPDATE ON %I 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at()', tbl, tbl);
    END LOOP;
END;
$$;

-- ============================================================
-- SECTION 6: STUDY HISTORY TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_study_history()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO study_history (user_id, history_date, total_study_minutes, total_break_minutes, session_count)
    VALUES (
        NEW.user_id,
        NEW.session_date,
        CASE WHEN NEW.session_type = 'study' THEN NEW.duration_minutes ELSE 0 END,
        CASE WHEN NEW.session_type = 'break' THEN NEW.duration_minutes ELSE 0 END,
        1
    )
    ON CONFLICT (user_id, history_date)
    DO UPDATE SET
        total_study_minutes = study_history.total_study_minutes + EXCLUDED.total_study_minutes,
        total_break_minutes = study_history.total_break_minutes + EXCLUDED.total_break_minutes,
        session_count = study_history.session_count + 1,
        average_session_length = (study_history.total_study_minutes + EXCLUDED.total_study_minutes) / (study_history.session_count + 1);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_study_session_insert
AFTER INSERT ON study_sessions
FOR EACH ROW
EXECUTE FUNCTION update_study_history();

-- ============================================================
-- SECTION 7: MINIMUM GRADE FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_minimum_required_grade(
    p_user_id UUID,
    p_semester_id UUID,
    p_course_name TEXT
)
RETURNS TABLE (
    assessment_name TEXT,
    current_grade REAL,
    weight REAL,
    minimum_required REAL
) AS $$
DECLARE
    v_target_grade REAL;
    v_current_total REAL := 0;
    v_current_weight REAL := 0;
    v_remaining_weight REAL := 0;
    v_assessment RECORD;
BEGIN
    SELECT target_grade INTO v_target_grade
    FROM academic_goals
    WHERE user_id = p_user_id
        AND semester_id = p_semester_id
        AND course_name = p_course_name;

    IF v_target_grade IS NULL THEN
        RETURN;
    END IF;

    FOR v_assessment IN 
        SELECT name, grade, weight, is_completed
        FROM academic_assessments
        WHERE user_id = p_user_id
            AND semester_id = p_semester_id
            AND course_name = p_course_name
    LOOP
        IF v_assessment.is_completed AND v_assessment.grade IS NOT NULL THEN
            v_current_total := v_current_total + (v_assessment.grade * v_assessment.weight);
            v_current_weight := v_current_weight + v_assessment.weight;
        ELSE
            v_remaining_weight := v_remaining_weight + v_assessment.weight;
        END IF;
    END LOOP;

    RETURN QUERY
    SELECT 
        a.name AS assessment_name,
        a.grade AS current_grade,
        a.weight AS weight,
        CASE 
            WHEN a.is_completed = FALSE AND v_remaining_weight > 0 THEN
                ((v_target_grade * (v_current_weight + v_remaining_weight)) - v_current_total) / v_remaining_weight
            ELSE NULL
        END AS minimum_required
    FROM academic_assessments a
    WHERE a.user_id = p_user_id
        AND a.semester_id = p_semester_id
        AND a.course_name = p_course_name
        AND a.is_completed = FALSE;
END;
$$ LANGUAGE plpgsql;