import { useQuery } from '@tanstack/react-query';
import { getUserBooks } from '../services/bookService';
import {
    getUserAcademicCourses,
    getUserAcademicItems,
    getUserStudySessions,
} from '../services/academicService';
import { getUserAbstinenceGoals, getUserAbstinenceHistory } from '../services/abstinenceService';
import { queryKeys } from '../utils/queryKeys';

/** One flag per card, so a slow query cannot hold up a card that does not need it. */
export interface DashboardExtrasPending {
    reading: boolean;
    academics: boolean;
    courses: boolean;
    study: boolean;
    abstinence: boolean;
    streak: boolean;
}

export const useDashboardExtras = () => {
    const books = useQuery({ queryKey: queryKeys.books, queryFn: getUserBooks, staleTime: 30_000 });
    const courses = useQuery({ queryKey: queryKeys.academicCourses, queryFn: getUserAcademicCourses, staleTime: 30_000 });
    const academicItems = useQuery({ queryKey: queryKeys.academicItems, queryFn: getUserAcademicItems, staleTime: 30_000 });
    const studySessions = useQuery({ queryKey: queryKeys.studySessions, queryFn: getUserStudySessions, staleTime: 30_000 });
    const goals = useQuery({ queryKey: queryKeys.abstinenceGoals, queryFn: getUserAbstinenceGoals, staleTime: 30_000 });
    const history = useQuery({ queryKey: queryKeys.abstinenceHistory, queryFn: getUserAbstinenceHistory, staleTime: 30_000 });

    return {
        books: books.data ?? [],
        courses: courses.data ?? [],
        academicItems: academicItems.data ?? [],
        studySessions: studySessions.data ?? [],
        abstinenceGoals: goals.data ?? [],
        abstinenceHistory: history.data ?? [],
        // Per card, not one flag for the lot. A single `some(isLoading)` made the
        // slowest of the six hold all six at their placeholder until it landed, so
        // the row filled in as one block at the end rather than as each answer
        // arrived -- which is what made it look like the row was loading while the
        // row above it had finished.
        pending: {
            reading: books.isLoading,
            academics: books.isLoading,
            courses: courses.isLoading || academicItems.isLoading,
            study: studySessions.isLoading,
            abstinence: goals.isLoading,
            streak: history.isLoading,
        } satisfies DashboardExtrasPending,
    };
};
