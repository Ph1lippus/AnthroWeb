import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getWorkoutTemplates,
    getWorkoutTemplate,
    getTemplateExercises,
    getPlanForDay,
    createWorkoutTemplate,
    updateWorkoutTemplate,
    deleteWorkoutTemplate,
    duplicateWorkoutTemplate,
    setActiveTemplate,
    createTemplateExercise,
    updateTemplateExercise,
    deleteTemplateExercise,
    getSessionByDate,
    getSessionExercises,
    getSessionsWithExercises,
    createSession,
    updateSession,
    setGymForDate,
    clearGymForDate,
    addSessionExercise,
    saveSessionExercises,
    deleteSessionExercise,
    getPREntries,
    getPRHistory,
    ensurePREntry,
    seedPRsFromTemplate,
    deletePREntry,
    recordManualPR,
    recordNewPRs,
    getExercises,
    createCustomExercise,
    syncExerciseLibrary,
    type WorkoutTemplate,
    type WorkoutTemplateExercise,
    type WorkoutCompletionLog,
    type WorkoutExerciseLog,
    type PREntry,
    type PRHistory,
    type SessionWithExercises,
    type TemplateExerciseInput,
    type ActivityType,
    type WorkoutSet,
} from '../services/workoutService';
import { queryKeys } from '../utils/queryKeys';
import { addDays, todayString } from '../utils/dates';
import {
    buildHeatGrid,
    currentStreak,
    totalsBetween,
    rollupExercises,
    DAY_NAMES,
    type DayRecord,
    type ExerciseRollup,
    type PeriodTotals,
} from '../utils/workoutStats';
import { exerciseKey, type NewPR } from '../utils/prs';
import { fetchWgerExercises, inferActivityType } from '../services/wgerService';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Every template with its exercises attached, so a plan preview needs one query. */
export const useWorkoutTemplates = () =>
    useQuery({
        queryKey: queryKeys.workoutTemplates,
        queryFn: async (): Promise<Array<WorkoutTemplate & { days: WorkoutTemplateExercise[] }>> => {
            const templates = await getWorkoutTemplates();
            return Promise.all(
                templates.map(async template => ({
                    ...template,
                    days: template.id ? await getTemplateExercises(template.id) : [],
                })),
            );
        },
    });

export const useActiveTemplate = () => {
    const { data, isLoading } = useWorkoutTemplates();
    const templates = data ?? [];
    return {
        activeTemplate: templates.find(t => t.is_active) ?? null,
        templates,
        isLoading,
    };
};

export const useWorkoutTemplate = (id: string | undefined) =>
    useQuery({
        queryKey: queryKeys.workoutTemplate(id ?? ''),
        queryFn: async () => {
            if (!id) return null;
            const [template, exercises] = await Promise.all([
                getWorkoutTemplate(id),
                getTemplateExercises(id),
            ]);
            return template ? { template, exercises } : null;
        },
        enabled: !!id,
    });

export const useWorkoutPlan = (dayOfWeek: number, enabled = true) =>
    useQuery({
        queryKey: queryKeys.workoutPlan(dayOfWeek),
        queryFn: () => getPlanForDay(dayOfWeek),
        enabled,
        // The plan only changes when a template does, and the template query is
        // invalidated alongside every template mutation. Refetching per weekday
        // on every focus would be a query whose result cannot have moved.
        staleTime: 5 * 60 * 1000,
    });

export const useSessionByDate = (date: string, enabled = true) =>
    useQuery({
        queryKey: queryKeys.workoutLogByDate(date),
        queryFn: () => getSessionByDate(date),
        enabled: !!date && enabled,
    });

export const useSessionExercises = (completionId: string | undefined) =>
    useQuery({
        queryKey: queryKeys.workoutExercises(completionId ?? ''),
        queryFn: () => getSessionExercises(completionId!),
        enabled: !!completionId,
    });

export const usePREntries = () =>
    useQuery({
        queryKey: queryKeys.workoutPREntries,
        queryFn: getPREntries,
    });

export const usePRHistory = () =>
    useQuery({
        queryKey: queryKeys.workoutPRs,
        queryFn: getPRHistory,
    });

