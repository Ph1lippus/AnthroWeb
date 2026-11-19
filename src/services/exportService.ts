import { supabase, getCurrentUserId } from './supabaseClient';
import { isVaultOpen } from './vault/keyring';
import { getUserDailyLogs } from './dailyLogService';
import { downloadTextFile } from '../utils/exportFiles';

export type ExportRangeDays = 7 | 14 | 30 | 90 | null;

interface TableExportConfig {
    table: string;
    dateColumn?: string;
    columns?: string[];
    redact?: string[];
    skip?: boolean;
}

const TABLES: TableExportConfig[] = [
    {
        table: 'daily_logs',
        dateColumn: 'log_date',
        columns: [
            'log_date', 'wake_time', 'bedtime', 'sleep_duration', 'morning_feel',
            'morning_mood', 'midday_mood', 'evening_mood', 'calories', 'protein', 'carbs', 'fat',
            'water', 'morning_systolic', 'morning_diastolic', 'morning_bpm',
            'evening_systolic', 'evening_diastolic', 'evening_bpm', 'body_temperature',
            'daily_score', 'morning_routine', 'evening_routine', 'fruit_serving',
            'studied', 'journal', 'stretching', 'reading', 'no_sleep', 'gym',
            'cardio', 'mobility', 'steps', 'phone_usage',
            'cheat_day', 'project_work_done',
        ],
    },
    { table: 'daily_habit_logs', dateColumn: 'log_date', columns: ['log_date', 'habit_id', 'completed'] },
    { table: 'habits', columns: ['id', 'name', 'description', 'is_active'] },
    {
        table: 'body_measurements',
        dateColumn: 'measure_date',
        columns: [
            'measure_date', 'weight', 'body_fat', 'body_fat_method', 'waist', 'hips',
            'neck', 'shoulders', 'chest', 'bicep_left_flexed', 'thigh_left',
            'calf_left', 'waist_hip_ratio', 'ffmi', 'bmr',
        ],
    },
    {
        table: 'workout_completion_log',
        dateColumn: 'workout_date',
        columns: [
            'id', 'workout_date', 'name', 'completed', 'intensity', 'duration_minutes',
            'distance_km', 'calories', 'avg_hr', 'max_hr', 'machine', 'start_time',
            'body_weight', 'notes',
        ],
    },
    {
        table: 'workout_exercises_log',
        columns: [
            'workout_completion_id', 'exercise_name', 'activity_type', 'position', 'reps',
            'weight', 'body_weight', 'sets_detail', 'duration_minutes', 'distance_km',
            'machine_level', 'machine_incline', 'machine_speed', 'hr_max', 'hr_1_min',
            'hr_2_min', 'calories', 'avg_hr', 'avg_watts', 'max_watts', 'cardio_segments',
            'completed', 'planned', 'notes',
        ],
    },
    {
        table: 'study_sessions',
        dateColumn: 'session_date',
        columns: [
            'session_date', 'duration_minutes', 'session_type', 'mode', 'started_at',
            'ended_at', 'planned_minutes', 'break_minutes', 'notes',
        ],
    },
    {
        table: 'study_history',
        dateColumn: 'history_date',
        columns: [
            'history_date', 'total_study_minutes', 'total_break_minutes',
            'session_count', 'average_session_length',
        ],
    },
    { table: 'abstinence_goals', dateColumn: 'start_date', columns: ['name', 'start_date', 'end_date', 'target_days', 'notes'] },
    { table: 'abstinence_history', dateColumn: 'start_date', columns: ['name', 'start_date', 'end_date', 'duration_days', 'notes'] },
    // Books and projects are intentionally excluded from the AI analysis export.
    { table: 'custom_measurement_logs', dateColumn: 'log_date', columns: ['measurement_id', 'log_date', 'value'] },
    { table: 'custom_measurements', columns: ['id', 'name', 'unit'] },
    {
        table: 'academic_grades',
        columns: ['course_name', 'grade', 'weight', 'attendance_grade', 'attendance_weight', 'notes'],
    },
    {
        table: 'academic_assessments',
        columns: ['course_name', 'name', 'grade', 'weight', 'is_completed', 'due_date'],
    },
    // Never export secrets or private journal content.
    { table: 'google_calendar_tokens', skip: true },
    { table: 'notes', skip: true },
    { table: 'user_settings', skip: true },
];

