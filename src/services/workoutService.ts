import { supabase, getCurrentUserId } from './supabaseClient';
import { todayString } from '../utils/dates';
import {
    parseSetDetail,
    rowsToDetail,
    detailToRows,
    detailVolumeKg,
    isActivityType,
    type ActivityType,
    type WorkoutSet,
} from '../utils/workoutSets';
import { exerciseKey, detectNewPRs, type NewPR } from '../utils/prs';

// ---------------------------------------------------------------------------
// The shape of the workout domain.
//
// A template is a plan: a named week, each weekday holding exercises. A session
// is a record: one row per day, holding the exercises as they were actually
// done.
//
// The separation is what makes "viewing a past week shows the template from
// that time" true. A session does not read from its template when it is
// displayed -- it reads its own materialised exercise rows, written once when
// the day was marked. Editing a template therefore only affects days that have
// not been trained yet, which is the only behaviour that makes sense.
//
// Every weight in this file is canonical kilograms. Conversion to lbs is a
// rendering concern (utils/units.ts), never a storage one.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkoutTemplate {
    id?: string;
    user_id: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

/** One exercise on one weekday of a template. */
export interface WorkoutTemplateExercise {
    id?: string;
    workout_template_id: string;
    user_id: string;
    /** 0 = Sunday .. 6 = Saturday. */
    day_of_week: number;
    position: number;
    exercise_id?: string | null;
    exercise_name: string;
    activity_type: ActivityType;
    /** One entry per set: `[{reps, weight}]`. Null when never configured. */
    target_sets_detail?: WorkoutSet[] | null;
    /** Summary of the above, for readers that don't want to parse the array. */
    target_reps?: number | null;
    target_weight?: number | null;
    target_duration_minutes?: number | null;
    target_distance_km?: number | null;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

/** One session, one day. */
export interface WorkoutCompletionLog {
    id?: string;
    user_id?: string;
    workout_date: string;
    workout_template_id?: string | null;
    completed: boolean;
    /** 1-10, drives the heatmap shade. */
    intensity?: number | null;
    duration_minutes?: number | null;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

/** One exercise inside one session, materialised from the template on mark. */
export interface WorkoutExerciseLog {
    id?: string;
    workout_completion_id: string;
    user_id?: string;
    template_exercise_id?: string | null;
    exercise_id?: string | null;
    exercise_name: string;
    activity_type: ActivityType;
    position: number;
    /** Came from the template. Still true after the user changes the numbers. */
    planned: boolean;
    completed: boolean;
    sets_detail?: WorkoutSet[] | null;
    reps?: number;
    weight?: number;
    duration_minutes?: number | null;
    distance_km?: number;
    notes?: string;
    created_at?: string;
}

/** An exercise the user tracks a record for. May have no record yet. */
export interface PREntry {
    id?: string;
    user_id: string;
    exercise_id?: string | null;
    exercise_name: string;
    source: 'template' | 'manual';
    created_at?: string;
}

/** One time the user beat a record. Append-only. */
export interface PRHistory {
    id?: string;
    user_id?: string;
    pr_entry_id?: string | null;
    exercise_name: string;
    weight?: number;
    reps?: number;
    workout_date: string;
    workout_completion_id?: string | null;
    created_at?: string;
}

export interface LibraryExercise {
    id?: string;
    user_id?: string;
    wger_id?: number | null;
    name: string;
    category?: string | null;
    equipment?: string | null;
    muscles?: string[] | null;
    aliases?: string[] | null;
    activity_type: ActivityType;
    is_custom: boolean;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const fail = (context: string, error: { message?: string } | null): never => {
    const message = error?.message ?? 'unknown error';
    throw new Error(`${context}: ${message}`);
};

/** Everything a read path needs to attach exercise rows to their session. */
export interface SessionWithExercises extends WorkoutCompletionLog {
    exercises: WorkoutExerciseLog[];
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const getWorkoutTemplates = async (): Promise<WorkoutTemplate[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching workout templates:', error.message);
        return [];
    }
    return data as WorkoutTemplate[];
};

export const getWorkoutTemplate = async (id: string): Promise<WorkoutTemplate | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching workout template:', error.message);
        return null;
    }
    return (data as WorkoutTemplate) ?? null;
};

/** Every exercise in a template, in the order the user arranged them. */
export const getTemplateExercises = async (templateId: string): Promise<WorkoutTemplateExercise[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('workout_template_exercises')
        .select('*')
        .eq('workout_template_id', templateId)
        .eq('user_id', userId)
        .order('day_of_week', { ascending: true })
        .order('position', { ascending: true });

    if (error) {
        console.error('Error fetching template exercises:', error.message);
        return [];
    }
    return (data as WorkoutTemplateExercise[]).map(row => ({
        ...row,
        target_sets_detail: row.target_sets_detail ? parseSetDetail(row.target_sets_detail) : null,
    }));
};

/**
 * The plan for one weekday of the active template.
 *
 * Scoped to the active template deliberately: the previous version filtered on
 * user_id and weekday alone, so every template's Monday exercises merged into
 * one "today" list no matter which routine was active.
 */
export const getPlanForDay = async (dayOfWeek: number): Promise<WorkoutTemplateExercise[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data: template, error: templateError } = await supabase
        .from('workout_templates')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

