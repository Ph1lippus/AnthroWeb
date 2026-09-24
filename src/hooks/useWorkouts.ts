import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getWorkoutTemplates,
    getWorkoutTemplate,
    getWorkoutTemplateDays,
    getWorkoutTemplateDaysByDay,
    createWorkoutTemplate,
    updateWorkoutTemplate,
    deleteWorkoutTemplate,
    duplicateWorkoutTemplate,
    setActiveTemplate,
    createWorkoutTemplateDay,
    updateWorkoutTemplateDay,
    deleteWorkoutTemplateDay,
    getWorkoutCompletionLog,
    createWorkoutCompletionLog,
    updateWorkoutCompletionLog,
    getWorkoutExerciseLogs,
    createWorkoutExerciseLog,
    updateWorkoutExerciseLog,
    deleteWorkoutExerciseLog,
    getAllPRs,
    createPR,
    getWorkoutHistory,
    getWorkoutHistoryWithVolume,
    type WorkoutTemplate,
    type WorkoutTemplateDay,
    type WorkoutCompletionLog,
    type PRHistory,
} from '../services/workoutService';
import { queryKeys } from '../utils/queryKeys';

export const useWorkoutTemplates = () => {
    return useQuery({
        queryKey: queryKeys.workoutTemplates,
        queryFn: async () => {
            const templates = await getWorkoutTemplates();
            const withDays = await Promise.all(
                templates.map(async t => ({
                    ...t,
                    days: await getWorkoutTemplateDays(t.id!),
                }))
            );
            return withDays;
        },
    });
};

export const useActiveTemplate = () => {
    const { data } = useWorkoutTemplates();
    const active = data?.find(t => t.is_active) ?? null;
    return { activeTemplate: active ?? null, templates: data ?? [] };
};

export const useWorkoutTemplate = (id: string | undefined) => {
    return useQuery({
        queryKey: queryKeys.workoutTemplateDays(id ?? ''),
        queryFn: async () => {
            const template = await getWorkoutTemplate(id!);
            const days = await getWorkoutTemplateDays(id!);
            return { template, days };
        },
        enabled: !!id,
    });
};

export const useWorkoutPlan = (dayOfWeek: number, enabled = true) => {
    return useQuery({
        queryKey: queryKeys.workoutPlan(dayOfWeek),
        queryFn: () => getWorkoutTemplateDaysByDay(dayOfWeek),
        enabled,
    });
};

export const useWorkoutLogs = (limit = 120) => {
    return useQuery({
        queryKey: [...queryKeys.workoutLogs, limit],
        queryFn: () => getWorkoutHistory(limit),
    });
};

export const useWorkoutLogsWithVolume = (limit = 120) => {
    return useQuery({
        queryKey: [...queryKeys.workoutLogs, 'volume', limit],
        queryFn: () => getWorkoutHistoryWithVolume(limit),
    });
};

export const useWorkoutLog = (date: string, enabled = true) => {
    return useQuery({
        queryKey: queryKeys.workoutLogByDate(date),
        queryFn: () => getWorkoutCompletionLog(date),
        enabled,
    });
};

export const useWorkoutExercises = (completionId: string | undefined) => {
    return useQuery({
        queryKey: queryKeys.workoutExercises(completionId ?? ''),
        queryFn: () => getWorkoutExerciseLogs(completionId!),
        enabled: !!completionId,
    });
};

export const usePRs = () => {
    return useQuery({
        queryKey: queryKeys.workoutPRs,
        queryFn: getAllPRs,
    });
};

const invalidateWorkouts = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: queryKeys.workoutTemplates });
    qc.invalidateQueries({ queryKey: queryKeys.workoutLogs });
    qc.invalidateQueries({ queryKey: queryKeys.workoutPRs });
};

// ---- Template mutations ----

export const useCreateWorkoutTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { name: string; description?: string }) =>
            createWorkoutTemplate({ ...input, is_active: false }),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workoutTemplates }),
    });
};

export const useUpdateWorkoutTemplate = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<WorkoutTemplate> }) =>
            updateWorkoutTemplate(id, updates),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplates });
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateDays(vars.id) });
            onDone?.();
        },
    });
};

export const useDeleteWorkoutTemplate = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteWorkoutTemplate(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplates });
            onDone?.();
        },
    });
};

export const useDuplicateWorkoutTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => duplicateWorkoutTemplate(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workoutTemplates }),
    });
};

