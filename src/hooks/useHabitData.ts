import { useQuery } from '@tanstack/react-query';
import { getUserHabits, getAllHabitLogs } from '../services/habitService';
import type { Habit, DailyHabitLog } from '../services/habitService';
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