    if (templateError || !template) return [];

    const { data, error } = await supabase
        .from('workout_template_exercises')
        .select('*')
        .eq('workout_template_id', template.id)
        .eq('day_of_week', dayOfWeek)
        .order('position', { ascending: true });

    if (error) {
        console.error('Error fetching plan for day:', error.message);
        return [];
    }
    return (data as WorkoutTemplateExercise[]).map(row => ({
        ...row,
        target_sets_detail: row.target_sets_detail ? parseSetDetail(row.target_sets_detail) : null,
    }));
};

export const createWorkoutTemplate = async (
    template: { name: string; description?: string },
): Promise<WorkoutTemplate> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { data, error } = await supabase
        .from('workout_templates')
        .insert({ user_id: userId, name: template.name, description: template.description, is_active: false })
        .select()
        .single();

    if (error) fail('Could not create template', error);
    return data as WorkoutTemplate;
};

export const updateWorkoutTemplate = async (
    id: string,
    updates: Partial<Pick<WorkoutTemplate, 'name' | 'description'>>,
): Promise<WorkoutTemplate> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { data, error } = await supabase
        .from('workout_templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) fail('Could not save template', error);
    return data as WorkoutTemplate;
};

export const deleteWorkoutTemplate = async (id: string): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { error } = await supabase
        .from('workout_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

    if (error) fail('Could not delete template', error);
};

/**
 * Make one template the active one.
 *
 * The database enforces at most one active template per user via a partial
 * unique index, which is what makes this safe: the deactivate and the activate
 * race, the index rejects the loser, and the retry below leaves exactly one
 * active template. Without it an interruption between the two statements left
 * the user with none.
 */
export const setActiveTemplate = async (id: string): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    await supabase.from('workout_templates').update({ is_active: false }).eq('user_id', userId);

    for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase
            .from('workout_templates')
            .update({ is_active: true })
            .eq('id', id)
            .eq('user_id', userId);

        if (!error) return;
        // 23505 = unique violation: something else activated a template
        // between our two statements. Deactivate everything and try again.
        if (error.code !== '23505') fail('Could not activate template', error);
        await supabase.from('workout_templates').update({ is_active: false }).eq('user_id', userId);
    }
    throw new Error('Could not activate template: too many concurrent changes');
};

