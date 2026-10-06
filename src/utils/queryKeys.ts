// Central React Query keys so pages can share, invalidate, and prefetch the
// same cached data (dashboard, daily log, history) without duplicating strings.
// Roots, so a mutation can invalidate a family of keys without knowing which
// arguments the components happened to query with.
const workoutSessionsRoot = ['workout-sessions'] as const;
const workoutPlanRoot = ['workout-plan'] as const;
const templateExercisesRoot = ['workout-template-exercises'] as const;
const workoutExercisesRoot = ['workout-exercises'] as const;

export const queryKeys = {
    dailyLogs: ['daily-logs'] as const,
    dailyLogByDate: (date: string) => ['daily-log', date] as const,
    completedHabits: (date: string) => ['completed-habits', date] as const,
    habits: ['habits'] as const,
    habitLogs: ['habit-logs'] as const,
    userSettings: ['user-settings'] as const,
    // Workouts
    workoutTemplates: ['workout-templates'] as const,
    workoutTemplate: (id: string) => ['workout-template', id] as const,
    workoutPlanRoot,
    workoutPlan: (dayOfWeek: number) => [...workoutPlanRoot, dayOfWeek] as const,
    workoutTemplateExercisesRoot: templateExercisesRoot,
    workoutTemplateExercises: (id: string) => [...templateExercisesRoot, id] as const,
    workoutTemplateSessions: (id: string) => ['workout-template-sessions', id] as const,
    workoutSessionsRoot,
    /** Every session in a window, exercises attached, in two queries. */
    workoutSessions: (from: string, to: string) => [...workoutSessionsRoot, from, to] as const,
    workoutLogs: ['workout-logs'] as const,
    workoutLogByDate: (date: string) => ['workout-log', date] as const,
    workoutExercisesRoot,
    workoutExercises: (completionId: string) => [...workoutExercisesRoot, completionId] as const,
    workoutPRs: ['workout-prs'] as const,
    workoutPREntries: ['workout-pr-entries'] as const,
    exerciseLibrary: ['exercise-library'] as const,
    // Measurements
    bodyMeasurements: ['body-measurements'] as const,
    bodyMeasurementByDate: (date: string) => ['body-measurement', date] as const,
    latestMeasurement: ['latest-measurement'] as const,
    // Notes. The single-note entry is invalidated on every autosave tick, so the
    // list query is invalidated alongside it to keep the "last edited" ordering
    // and the card previews honest.
    notes: ['notes'] as const,
    note: (id: string) => ['note', id] as const,
    // Kept apart from `notes` because one is live pages and the other is the
    // trash; invalidating one must not refetch or empty the other.
    trashedNotes: ['trashed-notes'] as const,
    // Academic
    academicSemesters: ['academic-semesters'] as const,
    academicCourses: ['academic-courses'] as const,
    academicItems: ['academic-items'] as const,
    academicGoals: ['academic-goals'] as const,
    studySessions: ['study-sessions'] as const,
    gpaScales: ['gpa-scales'] as const,
    // Derived from courses + items, so it is invalidated whenever either is.
    academicAlerts: ['academic-alerts'] as const,
    books: ['books'] as const,
    abstinenceGoals: ['abstinence-goals'] as const,
    abstinenceHistory: ['abstinence-history'] as const,
} as const;