// Central React Query keys so pages can share, invalidate, and prefetch the
// same cached data (dashboard, daily log, history) without duplicating strings.
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
    workoutTemplateDays: (id: string) => ['workout-template-days', id] as const,
    workoutPlan: (dayOfWeek: number) => ['workout-plan', dayOfWeek] as const,
    workoutLogs: ['workout-logs'] as const,
    workoutLogByDate: (date: string) => ['workout-log', date] as const,
    workoutExercises: (completionId: string) => ['workout-exercises', completionId] as const,
    workoutPRs: ['workout-prs'] as const,
    // Measurements
    bodyMeasurements: ['body-measurements'] as const,
    bodyMeasurementByDate: (date: string) => ['body-measurement', date] as const,
    latestMeasurement: ['latest-measurement'] as const,
} as const;