const TABLES_BY_NAME = new Map(TABLES.map(t => [t.table, t]));

const hasUserId = (table: string): boolean => table !== 'gpa_scale_bands';

/**
 * Local calendar date as YYYY-MM-DD, avoiding the UTC shift that
 * toISOString() introduces for users behind UTC.
 */
const localDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const projectRow = (table: string, row: Record<string, unknown>): Record<string, unknown> => {
    const cfg = TABLES_BY_NAME.get(table);
    const allowed = cfg?.columns ? new Set(cfg.columns) : null;
    const redact = new Set(cfg?.redact ?? []);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        if (value === null || value === undefined) continue;
        if (key === 'user_id' || key === 'vault') continue;
        if (redact.has(key)) continue;
        if (allowed && !allowed.has(key)) continue;
        out[key] = value;
    }
    return out;
};

const cutoffFor = (days: ExportRangeDays): string | null => {
    if (days === null) return null;
    const d = new Date();
    // "N days" means N calendar days including today.
    d.setDate(d.getDate() - (days - 1));
    return localDateStr(d);
};

const inWindow = (value: unknown, cutoff: string | null): boolean => {
    if (cutoff === null) return true;
    if (value === null || value === undefined) return true;
    const str = String(value).slice(0, 10);
    return str >= cutoff;
};

// ---------------------------------------------------------------------------
// Self-describing schema so any consumer (human or AI) understands the export
// without external documentation. In particular, the daily-log activity habits
// (gym / cardio / mobility) are day-level booleans that are *separate* from the
// detailed workout session tables.
// ---------------------------------------------------------------------------
const ACTIVITY_HABIT_DESC =
    'Boolean day-level "activity habit". True when the user did this kind of ' +
    'session that day. This is a simple yes/no for the whole day and is separate ' +
    'from the detailed workout rows in workout_completion_log / ' +
    'workout_exercises_log, which describe what was actually done.';

