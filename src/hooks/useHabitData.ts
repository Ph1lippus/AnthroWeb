import { useEffect, useState } from 'react';
import { getUserHabits, getAllHabitLogs } from '../services/habitService';
import type { Habit, DailyHabitLog } from '../services/habitService';

export const useHabitData = (): {
    habits: Habit[] | null;
    habitLogs: DailyHabitLog[] | null;
} => {
    const [habits, setHabits] = useState<Habit[] | null>(null);
    const [habitLogs, setHabitLogs] = useState<DailyHabitLog[] | null>(null);

    useEffect(() => {
        let active = true;
        Promise.all([getUserHabits(), getAllHabitLogs()]).then(([h, hl]) => {
            if (!active) return;
            setHabits(h);
            setHabitLogs(hl);
        });
        return () => {
            active = false;
        };
    }, []);

    return { habits, habitLogs };
};