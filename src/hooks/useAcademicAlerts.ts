import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../utils/queryKeys';
import { getUserAcademicCourses, getUserAcademicItems } from '../services/academicService';
import { buildAcademicAlerts } from '../utils/academicAlerts';
import type { AcademicAlert } from '../utils/academicAlerts';

/**
 * Deadline alerts for the navbar, grouped into clusters.
 *
 * Both queries are the ones the Academic page already mounts, so React Query
 * serves this straight from the shared cache rather than issuing new requests.
 *
 * Deliberately not gated on the route: a reminder is only useful on the pages
 * where the user is not already looking at their academic work. Marking a test
 * done invalidates the items cache, which re-runs this automatically.
 */
export const useAcademicAlerts = () =>
    useQuery({
        queryKey: [...queryKeys.academicAlerts],
        queryFn: async (): Promise<AcademicAlert[]> => {
            const [courses, items] = await Promise.all([getUserAcademicCourses(), getUserAcademicItems()]);
            return buildAcademicAlerts(courses, items);
        },
        // Deadlines move slowly and the alert text changes only when a date is
        // edited, so there is no reason to re-check this more often.
        staleTime: 5 * 60 * 1000,
    });