export const duplicateWorkoutTemplate = async (templateId: string): Promise<WorkoutTemplate> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const original = await getWorkoutTemplate(templateId);
    if (!original) throw new Error('Template not found');

    const { data: created, error } = await supabase
        .from('workout_templates')
        .insert({
            user_id: userId,
            name: `${original.name} (Copy)`,
            description: original.description,
            is_active: false,
        })
        .select()
        .single();

    if (error) fail('Could not duplicate template', error);
    const copy = created as WorkoutTemplate;

    const exercises = await getTemplateExercises(templateId);
    if (exercises.length === 0) return copy;

    // One insert, not one per exercise: a 30-exercise template used to make 30
    // sequential round-trips before the copy appeared.
    const { error: copyError } = await supabase.from('workout_template_exercises').insert(
        exercises.map(row => ({
            workout_template_id: copy.id!,
            user_id: userId,
            day_of_week: row.day_of_week,
            position: row.position,
            exercise_id: row.exercise_id ?? null,
            exercise_name: row.exercise_name,
            activity_type: row.activity_type,
            target_sets_detail: row.target_sets_detail ?? null,
            target_reps: row.target_reps ?? null,
            target_weight: row.target_weight ?? null,
            target_duration_minutes: row.target_duration_minutes ?? null,
            target_distance_km: row.target_distance_km ?? null,
            notes: row.notes ?? null,
        })),
    );

    if (copyError) fail('Could not copy template exercises', copyError);
    return copy;
};

// ---------------------------------------------------------------------------
// Template exercises
// ---------------------------------------------------------------------------

export interface TemplateExerciseInput {
    day_of_week?: number;
    exercise_id?: string | null;
    exercise_name: string;
    activity_type: ActivityType;
    target_sets_detail?: WorkoutSet[] | null;
    target_reps?: number | null;
    target_weight?: number | null;
    target_duration_minutes?: number | null;
    target_distance_km?: number | null;
    notes?: string | null;
    position?: number;
}

const templateExercisePayload = (
    userId: string,
    templateId: string,
    input: TemplateExerciseInput,
    position: number,
) => {
    const detail = input.target_sets_detail ? rowsToDetail(input.target_sets_detail) : null;
    return {
        user_id: userId,
        workout_template_id: templateId,
        day_of_week: input.day_of_week ?? 0,
        position: input.position ?? position,
        exercise_id: input.exercise_id ?? null,
        exercise_name: input.exercise_name.trim(),
        activity_type: input.activity_type,
        target_sets_detail: detail && detail.length ? detail : null,
        target_reps: input.target_reps ?? null,
        target_weight: input.target_weight ?? null,
        target_duration_minutes: input.target_duration_minutes ?? null,
        target_distance_km: input.target_distance_km ?? null,
        notes: input.notes ?? null,
    };
};

export const createTemplateExercise = async (
    templateId: string,
    input: TemplateExerciseInput,
): Promise<WorkoutTemplateExercise> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!input.exercise_name.trim()) throw new Error('Exercise name is required');

    const { data, error } = await supabase
        .from('workout_template_exercises')
        .insert(templateExercisePayload(userId, templateId, input, 0))
        .select()
        .single();

    if (error) fail('Could not add exercise', error);
    return {
        ...(data as WorkoutTemplateExercise),
        target_sets_detail: parseSetDetail((data as WorkoutTemplateExercise).target_sets_detail),
    };
};

export const updateTemplateExercise = async (
    id: string,
    templateId: string,
    updates: Partial<TemplateExerciseInput> & { position?: number },
): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.exercise_name !== undefined) payload.exercise_name = updates.exercise_name.trim();
    if (updates.activity_type !== undefined) payload.activity_type = updates.activity_type;
    if (updates.exercise_id !== undefined) payload.exercise_id = updates.exercise_id;
    if (updates.day_of_week !== undefined) payload.day_of_week = updates.day_of_week;
    if (updates.position !== undefined) payload.position = updates.position;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.target_duration_minutes !== undefined) payload.target_duration_minutes = updates.target_duration_minutes;
    if (updates.target_distance_km !== undefined) payload.target_distance_km = updates.target_distance_km;
    if (updates.target_reps !== undefined) payload.target_reps = updates.target_reps;
    if (updates.target_weight !== undefined) payload.target_weight = updates.target_weight;
    if (updates.target_sets_detail !== undefined) {
        const detail = rowsToDetail(updates.target_sets_detail ?? []);
        payload.target_sets_detail = detail.length ? detail : null;
    }

    const { error } = await supabase
        .from('workout_template_exercises')
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId)
        .eq('workout_template_id', templateId);

    if (error) fail('Could not save exercise', error);
};

