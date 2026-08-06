import { create } from 'zustand';
import {
    getWorkoutTemplates,
    getWorkoutTemplate,
    getWorkoutTemplateDays,
    createWorkoutTemplate,
    updateWorkoutTemplate,
    deleteWorkoutTemplate,
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
    getPRHistory,
    createPR as createPRService,
    getTodayWorkoutExercises,
    isWorkoutCompleted,
    completeWorkout,
    getWorkoutHistory,
    getAllPRs,
    getWorkoutStats,
    duplicateWorkoutTemplate,
    setActiveTemplate,
    getActiveTemplate,
    type WorkoutTemplate,
    type WorkoutTemplateDay,
    type WorkoutCompletionLog,
    type WorkoutExerciseLog,
    type PRHistory,
} from '../services/workoutService';

interface WorkoutStore {
    // State
    templates: WorkoutTemplate[];
    currentTemplate: WorkoutTemplate | null;
    templateExercises: WorkoutTemplateDay[];
    todayExercises: WorkoutTemplateDay[];
    completionLog: WorkoutCompletionLog | null;
    exerciseLogs: WorkoutExerciseLog[];
    prHistory: PRHistory[];
    workoutHistory: WorkoutCompletionLog[];
    activeTemplate: WorkoutTemplate | null;
    loading: boolean;
    error: string | null;

    // Template actions
    fetchTemplates: () => Promise<void>;
    fetchTemplate: (id: string) => Promise<void>;
    fetchTemplateExercises: (templateId: string) => Promise<void>;
    createTemplate: (template: { name: string; description?: string; is_active?: boolean }) => Promise<void>;
    updateTemplate: (id: string, updates: Partial<WorkoutTemplate>) => Promise<void>;
    deleteTemplate: (id: string) => Promise<void>;
    duplicateTemplate: (id: string) => Promise<void>;
    setActiveTemplate: (id: string) => Promise<void>;
    fetchActiveTemplate: () => Promise<void>;

    // Exercise actions
    fetchTodayExercises: () => Promise<void>;
    addExercise: (exercise: Omit<WorkoutTemplateDay, 'id' | 'created_at'>) => Promise<void>;
    updateExercise: (id: string, updates: Partial<WorkoutTemplateDay>) => Promise<void>;
    deleteExercise: (id: string) => Promise<void>;

    // Workout completion actions
    fetchCompletionLog: (date: string) => Promise<void>;
    createCompletionLog: (log: Omit<WorkoutCompletionLog, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<WorkoutCompletionLog | null>;
    updateCompletionLog: (id: string, updates: Partial<WorkoutCompletionLog>) => Promise<void>;
    completeWorkout: (date: string, completionId: string, intensity?: number, notes?: string) => Promise<void>;
    checkWorkoutCompleted: (date: string) => Promise<boolean>;

    // Exercise log actions
    fetchExerciseLogs: (completionId: string) => Promise<void>;
    createExerciseLog: (log: Omit<WorkoutExerciseLog, 'id' | 'user_id' | 'created_at'>) => Promise<WorkoutExerciseLog | null>;
    updateExerciseLog: (id: string, updates: Partial<WorkoutExerciseLog>) => Promise<void>;
    deleteExerciseLog: (id: string) => Promise<void>;

    // PR actions
    fetchPRHistory: (exerciseName: string) => Promise<void>;
    fetchAllPRs: () => Promise<void>;
    createPR: (pr: Omit<PRHistory, 'id' | 'user_id' | 'created_at'>) => Promise<PRHistory | null>;
    detectPR: (exerciseName: string, weight: number, reps: number) => Promise<boolean>;

    // History and stats
    fetchWorkoutHistory: (limit?: number) => Promise<void>;
    fetchWorkoutStats: (startDate: string, endDate: string) => Promise<any>;

    // Utility
    clearError: () => void;
    reset: () => void;
}

const initialState = {
    templates: [],
    currentTemplate: null,
    templateExercises: [],
    todayExercises: [],
    completionLog: null,
    exerciseLogs: [],
    prHistory: [],
    workoutHistory: [],
    activeTemplate: null,
    loading: false,
    error: null,
};

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
    ...initialState,

