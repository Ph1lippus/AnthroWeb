import { useQuery } from '@tanstack/react-query';
import { getUserBooks } from '../services/bookService';
import {
    getUserAcademicCourses,
    getUserAcademicItems,
    getUserStudySessions,
} from '../services/academicService';
import { getUserAbstinenceGoals, getUserAbstinenceHistory } from '../services/abstinenceService';
import { queryKeys } from '../utils/queryKeys';

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
        isLoading: [
            books,
            courses,
            academicItems,
            studySessions,
            goals,
            history,
        ].some(query => query.isLoading),
    };
};