export const deleteTemplateExercise = async (id: string, templateId: string): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { error } = await supabase
        .from('workout_template_exercises')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .eq('workout_template_id', templateId);

    if (error) fail('Could not delete exercise', error);
};

/**
 * Persist a whole day at once, used by the editor's reordering.
 */
export const reorderTemplateExercises = async (
    _templateId: string,
    ordered: Array<{ id: string; position: number }>,
): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId || ordered.length === 0) return;

    const { error } = await supabase
        .from('workout_template_exercises')
        .upsert(
            ordered.map(item => ({ id: item.id, position: item.position, updated_at: new Date().toISOString() })),
            { onConflict: 'id' },
        )
        .eq('user_id', userId);

    if (error) fail('Could not reorder exercises', error);
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const getSessionByDate = async (date: string): Promise<WorkoutCompletionLog | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
        .from('workout_completion_log')
        .select('*')
        .eq('user_id', userId)
        .eq('workout_date', date)
        .maybeSingle();

    if (error) {
        console.error('Error fetching session:', error.message);
        return null;
    }
    return (data as WorkoutCompletionLog) ?? null;
};

export const getSessionExercises = async (completionId: string): Promise<WorkoutExerciseLog[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('workout_exercises_log')
        .select('*')
        .eq('workout_completion_id', completionId)
        .eq('user_id', userId)
        .order('position', { ascending: true });

    if (error) {
        console.error('Error fetching session exercises:', error.message);
        return [];
    }
    return (data as WorkoutExerciseLog[]).map(row => ({
        ...row,
        sets_detail: parseSetDetail(row.sets_detail),
    }));
};

/**
 * Every completed session in the window, with its exercises attached.
 *
 * Two queries total, not one per session: the old implementation fanned out a
 * separate `getWorkoutExerciseLogs` call for all 120 history rows, so opening
 * the workouts page fired 121 round-trips before it could render a number.
 */
export const getSessionsWithExercises = async (
    from?: string,
    to?: string,
): Promise<SessionWithExercises[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    let query = supabase
        .from('workout_completion_log')
        .select('*')
        .eq('user_id', userId)
        .order('workout_date', { ascending: false });

    if (from) query = query.gte('workout_date', from);
    if (to) query = query.lte('workout_date', to);

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching sessions:', error.message);
        return [];
    }

    const sessions = (data as WorkoutCompletionLog[]) ?? [];
    if (sessions.length === 0) return [];

    const { data: exerciseRows, error: exerciseError } = await supabase
        .from('workout_exercises_log')
        .select('*')
        .in('workout_completion_id', sessions.map(s => s.id!))
        .order('position', { ascending: true });

    if (exerciseError) {
        console.error('Error fetching session exercises:', exerciseError.message);
        return sessions.map(session => ({ ...session, exercises: [] }));
    }

    const byCompletion = new Map<string, WorkoutExerciseLog[]>();
    for (const row of exerciseRows ?? []) {
        const log = row as WorkoutExerciseLog;
        const list = byCompletion.get(log.workout_completion_id);
        const decoded: WorkoutExerciseLog = { ...log, sets_detail: parseSetDetail(log.sets_detail) };
        if (list) list.push(decoded);
        else byCompletion.set(log.workout_completion_id, [decoded]);
    }

    return sessions.map(session => ({
        ...session,
        exercises: byCompletion.get(session.id!) ?? [],
    }));
};

export const createSession = async (
    input: Omit<WorkoutCompletionLog, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
): Promise<WorkoutCompletionLog> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { data, error } = await supabase
        .from('workout_completion_log')
        .insert({
            user_id: userId,
            workout_date: input.workout_date,
            workout_template_id: input.workout_template_id ?? null,
            completed: input.completed,
            intensity: input.intensity ?? null,
            duration_minutes: input.duration_minutes ?? null,
            notes: input.notes ?? null,
        })
        .select()
        .single();

    if (error) fail('Could not create session', error);
    return data as WorkoutCompletionLog;
};