    // Template actions
    fetchTemplates: async () => {
        set({ loading: true, error: null });
        try {
            const templates = await getWorkoutTemplates();
            set({ templates, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch templates', loading: false });
            console.error('Error fetching templates:', error);
        }
    },

    fetchTemplate: async (id: string) => {
        set({ loading: true, error: null });
        try {
            const template = await getWorkoutTemplate(id);
            set({ currentTemplate: template, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch template', loading: false });
            console.error('Error fetching template:', error);
        }
    },

    fetchTemplateExercises: async (templateId: string) => {
        set({ loading: true, error: null });
        try {
            const exercises = await getWorkoutTemplateDays(templateId);
            set({ templateExercises: exercises, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch template exercises', loading: false });
            console.error('Error fetching template exercises:', error);
        }
    },

    createTemplate: async (template) => {
        set({ loading: true, error: null });
        try {
            await createWorkoutTemplate(template);
            await get().fetchTemplates();
            set({ loading: false });
        } catch (error) {
            set({ error: 'Failed to create template', loading: false });
            console.error('Error creating template:', error);
            throw error;
        }
    },

    updateTemplate: async (id, updates) => {
        set({ loading: true, error: null });
        try {
            await updateWorkoutTemplate(id, updates);
            await get().fetchTemplates();
            if (get().currentTemplate?.id === id) {
                await get().fetchTemplate(id);
            }
            set({ loading: false });
        } catch (error) {
            set({ error: 'Failed to update template', loading: false });
            console.error('Error updating template:', error);
            throw error;
        }
    },

    deleteTemplate: async (id) => {
        set({ loading: true, error: null });
        try {
            await deleteWorkoutTemplate(id);
            await get().fetchTemplates();
            set({ loading: false });
        } catch (error) {
            set({ error: 'Failed to delete template', loading: false });
            console.error('Error deleting template:', error);
            throw error;
        }
    },

    duplicateTemplate: async (id) => {
        set({ loading: true, error: null });
        try {
            await duplicateWorkoutTemplate(id);
            await get().fetchTemplates();
            set({ loading: false });
        } catch (error) {
            set({ error: 'Failed to duplicate template', loading: false });
            console.error('Error duplicating template:', error);
            throw error;
        }
    },

    setActiveTemplate: async (id) => {
        set({ loading: true, error: null });
        try {
            await setActiveTemplate(id);
            await get().fetchTemplates();
            await get().fetchActiveTemplate();
            set({ loading: false });
        } catch (error) {
            set({ error: 'Failed to set active template', loading: false });
            console.error('Error setting active template:', error);
            throw error;
        }
    },

    fetchActiveTemplate: async () => {
        set({ loading: true, error: null });
        try {
            const template = await getActiveTemplate();
            set({ activeTemplate: template, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch active template', loading: false });
            console.error('Error fetching active template:', error);
        }
    },

    // Exercise actions
    fetchTodayExercises: async () => {
        set({ loading: true, error: null });
        try {
            const exercises = await getTodayWorkoutExercises();
            set({ todayExercises: exercises, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch today exercises', loading: false });
            console.error('Error fetching today exercises:', error);
        }
    },

    addExercise: async (exercise) => {
        set({ loading: true, error: null });
        try {
            await createWorkoutTemplateDay(exercise);
            if (exercise.workout_template_id) {
                await get().fetchTemplateExercises(exercise.workout_template_id);
            }
            set({ loading: false });
        } catch (error) {
            set({ error: 'Failed to add exercise', loading: false });
            console.error('Error adding exercise:', error);
            throw error;
        }
    },

    updateExercise: async (id, updates) => {
        set({ loading: true, error: null });
        try {
            await updateWorkoutTemplateDay(id, updates);
            const { templateExercises } = get();
            set({
                templateExercises: templateExercises.map(ex => 
                    ex.id === id ? { ...ex, ...updates } : ex
                ),
                loading: false
            });
        } catch (error) {
            set({ error: 'Failed to update exercise', loading: false });
            console.error('Error updating exercise:', error);
            throw error;
        }
    },

    deleteExercise: async (id) => {
        set({ loading: true, error: null });
        try {
            await deleteWorkoutTemplateDay(id);
            const { templateExercises } = get();
            set({
                templateExercises: templateExercises.filter(ex => ex.id !== id),
                loading: false
            });
        } catch (error) {
            set({ error: 'Failed to delete exercise', loading: false });
            console.error('Error deleting exercise:', error);
            throw error;
        }
    },

    // Workout completion actions
    fetchCompletionLog: async (date) => {
        set({ loading: true, error: null });
        try {
            const log = await getWorkoutCompletionLog(date);
            set({ completionLog: log, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch completion log', loading: false });
            console.error('Error fetching completion log:', error);
        }
    },

    createCompletionLog: async (log) => {
        set({ loading: true, error: null });
        try {
            const newLog = await createWorkoutCompletionLog(log);
            set({ completionLog: newLog, loading: false });
            return newLog;
        } catch (error) {
            set({ error: 'Failed to create completion log', loading: false });
            console.error('Error creating completion log:', error);
            return null;
        }
    },

    updateCompletionLog: async (id, updates) => {
        set({ loading: true, error: null });
        try {
            const updatedLog = await updateWorkoutCompletionLog(id, updates);
            set({ completionLog: updatedLog, loading: false });
        } catch (error) {
            set({ error: 'Failed to update completion log', loading: false });
            console.error('Error updating completion log:', error);
            throw error;
        }
    },

    completeWorkout: async (date, completionId, intensity, notes) => {
        set({ loading: true, error: null });
        try {
            await completeWorkout(date, completionId, intensity, notes);
            await get().fetchCompletionLog(date);
            await get().fetchWorkoutHistory();
            set({ loading: false });
        } catch (error) {
            set({ error: 'Failed to complete workout', loading: false });
            console.error('Error completing workout:', error);
            throw error;
        }
    },

    checkWorkoutCompleted: async (date) => {
        try {
            return await isWorkoutCompleted(date);
        } catch (error) {
            console.error('Error checking workout completion:', error);
            return false;
        }
    },

    // Exercise log actions
    fetchExerciseLogs: async (completionId) => {
        set({ loading: true, error: null });
        try {
            const logs = await getWorkoutExerciseLogs(completionId);
            set({ exerciseLogs: logs, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch exercise logs', loading: false });
            console.error('Error fetching exercise logs:', error);
        }
    },

    createExerciseLog: async (log) => {
        set({ loading: true, error: null });
        try {
            const newLog = await createWorkoutExerciseLog(log);
            set({ 
                exerciseLogs: [...get().exerciseLogs, newLog],
                loading: false 
            });
            return newLog;
        } catch (error) {
            set({ error: 'Failed to create exercise log', loading: false });
            console.error('Error creating exercise log:', error);
            return null;
        }
    },

    updateExerciseLog: async (id, updates) => {
        set({ loading: true, error: null });
        try {
            await updateWorkoutExerciseLog(id, updates);
            const { exerciseLogs } = get();
            set({
                exerciseLogs: exerciseLogs.map(log => 
                    log.id === id ? { ...log, ...updates } : log
                ),
                loading: false
            });
        } catch (error) {
            set({ error: 'Failed to update exercise log', loading: false });
            console.error('Error updating exercise log:', error);
            throw error;
        }
    },

    deleteExerciseLog: async (id) => {
        set({ loading: true, error: null });
        try {
            await deleteWorkoutExerciseLog(id);
            const { exerciseLogs } = get();
            set({
                exerciseLogs: exerciseLogs.filter(log => log.id !== id),
                loading: false
            });
        } catch (error) {
            set({ error: 'Failed to delete exercise log', loading: false });
            console.error('Error deleting exercise log:', error);
            throw error;
        }
    },

    // PR actions
    fetchPRHistory: async (exerciseName) => {
        set({ loading: true, error: null });
        try {
            const prs = await getPRHistory(exerciseName);
            set({ prHistory: prs, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch PR history', loading: false });
            console.error('Error fetching PR history:', error);
        }
    },

    fetchAllPRs: async () => {
        set({ loading: true, error: null });
        try {
            const prs = await getAllPRs();
            set({ prHistory: prs, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch all PRs', loading: false });
            console.error('Error fetching all PRs:', error);
        }
    },

    createPR: async (pr) => {
        set({ loading: true, error: null });
        try {
            const newPR = await createPRService(pr);
            if (newPR) {
                set({ prHistory: [...get().prHistory, newPR], loading: false });
            }
            return newPR;
        } catch (error) {
            set({ error: 'Failed to create PR', loading: false });
            console.error('Error creating PR:', error);
            return null;
        }
    },

    detectPR: async (exerciseName, weight, reps) => {
        try {
            const existingPRs = await getPRHistory(exerciseName);
            
            // Check if this is a new PR (higher weight with same or more reps, or same weight with more reps)
            const isPR = existingPRs.every(pr => 
                !pr.weight || !pr.reps || 
                (weight > (pr.weight || 0) && reps >= (pr.reps || 0)) ||
                (weight >= (pr.weight || 0) && reps > (pr.reps || 0))
            );
            
            // If no existing PRs, this is automatically a PR
            if (existingPRs.length === 0) {
                return true;
            }
            
            return isPR;
        } catch (error) {
            console.error('Error detecting PR:', error);
            return false;
        }
    },

    // History and stats
    fetchWorkoutHistory: async (limit = 30) => {
        set({ loading: true, error: null });
        try {
            const history = await getWorkoutHistory(limit);
            set({ workoutHistory: history, loading: false });
        } catch (error) {
            set({ error: 'Failed to fetch workout history', loading: false });
            console.error('Error fetching workout history:', error);
        }
    },

    fetchWorkoutStats: async (startDate, endDate) => {
        set({ loading: true, error: null });
        try {
            const stats = await getWorkoutStats(startDate, endDate);
            set({ loading: false });
            return stats;
        } catch (error) {
            set({ error: 'Failed to fetch workout stats', loading: false });
            console.error('Error fetching workout stats:', error);
            return null;
        }
    },

    // Utility
    clearError: () => set({ error: null }),

    reset: () => set(initialState),
}));