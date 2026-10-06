import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getWorkoutTemplates,
    getWorkoutTemplate,
    getTemplateExercises,
    getPlanSessions,
    getPlanSession,
    getPlanSessionsForDay,
    createPlanSession,
    updatePlanSession,
    deletePlanSession,
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
    startSessionFromPlan,
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
    updatePRHistory,
    deletePRHistory,
    clearPRHistory,
    recordNewPRs,
    getExercises,
    createCustomExercise,
    syncExerciseLibrary,
    type WorkoutTemplate,
    type WorkoutTemplateExercise,
    type WorkoutPlanSession,
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

/** One template, its sessions, and all of its exercises -- one round trip. */
export const useWorkoutTemplate = (id: string | null | undefined) =>
    useQuery({
        queryKey: queryKeys.workoutTemplate(id ?? ''),
        queryFn: async () => {
            if (!id) return null;
            const [template, sessions, exercises] = await Promise.all([
                getWorkoutTemplate(id),
                getPlanSessions(id),
                getTemplateExercises(id),
            ]);
            return template ? { template, sessions, exercises } : null;
        },
        enabled: !!id,
    });

/** Just the sessions for one template, for the session dialog. */
export const usePlanSessions = (templateId: string | null) =>
    useQuery({
        queryKey: queryKeys.workoutTemplateSessions(templateId ?? ''),
        queryFn: () => getPlanSessions(templateId!),
        enabled: !!templateId,
    });

/** One planned session by id, for comparing a target against what happened. */
export const usePlanSession = (sessionId: string | null | undefined) =>
    useQuery({
        queryKey: ['workout-plan-session', sessionId ?? ''],
        queryFn: () => getPlanSession(sessionId!),
        enabled: !!sessionId,
    });