export const updateSession = async (
    id: string,
    updates: Partial<Omit<WorkoutCompletionLog, 'id' | 'user_id' | 'workout_date'>>,
): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { error } = await supabase
        .from('workout_completion_log')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);

    if (error) fail('Could not save session', error);
};

/**
 * The one writer of "the user trained on this day".
 *
 * Called by both the daily log's Gym checkbox and the workouts page's
 * mark-a-day control, which is the whole point: one row, one function, so the
 * habit chart, the heatmap and the streak cannot disagree about a date.
 *
 * Marking materialises the day's plan into the session's own exercise rows. The
 * user is expected to change what they actually did -- a deviation edits this
 * day only and never the template.
 */
export const setGymForDate = async (
    date: string,
    trained: boolean,
    options: { intensity?: number; materialize?: boolean } = {},
): Promise<{ completed: boolean; newPRs: NewPR[] }> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    if (!trained) {
        await clearGymForDate(date);
        return { completed: false, newPRs: [] };
    }

    const weekday = new Date(`${date}T00:00:00`).getDay();
    const existing = await getSessionByDate(date);

    let sessionId = existing?.id;

    if (sessionId) {
        await updateSession(sessionId, {
            completed: true,
            ...(options.intensity != null ? { intensity: options.intensity } : {}),
        });
    } else {
        const plan = options.materialize === false ? [] : await getPlanForDay(weekday);
        const created = await createSession({
            workout_date: date,
            completed: true,
            intensity: options.intensity ?? 5,
            workout_template_id: plan.length ? await activeTemplateId() : null,
        });
        sessionId = created.id;

        if (sessionId && plan.length) {
            await insertSessionExercises(sessionId, plan);
        }
    }

    await setDailyLogGym(date, true);

    const exercises = sessionId ? await getSessionExercises(sessionId) : [];
    return { completed: true, newPRs: await recordNewPRs(date, sessionId!, exercises) };
};

/** Undo a mark. Cascades to the session's exercises and the PRs they earned. */
export const clearGymForDate = async (date: string): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { error } = await supabase
        .from('workout_completion_log')
        .delete()
        .eq('user_id', userId)
        .eq('workout_date', date);

    if (error) fail('Could not clear session', error);
    await setDailyLogGym(date, false);
};

const activeTemplateId = async (): Promise<string | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const { data } = await supabase
        .from('workout_templates')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
    return (data?.id as string) ?? null;
};

/**
 * Keep `daily_logs.gym` in step with the session row.
 *
 * Gym is a built-in habit, so it has to be a column to reach the habit score
 * and the habit charts through the same code as the other eight. That makes it
 * a denormalised copy of `workout_completion_log.completed`, written only from
 * here. A day with no log row counts as not trained.
 */
const setDailyLogGym = async (date: string, trained: boolean): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    // `upsert` on the (user_id, log_date) index: a day can be marked trained
    // before its log exists, and the column is all the habit charts need.
    const { error } = await supabase.from('daily_logs').upsert(
        { user_id: userId, log_date: date, gym: trained },
        { onConflict: 'user_id,log_date' },
    );

    if (error) console.error('Could not sync gym habit:', error.message);
};

/** Copy a weekday's plan into a session. Existing rows are never touched. */
const insertSessionExercises = async (
    sessionId: string,
    plan: WorkoutTemplateExercise[],
): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId || plan.length === 0) return;

    const { error } = await supabase.from('workout_exercises_log').insert(
        plan.map((row, index) => ({
            user_id: userId,
            workout_completion_id: sessionId,
            template_exercise_id: row.id ?? null,
            exercise_id: row.exercise_id ?? null,
            exercise_name: row.exercise_name,
            activity_type: row.activity_type,
            position: index,
            planned: true,
            completed: false,
            // Pre-fill from the plan so the user edits rather than types.
            sets_detail: row.target_sets_detail?.length ? row.target_sets_detail : null,
            reps: row.target_reps ?? null,
            weight: row.target_weight ?? null,
            duration_minutes: row.target_duration_minutes ?? null,
            distance_km: row.target_distance_km ?? null,
            notes: row.notes ?? null,
        })),
    );

    if (error) fail('Could not materialise the day plan', error);
};