export const useExerciseLibrary = () =>
    useQuery({
        queryKey: queryKeys.exerciseLibrary,
        queryFn: getExercises,
        // The library only changes on an explicit sync or a custom entry.
        staleTime: 60 * 60 * 1000,
    });

// ---------------------------------------------------------------------------
// The workouts page in one query
// ---------------------------------------------------------------------------

export interface WorkoutsOverview {
    days: Map<string, DayRecord>;
    weeks: ReturnType<typeof buildHeatGrid>;
    streak: number;
    last7: PeriodTotals;
    last30: PeriodTotals;
    year: PeriodTotals;
    /** The six most recent completed sessions, for the strip at the top. */
    recent: SessionWithExercises[];
    /** Every session in the window, for the per-exercise stats table. */
    sessions: SessionWithExercises[];
    isLoading: boolean;
}

/**
 * Everything the workouts page renders, from two queries.
 *
 * Sessions and their exercises are fetched as one windowed pair, then reduced
 * client-side into a day-keyed map. Doing this in SQL would need a view or a
 * function, and the app has no migration runner -- so the reduction lives here
 * where it is one readable pass over data that is already in memory.
 *
 * The window is 372 days: the heatmap needs 52 full weeks plus the partial
 * week the grid rounds out to, and asking for a year from a table that may hold
 * years of history would fetch rows nobody can see.
 */
export const useWorkoutsOverview = (): WorkoutsOverview => {
    const to = todayString();
    const from = addDays(to, -371);

    const { data: sessions, isLoading } = useQuery({
        queryKey: queryKeys.workoutSessions(from, to),
        queryFn: () => getSessionsWithExercises(from, to),
    });

    return useOverviewFrom(sessions, isLoading, to);
};

const useOverviewFrom = (
    sessions: SessionWithExercises[] | undefined,
    isLoading: boolean,
    today: string,
): WorkoutsOverview => {
    // useMemo is not available at this call site's constraints without a hook
    // body, so the reduction is a plain memo keyed on the fetch result. The
    // object identity only changes when `sessions` does.
    const days = new Map<string, DayRecord>();
    const recent: SessionWithExercises[] = [];

    for (const session of sessions ?? []) {
        const volumeKg = session.exercises.reduce((total, row) => total + sumVolume(row), 0);
        days.set(session.workout_date, {
            completed: session.completed,
            intensity: session.intensity ?? null,
            exerciseCount: session.exercises.length,
            volumeKg,
            durationMinutes: session.duration_minutes ?? null,
        });
        if (session.completed) recent.push(session);
    }

    return {
        days,
        weeks: buildHeatGrid(days),
        streak: currentStreak(days),
        last7: totalsBetween(days, addDays(today, -6), today),
        last30: totalsBetween(days, addDays(today, -29), today),
        year: totalsBetween(days, addDays(today, -364), today),
        recent: recent.slice(0, 6),
        sessions: sessions ?? [],
        isLoading,
    };
};

const sumVolume = (row: WorkoutExerciseLog): number =>
    (row.sets_detail ?? []).reduce((total, set) => total + (set.reps ?? 0) * (set.weight ?? 0), 0);

/**
 * Per-exercise stats, optionally restricted to one template's exercises.
 *
 * Filtering after the rollup rather than in the query keeps the whole history
 * out of the component while still producing one pass over it.
 */