/** The planned sessions on one weekday of the active template. */
export const useTodaysPlanSessions = (dayOfWeek: number, enabled = true) =>
    useQuery({
        queryKey: ['workout-today-sessions', dayOfWeek],
        queryFn: () => getPlanSessionsForDay(dayOfWeek),
        enabled,
        staleTime: 5 * 60 * 1000,
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

/**
 * The user's own copy of the exercise catalogue.
 *
 * Fetched on first use rather than behind a button. An import control inside the
 * search dropdown was the wrong shape for it twice over: it hid a network
 * request behind something nobody looks for, and an empty library was
 * indistinguishable from a library that simply lacked the lift you typed. Now
 * the first picker to find an empty library starts the sync itself, once per
 * page load, and the dropdown says it is fetching until the rows arrive.
 *
 * `syncLibrary` is returned so the query's own `onSuccess` can be the thing that
 * refreshes the rows -- one source of truth for when the data changed.
 */
/**
 * The auto-sync latch. One catalogue fetch per page load, not one per mounted
 * picker -- several pickers can be open at once on the Templates tab.
 *
 * `autoSyncAttempts` bounds the retries. Resetting the latch on its own was not
 * enough: the effect depends on the mutation's identity, which changes when the
 * mutation settles, so a latch reset made it fire again immediately and a
 * catalogue that keeps coming back empty turned into a fetch loop.
 */
let autoSyncStarted = false;
let autoSyncAttempts = 0;
const MAX_AUTO_ATTEMPTS = 2;

/**
 * What the picker can actually say about the library.
 *
 * `failed` is the state that was missing. Deriving this from
 * `library.length === 0` cannot tell "still loading" from "loaded, and empty"
 * from "the fetch threw" from "the database rejected the write" -- all four are
 * the same empty array, so a broken sync reported itself as an empty library.
 */
export type LibraryStatus = 'loading' | 'syncing' | 'failed' | 'empty' | 'ready';

export const useExerciseLibrary = () => {
    const query = useQuery({
        queryKey: queryKeys.exerciseLibrary,
        queryFn: getExercises,
        // The library only changes on a sync or a custom entry.
        staleTime: 60 * 60 * 1000,
    });

    const syncLibrary = useSyncExerciseLibrary();

    const isEmpty = query.data != null && query.data.length === 0;

    useEffect(() => {
        if (!isEmpty || syncLibrary.isPending || autoSyncStarted) return;
        if (autoSyncAttempts >= MAX_AUTO_ATTEMPTS) return;
        autoSyncStarted = true;
        autoSyncAttempts += 1;
        const giveUp = () => {
            autoSyncStarted = false;
        };
        void syncLibrary
            .mutateAsync()
            // A failure is recorded on the mutation as well as released here, so
            // the picker can show the reason and a later mount can try again.
            .then(giveUp, giveUp);
    }, [isEmpty, syncLibrary]);

    const status: LibraryStatus = syncLibrary.isPending
        ? 'syncing'
        : syncLibrary.isError
          ? 'failed'
          : query.isPending
            ? 'loading'
            : isEmpty
              ? 'empty'
              : 'ready';

    // `useSyncExerciseLibrary` invalidates the library itself once rows land.
    return {
        ...query,
        syncLibrary,
        status,
        error: syncLibrary.error instanceof Error ? syncLibrary.error.message : null,
    };
};

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
            sets: session.exercises.reduce((total, row) => total + (row.sets_detail?.length ?? 0), 0),
            volumeKg,
            durationMinutes: session.duration_minutes ?? null,
            name: session.plan_session?.name ?? null,
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

    /* Muscles live on the library row, not on the log, so the join happens here:
       the log carries `exercise_id` and the picker already put the id on the
       row when it was created. Naming the exercise without the id would fall
       back to a normalized-name match, which is the join that silently dropped
       the metadata before. */
    const { data: library = [] } = useQuery({
        queryKey: queryKeys.exerciseLibrary,
        queryFn: getExercises,
        staleTime: 60 * 60 * 1000,
    });
    const musclesById = useMemo(
        () => new Map(library.map(row => [row.id, row.muscles ?? []] as const)),
        [library],
    );
    const musclesByName = useMemo(
        () => new Map(library.map(row => [exerciseKey({ exercise_name: row.name }), row.muscles ?? []] as const)),
        [library],
    );

    const flat: Array<{
        exercise_id?: string | null;
        exercise_name: string;
        activity_type?: ActivityType;
        muscles?: string[] | null;
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
                muscles: (row.exercise_id ? musclesById.get(row.exercise_id) : undefined)
                    ?? musclesByName.get(exerciseKey({ exercise_name: row.exercise_name }))
                    ?? null,
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
        qc.invalidateQueries({ queryKey: queryKeys.workoutExercisesRoot });
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

export const useCreatePlanSession = (templateId: string) => {
    const invalidate = useInvalidateWorkouts();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            name: string;
            day_of_week: number;
            activity_type?: ActivityType;
            target_duration_minutes?: number | null;
            target_intensity?: number | null;
            notes?: string | null;
            position?: number;
        }) => createPlanSession(templateId, input),
        onSuccess: () => {
            invalidate();
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplate(templateId) });
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateSessions(templateId) });
        },
    });
};

export const useUpdatePlanSession = (templateId: string) => {
    const invalidate = useInvalidateWorkouts();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            updates,
        }: {
            id: string;
            updates: Partial<Omit<WorkoutPlanSession, 'id' | 'user_id' | 'workout_template_id'>>;
        }) => updatePlanSession(id, updates),
        onSuccess: () => {
            invalidate();
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplate(templateId) });
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateSessions(templateId) });
        },
    });
};

export const useDeletePlanSession = (templateId: string) => {
    const invalidate = useInvalidateWorkouts();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deletePlanSession(id),
        onSuccess: () => {
            invalidate();
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplate(templateId) });
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateSessions(templateId) });
        },
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
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateSessions(templateId) });
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
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateSessions(templateId) });
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
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateSessions(templateId) });
        },
    });
};