/** Append an exercise to a session that did not come from a template. */
export const addSessionExercise = async (
    sessionId: string,
    input: {
        exercise_id?: string | null;
        exercise_name: string;
        activity_type: ActivityType;
        position?: number;
    },
): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');
    if (!input.exercise_name.trim()) throw new Error('Exercise name is required');

    const { error } = await supabase.from('workout_exercises_log').insert({
        user_id: userId,
        workout_completion_id: sessionId,
        exercise_id: input.exercise_id ?? null,
        exercise_name: input.exercise_name.trim(),
        activity_type: input.activity_type,
        position: input.position ?? 0,
        planned: false,
        completed: false,
    });

    if (error) fail('Could not add exercise', error);
};

/**
 * Write a whole session's exercises in one statement.
 *
 * Replaces a loop of read-then-update-per-row that matched on exercise name.
 * Matching by name meant renaming an exercise in the template orphaned its
 * logged row, so the same session silently grew duplicates.
 */
export const saveSessionExercises = async (
    sessionId: string,
    rows: Array<{
        id?: string;
        exercise_name: string;
        activity_type: ActivityType;
        completed: boolean;
        sets_detail?: WorkoutSet[];
        duration_minutes?: number | null;
        distance_km?: number | null;
        notes?: string | null;
    }>,
): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const kept = rows.filter(row => row.exercise_name.trim());
    const deleted = rows.filter(row => !row.exercise_name.trim() && row.id);

    if (deleted.length) {
        const { error } = await supabase
            .from('workout_exercises_log')
            .delete()
            .in('id', deleted.map(row => row.id!))
            .eq('user_id', userId)
            .eq('workout_completion_id', sessionId);
        if (error) fail('Could not remove exercise', error);
    }

    const upserts = kept.map((row, index) => {
        const detail = row.sets_detail ? rowsToDetail(row.sets_detail) : [];
        const heaviest = detail.reduce<WorkoutSet | undefined>(
            (best, set) => (best === undefined || (set.weight ?? 0) > (best.weight ?? 0) ? set : best),
            undefined,
        );
        return {
            // No id means "insert"; an id means "update in place".
            ...(row.id ? { id: row.id } : {}),
            user_id: userId,
            workout_completion_id: sessionId,
            exercise_name: row.exercise_name.trim(),
            activity_type: row.activity_type,
            position: index,
            completed: row.completed,
            sets_detail: detail.length ? detail : null,
            reps: heaviest?.reps ?? null,
            weight: heaviest?.weight ?? null,
            duration_minutes: row.duration_minutes ?? null,
            distance_km: row.distance_km ?? null,
            notes: row.notes ?? null,
        };
    });

    if (!upserts.length) return;

    // An upsert with mixed inserts and updates needs one statement per shape,
    // because a payload row without an id is an insert and one with an id is an
    // update, and Postgres will not do both in a single call.
    const updates = upserts.filter(row => row.id);
    const inserts = upserts.filter(row => !row.id);

    if (inserts.length) {
        const { error } = await supabase.from('workout_exercises_log').insert(inserts);
        if (error) fail('Could not add exercises', error);
    }
    if (updates.length) {
        const { error } = await supabase
            .from('workout_exercises_log')
            .upsert(updates, { onConflict: 'id' })
            .eq('user_id', userId);
        if (error) fail('Could not save exercises', error);
    }
};

export const deleteSessionExercise = async (id: string): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { error } = await supabase.from('workout_exercises_log').delete().eq('id', id).eq('user_id', userId);
    if (error) fail('Could not delete exercise', error);
};

// ---------------------------------------------------------------------------
// Personal records
// ---------------------------------------------------------------------------

