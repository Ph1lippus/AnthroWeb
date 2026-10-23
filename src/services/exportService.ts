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
            'log_date', 'wake_time', 'bedtime', 'sleep_duration', 'sleep_quality',
            'morning_mood', 'evening_mood', 'calories', 'protein', 'carbs', 'fat',
            'water', 'morning_systolic', 'morning_diastolic', 'morning_bpm',
            'evening_systolic', 'evening_diastolic', 'evening_bpm', 'body_temperature',
            'daily_score', 'morning_routine', 'evening_routine', 'fruit_serving',
            'studied', 'journal', 'stretching', 'reading', 'no_sleep', 'gym',
            'cheat_day', 'project_work_done',
        ],
    },
    { table: 'daily_habit_logs', dateColumn: 'log_date', columns: ['log_date', 'habit_id', 'completed'] },
    { table: 'habits', columns: ['id', 'name', 'is_active'] },
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
        columns: ['workout_date', 'completed', 'intensity', 'duration_minutes', 'notes'],
    },
    {
        table: 'workout_exercises_log',
        columns: [
            'exercise_name', 'activity_type', 'reps', 'weight', 'sets_detail',
            'duration_minutes', 'distance_km', 'completed', 'planned', 'notes',
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
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
};

const inWindow = (value: unknown, cutoff: string | null): boolean => {
    if (cutoff === null) return true;
    if (value === null || value === undefined) return true;
    const str = String(value).slice(0, 10);
    return str >= cutoff;
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
    const result: Record<string, unknown> = {
        _meta: {
            exportedAt: new Date().toISOString(),
            rangeDays: days,
            failedTables: [] as string[],
        },
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

    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`anthroweb-export-${date}.json`, JSON.stringify(result), 'application/json');
}

export { downloadTextFile };