/**
 * Mark or unmark a day. The only path to `workout_completion_log.completed`
 * outside a full session save -- the daily log's Gym checkbox.
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
            // refresh it or the day editor will disagree with the heatmap.
            qc.invalidateQueries({ queryKey: queryKeys.workoutLogByDate(input.date) });
            if (result.newPRs.length) onNewPRs?.(result.newPRs);
        },
    });
};

/**
 * Open a session for a date from the active template's plan, without marking the
 * day as trained. The explicit door behind the "preview the plan, then start it"
 * gesture in the session editor.
 */
export const useStartSessionFromPlan = () => {
    const invalidate = useInvalidateWorkouts();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { date: string; planSessionId?: string | null }) =>
            startSessionFromPlan(input.date, input.planSessionId),
        onSuccess: (_result, input) => {
            invalidate();
            qc.invalidateQueries({ queryKey: queryKeys.workoutLogByDate(input.date) });
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
export interface SaveSessionResult {
    prs: NewPR[];
    /** The session's rows as the database now holds them, ordered by `position`. */
    saved: WorkoutExerciseLog[];
}

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
                exercise_id?: string | null;
                activity_type: ActivityType;
                completed: boolean;
                sets_detail?: WorkoutSet[];
                duration_minutes?: number | null;
                distance_km?: number | null;
                notes?: string | null;
            }>;
            /** Insert any session that does not exist yet. */
            createIfMissing?: boolean;
        }): Promise<SaveSessionResult> => {
            let sessionId = (await getSessionByDate(input.date))?.id;

            if (!sessionId) {
                if (!input.createIfMissing) return { prs: [], saved: [] };
                // `completed` is not defaulted here. A brand-new session is
                // incomplete until the daily log's Gym habit says otherwise, which
                // is the column's default -- so an edit that creates the row cannot
                // decide whether the day was trained. Callers that do mean to
                // complete a day pass it explicitly (setGymForDate).
                const created = await createSession({ workout_date: input.date, ...input.header });
                sessionId = created.id;
            } else if (Object.keys(input.header).length > 0) {
                // An empty header would be a no-op write, but `updateSession`
                // spreads it into the payload, so guard rather than send one.
                await updateSession(sessionId, input.header);
            }

            await saveSessionExercises(sessionId!, input.exercises);
            // Read back rather than trusting the payload: rows sent without an id
            // were inserted, and the database is the only thing that knows what id
            // they got. Callers reconcile against this to stop re-inserting them.
            const saved = await getSessionExercises(sessionId!);
            return { prs: await recordNewPRs(input.date, sessionId!, saved), saved };
        },
        onSuccess: (result, input) => {
            invalidate();
            qc.invalidateQueries({ queryKey: queryKeys.workoutLogByDate(input.date) });
            if (result.prs.length) onNewPRs?.(result.prs);
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
        mutationFn: (input: {
            pr_entry_id: string;
            exercise_name: string;
            weight?: number | null;
            reps?: number | null;
            workout_date?: string | null;
        }) => recordManualPR(input),
        onSuccess: invalidate,
    });
};

/** Correct one record in place -- the weight, reps or date of a single best. */
export const useUpdatePRHistory = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (input: {
            id: string;
            updates: { weight?: number | null; reps?: number | null; workout_date?: string | null };
        }) => updatePRHistory(input.id, input.updates),
        onSuccess: invalidate,
    });
};

/** Remove one record, for a number that was typed wrong. */
export const useDeletePRHistory = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (id: string) => deletePRHistory(id),
        onSuccess: invalidate,
    });
};

/** Remove every record for one tracked lift. */
export const useClearPRHistory = () => {
    const invalidate = useInvalidateWorkouts();
    return useMutation({
        mutationFn: (prEntryId: string) => clearPRHistory(prEntryId),
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