export const getPREntries = async (): Promise<PREntry[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('pr_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching PR entries:', error.message);
        return [];
    }
    return (data as PREntry[]) ?? [];
};

export const getPRHistory = async (): Promise<PRHistory[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('pr_history')
        .select('*')
        .eq('user_id', userId)
        .order('workout_date', { ascending: false });

    if (error) {
        console.error('Error fetching PR history:', error.message);
        return [];
    }
    return (data as PRHistory[]) ?? [];
};

/**
 * Add an exercise to the tracked list, or return the one that already exists.
 *
 * Templates seed this automatically, so re-seeding a template must not create
 * a second entry for the same lift -- hence the lookup before the insert.
 */
export const ensurePREntry = async (input: {
    exercise_id?: string | null;
    exercise_name: string;
    source?: 'template' | 'manual';
}): Promise<PREntry | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const name = input.exercise_name.trim();
    if (!name) return null;

    const { data: existing } = await supabase
        .from('pr_entries')
        .select('*')
        .eq('user_id', userId)
        .ilike('exercise_name', name)
        .maybeSingle();

    if (existing) return existing as PREntry;

    const { data, error } = await supabase
        .from('pr_entries')
        .insert({
            user_id: userId,
            exercise_id: input.exercise_id ?? null,
            exercise_name: name,
            source: input.source ?? 'manual',
        })
        .select()
        .single();

    if (error) {
        console.error('Could not track PR:', error.message);
        return null;
    }
    return data as PREntry;
};

/** Seed every exercise in a template into the tracked list. */
export const seedPRsFromTemplate = async (templateId: string): Promise<number> => {
    const exercises = await getTemplateExercises(templateId);
    const names = [...new Set(exercises.map(row => row.exercise_name))];
    const entries = await Promise.all(
        names.map(name => ensurePREntry({ exercise_name: name, source: 'template' })),
    );
    return entries.filter(Boolean).length;
};

export const deletePREntry = async (id: string): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { error } = await supabase.from('pr_entries').delete().eq('id', id).eq('user_id', userId);
    if (error) fail('Could not stop tracking this record', error);
};

/** Record a historical best by hand, for lifts predating the app. */
export const recordManualPR = async (input: {
    pr_entry_id: string;
    weight?: number | null;
    reps?: number | null;
}): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { error } = await supabase.from('pr_history').insert({
        user_id: userId,
        pr_entry_id: input.pr_entry_id,
        exercise_name: '',
        weight: input.weight ?? null,
        reps: input.reps ?? null,
        workout_date: todayString(),
        workout_completion_id: null,
    });

    if (error) fail('Could not record your max', error);
};

/**
 * Raise a record for any set in a session that beat the current best.
 *
 * The only thing that writes a `pr_history` row from a workout. Strictly
 * greater than, so re-testing a max you already hold is not announced as a new
 * record -- the alternative trains people to dismiss the notification.
 */
export const recordNewPRs = async (
    date: string,
    sessionId: string,
    exercises: WorkoutExerciseLog[],
): Promise<NewPR[]> => {
    const userId = await getCurrentUserId();
    if (!userId || exercises.length === 0) return [];

    const history = await getPRHistory();
    const bests = new Map<string, { weight: number }>();
    for (const row of history) {
        if (row.weight == null) continue;
        const key = row.pr_entry_id ? `entry:${row.pr_entry_id}` : exerciseKey({ exercise_name: row.exercise_name });
        const current = bests.get(key);
        if (!current || row.weight > current.weight) bests.set(key, { weight: row.weight });
    }

    const detected = detectNewPRs(exercises, bests);
    if (detected.length === 0) return [];

    const entries = await getPREntries();
    const byName = new Map(entries.map(entry => [entry.exercise_name.trim().toLowerCase(), entry]));

    const payload = detected.map(pr => {
        const entry = byName.get(pr.exercise_name.trim().toLowerCase());
        return {
            user_id: userId,
            pr_entry_id: entry?.id ?? null,
            exercise_name: pr.exercise_name,
            weight: pr.weight,
            reps: pr.reps ?? null,
            workout_date: date,
            workout_completion_id: sessionId,
        };
    });

    const { error } = await supabase.from('pr_history').insert(payload);
    if (error) {
        console.error('Could not record records:', error.message);
        return [];
    }
    return detected;
};

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export const getExercises = async (): Promise<LibraryExercise[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching exercise library:', error.message);
        return [];
    }
    return data as LibraryExercise[];
};