const EXPORT_SCHEMA = {
    overview:
        'AnthroWeb personal tracking export. Top-level keys are table names; each ' +
        'holds an array of rows. _meta holds export metadata. _schema (this object) ' +
        'documents every table and column, including units and semantics. ' +
        'Date-based tables are filtered to the requested range; reference/config ' +
        'tables are always included in full. Books and projects are intentionally ' +
        'excluded. Private journal text and secrets are never exported.',
    range: {
        rangeDays:
            'Requested lookback in days (7, 14, 30 or 90) or null for "all time".',
        dateFiltering:
            'For tables with a date column, only rows whose date is >= ' +
            '(export date - (rangeDays - 1) days) are included, so "7 days" means ' +
            'exactly the last 7 calendar days including today. Rows with a null date ' +
            'are retained. Tables without a date column are always fully exported.',
    },
    units: {
        sleep_duration: 'hours',
        water: 'millilitres (ml)',
        phone_usage: 'minutes',
        steps: 'count',
        weight: 'kilograms (kg)',
        body_fat: 'percent',
        body_temperature: 'degrees Celsius',
        blood_pressure: 'mmHg',
        heart_rate: 'beats per minute (bpm)',
        distance_km: 'kilometres',
        duration_minutes: 'minutes',
        calories: 'kilocalories (kcal)',
        protein: 'grams (g)',
        carbs: 'grams (g)',
        fat: 'grams (g)',
        waist_hip_ratio: 'ratio',
        ffmi: 'fat-free mass index',
        bmr: 'kilocalories (kcal)',
        mood: 'integer rating 1-10',
        morning_feel: 'integer rating 0-10',
        daily_score: 'integer score 0-100',
        intensity: 'integer rating 1-10',
    },
    tables: {
        daily_logs: {
            description:
                'One row per calendar day. Combines sleep, vitals, nutrition, habits, ' +
                'activity and the computed daily score.',
            columns: {
                log_date: 'ISO date (YYYY-MM-DD) of the day.',
                wake_time: 'Wake time (HH:MM, local).',
                bedtime: 'Bedtime (HH:MM, local).',
                sleep_duration: 'Sleep duration in hours.',
                morning_feel: 'Subjective morning feel rating, 0-10.',
                morning_mood: 'Morning mood rating, 1-10.',
                midday_mood: 'Midday mood rating, 1-10.',
                evening_mood: 'Evening mood rating, 1-10.',
                calories: 'Calories consumed (kcal).',
                protein: 'Protein (g).',
                carbs: 'Carbohydrates (g).',
                fat: 'Fat (g).',
                water: 'Water intake (ml).',
                morning_systolic: 'Morning systolic blood pressure (mmHg).',
                morning_diastolic: 'Morning diastolic blood pressure (mmHg).',
                morning_bpm: 'Morning heart rate (bpm).',
                evening_systolic: 'Evening systolic blood pressure (mmHg).',
                evening_diastolic: 'Evening diastolic blood pressure (mmHg).',
                evening_bpm: 'Evening heart rate (bpm).',
                body_temperature: 'Body temperature (°C).',
                daily_score: 'Computed daily score, 0-100.',
                morning_routine: 'Boolean habit: completed morning routine.',
                evening_routine: 'Boolean habit: completed evening routine.',
                fruit_serving: 'Boolean habit: had a fruit serving.',
                studied: 'Boolean habit: studied.',
                journal: 'Boolean habit: journaled.',
                stretching: 'Boolean habit: stretched.',
                reading: 'Boolean habit: read.',
                no_sleep: 'Boolean: had no sleep that night.',
                gym: ACTIVITY_HABIT_DESC + ' "gym" = a gym/strength-training session.',
                cardio: ACTIVITY_HABIT_DESC + ' "cardio" = a cardio session.',
                mobility: ACTIVITY_HABIT_DESC + ' "mobility" = a mobility/flexibility session.',
                steps: 'Integer. Total steps walked during the whole day, including days without a logged workout.',
                phone_usage: 'Integer minutes of phone screen time that day.',
                cheat_day: 'Boolean: day off the food plan (macros stored as typed but excluded from the score).',
                project_work_done: 'Boolean: worked on a project that day.',
            },
        },
        daily_habit_logs: {
            description: 'Per-habit completion records for custom habits.',
            columns: {
                log_date: 'ISO date (YYYY-MM-DD).',
                habit_id: 'Foreign key to habits.id.',
                completed: 'Boolean: habit completed that day.',
            },
        },
        habits: {
            description: 'Habit definitions.',
            columns: {
                id: 'Habit id.',
                name: 'Habit name.',
                description: 'Optional habit description.',
                is_active: 'Boolean: habit is active.',
            },
        },
        body_measurements: {
            description: 'Periodic body measurements (usually weekly).',
            columns: {
                measure_date: 'ISO date (YYYY-MM-DD).',
                weight: 'Body weight (kg).',
                body_fat: 'Body fat percentage.',
                body_fat_method: 'Method used to estimate body fat (scale/calipers/navy/manual).',
                waist: 'Waist circumference (cm).',
                hips: 'Hip circumference (cm).',
                neck: 'Neck circumference (cm).',
                shoulders: 'Shoulder circumference (cm).',
                chest: 'Chest circumference (cm).',
                bicep_left_flexed: 'Left bicep (flexed) circumference (cm).',
                thigh_left: 'Left thigh circumference (cm).',
                calf_left: 'Left calf circumference (cm).',
                waist_hip_ratio: 'Waist-to-hip ratio.',
                ffmi: 'Fat-free mass index.',
                bmr: 'Basal metabolic rate (kcal).',
            },
        },
        workout_completion_log: {
            description:
                'One row per completed workout session. Multiple sessions per day are allowed.',
            columns: {
                id: 'Workout session id (join key for workout_exercises_log.workout_completion_id).',
                workout_date: 'ISO date (YYYY-MM-DD) of the session.',
                name: 'Session name/title.',
                completed: 'Boolean: session completed.',
                intensity: 'Subjective intensity rating, 1-10.',
                duration_minutes: 'Session duration (minutes).',
                distance_km: 'Distance covered (km), for cardio sessions.',
                calories: 'Calories burned estimate (kcal).',
                avg_hr: 'Average heart rate (bpm).',
                max_hr: 'Maximum heart rate (bpm).',
                machine: 'Machine used (cardio).',
                start_time: 'Session start time (HH:MM).',
                body_weight: 'Body weight snapshot (kg) when the session was saved.',
                notes: 'Free-text notes.',
            },
        },
        workout_exercises_log: {
            description: 'Exercises performed within a workout session.',
            columns: {
                workout_completion_id: 'Foreign key to workout_completion_log.id.',
                exercise_name: 'Exercise name.',
                activity_type: 'Exercise type: strength, cardio or mobility.',
                position: 'Order of the exercise within the session.',
                reps: 'Repetitions (strength).',
                weight: 'Weight used (kg).',
                body_weight: 'Body weight snapshot (kg).',
                sets_detail: 'JSON: per-set reps/weight details.',
                duration_minutes: 'Duration (minutes), for cardio/mobility.',
                distance_km: 'Distance (km), for cardio.',
                machine_level: 'Machine resistance/program level (cardio).',
                machine_incline: 'Machine incline (cardio).',
                machine_speed: 'Machine speed (cardio).',
                hr_max: 'Maximum heart rate during this exercise (bpm).',
                hr_1_min: 'Heart rate 1 minute after (bpm).',
                hr_2_min: 'Heart rate 2 minutes after (bpm).',
                calories: 'Calories burned for this exercise (kcal).',
                avg_hr: 'Average heart rate (bpm).',
                avg_watts: 'Average power (watts).',
                max_watts: 'Maximum power (watts).',
                cardio_segments: 'JSON: cardio interval segments.',
                completed: 'Boolean: exercise completed.',
                planned: 'Boolean: exercise was part of the plan.',
                notes: 'Free-text notes.',
            },
        },
        study_sessions: {
            description: 'Study/break sessions.',
            columns: {
                session_date: 'ISO date (YYYY-MM-DD).',
                duration_minutes: 'Session duration (minutes).',
                session_type: 'study or break.',
                mode: 'countdown, stopwatch or interval.',
                started_at: 'Start timestamp (ISO).',
                ended_at: 'End timestamp (ISO).',
                planned_minutes: 'Planned duration (minutes).',
                break_minutes: 'Break time (minutes).',
                notes: 'Free-text notes.',
            },
        },
        study_history: {
            description: 'Daily aggregated study statistics.',
            columns: {
                history_date: 'ISO date (YYYY-MM-DD).',
                total_study_minutes: 'Total study minutes that day.',
                total_break_minutes: 'Total break minutes that day.',
                session_count: 'Number of sessions.',
                average_session_length: 'Average session length (minutes).',
            },
        },
        abstinence_goals: {
            description: 'Abstinence goals (tracked streaks).',
            columns: {
                name: 'Goal name.',
                start_date: 'Start date (ISO).',
                end_date: 'End date (ISO), if set.',
                target_days: 'Target number of days.',
                notes: 'Free-text notes.',
            },
        },
        abstinence_history: {
            description: 'Completed abstinence streaks.',
            columns: {
                name: 'Goal name.',
                start_date: 'Start date (ISO).',
                end_date: 'End date (ISO).',
                duration_days: 'Duration (days).',
                notes: 'Free-text notes.',
            },
        },
        custom_measurement_logs: {
            description: 'Values for user-defined custom measurements.',
            columns: {
                measurement_id: 'Foreign key to custom_measurements.id.',
                log_date: 'ISO date (YYYY-MM-DD).',
                value: 'Measured value.',
            },
        },
        custom_measurements: {
            description: 'User-defined measurement definitions.',
            columns: {
                id: 'Measurement id.',
                name: 'Measurement name.',
                unit: 'Unit of measurement.',
            },
        },
        academic_grades: {
            description: 'Course-level grades.',
            columns: {
                course_name: 'Course name.',
                grade: 'Grade value.',
                weight: 'Weight of the grade.',
                attendance_grade: 'Attendance grade.',
                attendance_weight: 'Weight of attendance.',
                notes: 'Free-text notes.',
            },
        },
        academic_assessments: {
            description: 'Assessments (exams, quizzes, etc.) per course.',
            columns: {
                course_name: 'Course name.',
                name: 'Assessment name.',
                grade: 'Grade value.',
                weight: 'Weight of the assessment.',
                is_completed: 'Boolean: completed.',
                due_date: 'Due date (ISO).',
            },
        },
    },
    enums: {
        activity_type: {
            strength: 'Strength/resistance training.',
            cardio: 'Cardiovascular exercise.',
            mobility: 'Mobility/flexibility work.',
        },
        body_fat_method: {
            scale: 'Scale estimate.',
            calipers: 'Caliper measurement.',
            navy: 'US Navy formula.',
            manual: 'Manual entry.',
        },
        mood_scale: 'Integer 1-10 (higher = better).',
        morning_feel_scale: 'Integer 0-10 (higher = better).',
    },
};

