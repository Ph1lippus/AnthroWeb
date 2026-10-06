import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUserHabits, getAllHabitLogs, updateHabit } from '../services/habitService';
import type { Habit, DailyHabitLog, HabitUpdate } from '../services/habitService';
import { queryKeys } from '../utils/queryKeys';

export const useHabitData = (): {
    habits: Habit[] | null;
    habitLogs: DailyHabitLog[] | null;
    isLoading: boolean;
} => {
    const { data: habits, isLoading: habitsLoading } = useQuery({
        queryKey: queryKeys.habits,
        queryFn: getUserHabits,
        staleTime: 30_000,
    });
    const { data: habitLogs, isLoading: logsLoading } = useQuery({
        queryKey: queryKeys.habitLogs,
        queryFn: getAllHabitLogs,
        staleTime: 30_000,
    });

    return {
        habits: habits ?? null,
        habitLogs: habitLogs ?? null,
        isLoading: habitsLoading || logsLoading,
    };
};

/**
 * Renaming a custom habit, or changing what it says it is.
 *
 * Separate from the daily log's own list, which it does not read: that page loads
 * its habits directly (see `DailyLogPage`) so they are visible before the log's
 * settings have arrived. Invalidating the query rather than patching it is what
 * keeps the two in step -- the dashboard chart reads the same query, so its labels
 * change on the next paint after the write lands.
 *
 * A failure is left to the caller to show. The one failure worth a message is a
 * name that is already taken, and that reads better as a sentence attached to the
 * field being edited than as a toast about a row.
 */
export const useUpdateHabit = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: HabitUpdate }) =>
            updateHabit(id, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.habits });
        },
    });
};
