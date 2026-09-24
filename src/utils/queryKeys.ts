// Central React Query keys so pages can share, invalidate, and prefetch the
// same cached data (dashboard, daily log, history) without duplicating strings.
export const queryKeys = {
    dailyLogs: ['daily-logs'] as const,
    dailyLogByDate: (date: string) => ['daily-log', date] as const,
    completedHabits: (date: string) => ['completed-habits', date] as const,
    habits: ['habits'] as const,
    habitLogs: ['habit-logs'] as const,
    userSettings: ['user-settings'] as const,
};