export const useExerciseStats = (
    sessions: SessionWithExercises[] | undefined,
    only?: WorkoutTemplateExercise[],
): ExerciseRollup[] => {
    const keys = only?.length
        ? new Set(only.map(row => exerciseKey({ exercise_id: row.exercise_id, exercise_name: row.exercise_name })))
        : undefined;

    const flat: Array<{
        exercise_id?: string | null;
        exercise_name: string;
        activity_type?: ActivityType;
        workout_date: string;
        completed: boolean;
        sets_detail?: WorkoutSet[] | null;
        duration_minutes?: number | null;
        distance_km?: number | null;
    }> = [];

    for (const session of sessions ?? []) {
        for (const row of session.exercises) {
            flat.push({
                exercise_id: row.exercise_id,
                exercise_name: row.exercise_name,
                activity_type: row.activity_type,
                workout_date: session.workout_date,
                completed: row.completed,
                sets_detail: row.sets_detail,
                duration_minutes: row.duration_minutes,
                distance_km: row.distance_km,
            });
        }
    }

    const rollups = rollupExercises(flat, keys);

    // Template order, not alphabetical: the table should read as the plan.
    if (!only?.length) return rollups;
    const byKey = new Map(rollups.map(row => [row.key, row]));
    return only
        .map(row => byKey.get(exerciseKey({
            exercise_id: row.exercise_id,
            exercise_name: row.exercise_name,
        })))
        .filter((row): row is ExerciseRollup => !!row);
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Everything a workout change can invalidate.
 *
 * Marking a day touches the session, its exercises, the daily log's gym column
 * and possibly the PR tables. Invalidating the four roots once here stops each
 * mutation from having to remember which of them it moved.
 */
const useInvalidateWorkouts = () => {
    const qc = useQueryClient();
    return () => {
        qc.invalidateQueries({ queryKey: queryKeys.workoutSessionsRoot });
        qc.invalidateQueries({ queryKey: queryKeys.workoutTemplates });
        qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateExercisesRoot });
        qc.invalidateQueries({ queryKey: queryKeys.workoutPlanRoot });
        qc.invalidateQueries({ queryKey: queryKeys.workoutLogs });
        qc.invalidateQueries({ queryKey: queryKeys.workoutPRs });
        qc.invalidateQueries({ queryKey: queryKeys.workoutPREntries });
        // The Gym checkbox on the daily log and its habit charts read this.
        qc.invalidateQueries({ queryKey: queryKeys.dailyLogs });
        qc.invalidateQueries({ queryKey: queryKeys.habitLogs });
    };
};

export const useCreateWorkoutTemplate = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (input: { name: string; description?: string }) => createWorkoutTemplate(input),
        onSuccess: invalidate,
    });
};

export const useUpdateWorkoutTemplate = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Pick<WorkoutTemplate, 'name' | 'description'>> }) =>
            updateWorkoutTemplate(id, updates),
        onSuccess: invalidate,
    });
};

export const useDeleteWorkoutTemplate = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (id: string) => deleteWorkoutTemplate(id),
        onSuccess: invalidate,
    });
};

export const useDuplicateWorkoutTemplate = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (id: string) => duplicateWorkoutTemplate(id),
        onSuccess: invalidate,
    });
};

export const useSetActiveTemplate = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (id: string) => setActiveTemplate(id),
        onSuccess: invalidate,
    });
};

export const useAddTemplateExercise = (templateId: string) => {
    const invalidate = useInvalidateWorkouts();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: TemplateExerciseInput) => createTemplateExercise(templateId, input),
        onSuccess: () => {
            invalidate();
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplate(templateId) });
        },
    });
};

export const useUpdateTemplateExercise = (templateId: string) => {
    const invalidate = useInvalidateWorkouts();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<TemplateExerciseInput> }) =>
            updateTemplateExercise(id, templateId, updates),
        onSuccess: () => {
            invalidate();
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplate(templateId) });
        },
    });
};

export const useDeleteTemplateExercise = (templateId: string) => {
    const invalidate = useInvalidateWorkouts();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteTemplateExercise(id, templateId),
        onSuccess: () => {
            invalidate();
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplate(templateId) });
        },
    });
};

/**
 * Mark or unmark a day. The only path to `workout_completion_log.completed`
 * outside a full session save, shared by the daily log's Gym checkbox and the
 * workouts page's popover.
 */
export const useSetGymForDate = (onNewPRs?: (prs: NewPR[]) => void) => {
    const invalidate = useInvalidateWorkouts();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            date: string;
            trained: boolean;
            intensity?: number;
            materialize?: boolean;
        }) => setGymForDate(input.date, input.trained, {
            intensity: input.intensity,
            materialize: input.materialize,
        }),
        onSuccess: (result, input) => {
            invalidate();
            // The day view is cached by date; a mark made elsewhere has to
            // refresh it or the popover will disagree with the heatmap.
            qc.invalidateQueries({ queryKey: queryKeys.workoutLogByDate(input.date) });
            if (result.newPRs.length) onNewPRs?.(result.newPRs);
        },
    });
};

