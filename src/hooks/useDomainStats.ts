import { useQuery } from '@tanstack/react-query';
import { getUserProjects } from '../services/projectService';
import { getUserBooks } from '../services/bookService';
import { getUserAbstinenceGoals, getUserAbstinenceHistory } from '../services/abstinenceService';
import { queryKeys } from '../utils/queryKeys';

/**
 * The numbers behind the dashboard's second stats row: projects, reading and
 * abstinence, the strips that used to sit on top of their own pages.
 *
 * Kept apart from the daily-log queries on purpose. None of these are scoped by
 * the range pills -- they are lifetime totals -- and none of them may hold up
 * the dashboard: each card renders its own `--` until its query lands.
 *
 * `staleTime: 0` rather than the 30s the older extras hook used. The Projects,
 * Books and Abstinence pages manage their data in local state, so a mutation
 * there invalidates nothing; always refetching on mount is what stops the
 * dashboard showing the counts as they were before the last edit.
 */
export interface DomainStatsPending {
    projects: boolean;
    books: boolean;
    abstinenceGoals: boolean;
    abstinenceHistory: boolean;
}

export const useDomainStats = () => {
    const projects = useQuery({ queryKey: queryKeys.projects, queryFn: getUserProjects, staleTime: 0 });
    const books = useQuery({ queryKey: queryKeys.books, queryFn: getUserBooks, staleTime: 0 });
    const goals = useQuery({ queryKey: queryKeys.abstinenceGoals, queryFn: getUserAbstinenceGoals, staleTime: 0 });
    const history = useQuery({ queryKey: queryKeys.abstinenceHistory, queryFn: getUserAbstinenceHistory, staleTime: 0 });

    return {
        projects: projects.data ?? [],
        books: books.data ?? [],
        abstinenceGoals: goals.data ?? [],
        abstinenceHistory: history.data ?? [],
        pending: {
            projects: projects.isLoading,
            books: books.isLoading,
            abstinenceGoals: goals.isLoading,
            abstinenceHistory: history.isLoading,
        } satisfies DomainStatsPending,
    };
};