export const useSetActiveTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => setActiveTemplate(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplates });
            qc.invalidateQueries({ queryKey: ['workout-plan'] });
        },
    });
};

export const useAddWorkoutTemplateDay = (templateId: string) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (day: Omit<WorkoutTemplateDay, 'id' | 'created_at'>) =>
            createWorkoutTemplateDay({ ...day, workout_template_id: templateId }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateDays(templateId) });
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplates });
        },
    });
};

export const useUpdateWorkoutTemplateDay = (templateId: string) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<WorkoutTemplateDay> }) =>
            updateWorkoutTemplateDay(id, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateDays(templateId) });
            qc.invalidateQueries({ queryKey: ['workout-plan'] });
        },
    });
};

export const useDeleteWorkoutTemplateDay = (templateId: string) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteWorkoutTemplateDay(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.workoutTemplateDays(templateId) });
            qc.invalidateQueries({ queryKey: ['workout-plan'] });
        },
    });
};

// ---- Session (completion + exercise log) mutations ----

export const useSaveWorkoutSession = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: {
            date: string;
            log: Omit<WorkoutCompletionLog, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
            exercises: Array<{
                id?: string;
                exercise_name: string;
                sets?: number;
                reps?: number;
                weight?: number;
                done: boolean;
            }>;
        }) => {
            let logId: string | undefined;
            const existing = await getWorkoutCompletionLog(input.date);
            if (existing?.id) {
                await updateWorkoutCompletionLog(existing.id, input.log);
                logId = existing.id;
            } else {
                const created = await createWorkoutCompletionLog(input.log);
                logId = created.id;
            }

            const existingExercises = logId ? await getWorkoutExerciseLogs(logId) : [];
            const existingByName = new Map(existingExercises.map(e => [e.exercise_name, e]));

            for (const ex of input.exercises) {
                const prior = ex.id || existingByName.get(ex.exercise_name)?.id;
                if (ex.done && ex.sets && ex.reps) {
                    const payload = {
                        sets: ex.sets,
                        reps: ex.reps,
                        weight: ex.weight ?? undefined,
                    };
                    if (prior) {
                        await updateWorkoutExerciseLog(prior, payload);
                    } else if (logId) {
                        await createWorkoutExerciseLog({
                            workout_completion_id: logId,
                            exercise_name: ex.exercise_name,
                            ...payload,
                        });
                    }
                } else if (prior) {
                    await deleteWorkoutExerciseLog(prior);
                }
            }
            return logId;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.workoutLogs });
            qc.invalidateQueries({ queryKey: ['workout-exercises'] });
        },
    });
};

export const useCompleteWorkoutSession = (onPr?: (pr: PRHistory) => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: {
            date: string;
            exercises: Array<{ exercise_name: string; weight?: number; reps?: number; done: boolean }>;
        }) => {
            const existing = await getWorkoutCompletionLog(input.date);
            if (existing?.id) {
                await updateWorkoutCompletionLog(existing.id, { completed: true });
            }

            const priorPRs = await getAllPRs();
            const priorByName = new Map<string, PRHistory[]>();
            for (const p of priorPRs) {
                const list = priorByName.get(p.exercise_name) ?? [];
                list.push(p);
                priorByName.set(p.exercise_name, list);
            }

            const prs: PRHistory[] = [];
            for (const ex of input.exercises) {
                if (!ex.done || !ex.weight || !ex.reps) continue;
                const matches = priorByName.get(ex.exercise_name) ?? [];
                const better = matches.every(p =>
                    (ex.weight! > (p.weight || 0) && ex.reps! >= (p.reps || 0)) ||
                    (ex.weight! >= (p.weight || 0) && ex.reps! > (p.reps || 0))
                );
                if (matches.length === 0 || better) {
                    const saved = await createPR({
                        exercise_name: ex.exercise_name,
                        weight: ex.weight,
                        reps: ex.reps,
                        workout_date: input.date,
                    });
                    prs.push(saved);
                }
            }
            return prs;
        },
        onSuccess: (prs) => {
            qc.invalidateQueries({ queryKey: queryKeys.workoutLogs });
            qc.invalidateQueries({ queryKey: queryKeys.workoutPRs });
            prs.forEach(pr => onPr?.(pr));
        },
    });
};

export const useDeleteWorkoutExercise = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteWorkoutExerciseLog(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['workout-exercises'] });
            invalidateWorkouts(qc);
            onDone?.();
        },
    });
};

// Keep the updateWorkoutExerciseLog accessor imported for pages that need it.