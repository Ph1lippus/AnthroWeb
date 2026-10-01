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
    // Notes. The single-note entry is invalidated on every autosave tick, so the
    // list query is invalidated alongside it to keep the "last edited" ordering
    // and the card previews honest.
    notes: ['notes'] as const,
    note: (id: string) => ['note', id] as const,
    // Academic
    academicSemesters: ['academic-semesters'] as const,
    academicCourses: ['academic-courses'] as const,
    academicItems: ['academic-items'] as const,
    academicGoals: ['academic-goals'] as const,
    studySessions: ['study-sessions'] as const,
    gpaScales: ['gpa-scales'] as const,
    // Derived from courses + items, so it is invalidated whenever either is.
    academicAlerts: ['academic-alerts'] as const,
} as const;