export interface ExportProgress {
    done: number;
    total: number;
    current: string;
}

export async function exportAllData(
    days: ExportRangeDays,
    onProgress?: (p: ExportProgress) => void,
): Promise<void> {
    if (![7, 14, 30, 90, null].includes(days)) {
        throw new Error('Invalid export range.');
    }

    const userId = await getCurrentUserId();
    if (!userId) throw new Error('You must be signed in to export data.');

    if (!isVaultOpen()) {
        const { data } = await supabase
            .from('daily_logs')
            .select('id')
            .eq('user_id', userId)
            .not('vault', 'is', null)
            .limit(1);
        if (data && data.length > 0) {
            throw new Error('Your vault is locked. Unlock it first, then export.');
        }
    }

    const cutoff = cutoffFor(days);
    const activeTables = TABLES.filter(t => !t.skip);

    // Precompute the set of workout session ids inside the requested window so
    // the child table (workout_exercises_log) can be filtered without per-row
    // queries or worker races.
    let inRangeWorkoutIds: Set<string> | null = null;
    if (cutoff) {
        const { data, error } = await supabase
            .from('workout_completion_log')
            .select('id')
            .eq('user_id', userId)
            .gte('workout_date', cutoff);
        if (error) throw error;
        inRangeWorkoutIds = new Set((data ?? []).map((r: { id: string }) => r.id));
    }

    const result: Record<string, unknown> = {
        _meta: {
            exportedAt: new Date().toISOString(),
            rangeDays: days,
            failedTables: [] as string[],
        },
        _schema: EXPORT_SCHEMA,
    };
    const failed: string[] = [];

    let done = 0;
    const total = activeTables.length;

    const concurrency = 6;
    const queue = [...activeTables];
    const runOne = async (cfg: TableExportConfig): Promise<void> => {
        try {
            onProgress?.({ done, total, current: cfg.table });
            let rows: Record<string, unknown>[] = [];

            if (cfg.table === 'daily_logs') {
                rows = (await getUserDailyLogs()) as unknown as Record<string, unknown>[];
            } else {
                let query = supabase.from(cfg.table).select('*');
                if (hasUserId(cfg.table)) query = query.eq('user_id', userId);
                const { data, error } = await query;
                if (error) throw error;
                rows = (data ?? []) as Record<string, unknown>[];
            }

            if (cfg.table === 'workout_exercises_log' && inRangeWorkoutIds) {
                rows = rows.filter(r => inRangeWorkoutIds!.has(String(r.workout_completion_id)));
            }

            if (cfg.dateColumn && cutoff) {
                rows = rows.filter(r => inWindow(r[cfg.dateColumn!], cutoff));
            }

            result[cfg.table] = rows.map(r => projectRow(cfg.table, r));
        } catch (err) {
            failed.push(cfg.table);
            console.error(`Export failed for ${cfg.table}:`, err);
        } finally {
            done += 1;
            onProgress?.({ done, total, current: cfg.table });
        }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push((async () => {
            while (queue.length > 0) {
                const cfg = queue.shift();
                if (!cfg) return;
                await runOne(cfg);
            }
        })());
    }
    await Promise.all(workers);

    (result._meta as { failedTables: string[] }).failedTables = failed;

    const date = localDateStr(new Date());
    downloadTextFile(`anthroweb-export-${date}.json`, JSON.stringify(result, null, 2), 'application/json');
}

export { downloadTextFile };