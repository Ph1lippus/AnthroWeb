import { useQuery } from '@tanstack/react-query';
import { getUserHabits, getAllHabitLogs } from '../services/habitService';
import type { Habit, DailyHabitLog } from '../services/habitService';
import { queryKeys } from '../utils/queryKeys';

export const useHabitData = (): {
    habits: Habit[] | null;
    habitLogs: DailyHabitLog[] | null;
} => {
    const { data: habits } = useQuery({
        queryKey: queryKeys.habits,
        queryFn: getUserHabits,
    });
    const { data: habitLogs } = useQuery({
        queryKey: queryKeys.habitLogs,
        queryFn: getAllHabitLogs,
    });

    return { habits: habits ?? null, habitLogs: habitLogs ?? null };
};