/** Add an exercise the user typed themselves. */
export const createCustomExercise = async (
    name: string,
    activityType: ActivityType = 'strength',
): Promise<LibraryExercise | null> => {
    const userId = await getCurrentUserId();
    const trimmed = name.trim();
    if (!userId || !trimmed) return null;

    const { data, error } = await supabase
        .from('exercises')
        .insert({
            user_id: userId,
            name: trimmed,
            activity_type: activityType,
            is_custom: true,
        })
        .select()
        .maybeSingle();

    if (error) {
        // The (user_id, lower(name)) index makes a duplicate a no-op rather
        // than a crash: the user picks the existing exercise instead.
        console.error('Could not save exercise:', error.message);
        return null;
    }
    return data as LibraryExercise;
};

/** One round-trip for the whole catalogue instead of one per wger page. */
export const syncExerciseLibrary = async (
    rows: Array<Omit<LibraryExercise, 'id' | 'user_id' | 'is_custom'>>,
): Promise<number> => {
    const userId = await getCurrentUserId();
    if (!userId || rows.length === 0) return 0;

    const existing = await getExercises();
    const known = new Set(existing.filter(row => row.wger_id != null).map(row => row.wger_id));
    const fresh = rows.filter(row => row.wger_id == null || !known.has(row.wger_id));
    if (fresh.length === 0) return 0;

    // Chunked so one oversized statement can't trip the request size limit.
    const CHUNK = 400;
    for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const { error } = await supabase
            .from('exercises')
            .upsert(
                chunk.map(row => ({
                    user_id: userId,
                    wger_id: row.wger_id ?? null,
                    name: row.name,
                    category: row.category ?? null,
                    equipment: row.equipment ?? null,
                    muscles: row.muscles ?? null,
                    aliases: row.aliases ?? null,
                    activity_type: isActivityType(row.activity_type) ? row.activity_type : 'strength',
                    is_custom: false,
                    last_synced_at: new Date().toISOString(),
                })),
                { onConflict: 'user_id,lower(name)' },
            );
        if (error) {
            console.error('Could not sync the exercise library:', error.message);
            return i;
        }
    }
    return fresh.length;
};

// ---------------------------------------------------------------------------
// Aggregate helpers shared with the stats page
// ---------------------------------------------------------------------------

/** Tonnage for one logged exercise, preferring real per-set detail. */
export const exerciseVolumeKg = (log: Pick<WorkoutExerciseLog, 'sets_detail'>): number => {
    const detail = parseSetDetail(log.sets_detail);
    return detail.length ? detailVolumeKg(detail) : 0;
};

/**
 * Expand a template exercise into editable set rows.
 *
 * A template that says "3 x 10 x 60" and one that says three identical sets
 * are the same instruction, so the editor needs a row per set either way.
 */
export const templateSetRows = (exercise: WorkoutTemplateExercise): WorkoutSet[] => {
    const detail = exercise.target_sets_detail ?? [];
    if (detail.length) return detailToRows(detail, detail.length);
    const count = Math.max(detail.length, 1);
    return detailToRows([], count, exercise.target_reps ?? undefined, exercise.target_weight ?? undefined);
};

/** Sessions are returned newest-first; callers that need oldests use this. */
export const sortSessionsOldestFirst = (sessions: WorkoutCompletionLog[]): WorkoutCompletionLog[] =>
    [...sessions].sort((a, b) => (a.workout_date === b.workout_date ? 0 : a.workout_date < b.workout_date ? -1 : 1));

/** Re-exported so pages import their domain types from one place. */
export type { ActivityType, WorkoutSet, NewPR };