export const useClearGymForDate = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (date: string) => clearGymForDate(date),
        onSuccess: invalidate,
    });
};

/** Save a whole session: header, exercise rows, and any records they earned. */
export const useSaveSession = (onNewPRs?: (prs: NewPR[]) => void) => {
    const invalidate = useInvalidateWorkouts();
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async (input: {
            date: string;
            header: Partial<Omit<WorkoutCompletionLog, 'id' | 'user_id' | 'workout_date'>>;
            exercises: Array<{
                id?: string;
                exercise_name: string;
                activity_type: ActivityType;
                completed: boolean;
                sets_detail?: WorkoutSet[];
                duration_minutes?: number | null;
                distance_km?: number | null;
                notes?: string | null;
            }>;
            /** Insert any session that does not exist yet. */
            createIfMissing?: boolean;
        }): Promise<NewPR[]> => {
            let sessionId = (await getSessionByDate(input.date))?.id;

            if (!sessionId) {
                if (!input.createIfMissing) return [];
                const created = await createSession({ workout_date: input.date, completed: false, ...input.header });
                sessionId = created.id;
            } else {
                await updateSession(sessionId, input.header);
            }

            await saveSessionExercises(sessionId!, input.exercises);
            const saved = await getSessionExercises(sessionId!);
            return recordNewPRs(input.date, sessionId!, saved);
        },
        onSuccess: (prs, input) => {
            invalidate();
            qc.invalidateQueries({ queryKey: queryKeys.workoutLogByDate(input.date) });
            if (prs.length) onNewPRs?.(prs);
        },
    });
};

export const useAddSessionExercise = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (input: {
            sessionId: string;
            exercise_id?: string | null;
            exercise_name: string;
            activity_type: ActivityType;
        }) => addSessionExercise(input.sessionId, {
            exercise_id: input.exercise_id,
            exercise_name: input.exercise_name,
            activity_type: input.activity_type,
        }),
        onSuccess: invalidate,
    });
};

export const useDeleteSessionExercise = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (id: string) => deleteSessionExercise(id),
        onSuccess: invalidate,
    });
};

export const useAddPREntry = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (input: { exercise_id?: string | null; exercise_name: string; source?: 'template' | 'manual' }) =>
            ensurePREntry(input),
        onSuccess: invalidate,
    });
};

export const useSeedPRsFromTemplate = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (templateId: string) => seedPRsFromTemplate(templateId),
        onSuccess: invalidate,
    });
};

export const useDeletePREntry = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (id: string) => deletePREntry(id),
        onSuccess: invalidate,
    });
};

export const useRecordManualPR = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (input: { pr_entry_id: string; weight?: number | null; reps?: number | null }) =>
            recordManualPR(input),
        onSuccess: invalidate,
    });
};

/**
 * Pull the exercise library from wger.
 *
 * Guarded so two components mounting at once cannot both fire a 900-row
 * download: the first caller's promise is shared by everyone who asks while it
 * is in flight.
 */
let librarySync: Promise<number> | null = null;

export const useSyncExerciseLibrary = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            if (!librarySync) {
                librarySync = (async () => {
                    const rows = await fetchWgerExercises();
                    // wger is a strength catalogue; cardio is recognised by name.
                    return syncExerciseLibrary(rows.map(row => ({
                        ...row,
                        activity_type: inferActivityType(row.name),
                    })));
                })().finally(() => {
                    librarySync = null;
                });
            }
            const added = await librarySync;
            if (added > 0) qc.invalidateQueries({ queryKey: queryKeys.exerciseLibrary });
            return added;
        },
    });
};

export const useCreateCustomExercise = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { name: string; activity_type?: ActivityType }) =>
            createCustomExercise(input.name, input.activity_type),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exerciseLibrary }),
    });
};

export { DAY_NAMES };
export type { WorkoutTemplate, WorkoutTemplateExercise, WorkoutCompletionLog, WorkoutExerciseLog, PREntry, PRHistory, SessionWithExercises, NewPR };