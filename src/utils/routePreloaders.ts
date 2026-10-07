import type { ComponentType } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

type PageModule = { default: ComponentType };
type PageLoader = () => Promise<PageModule>;

export const pageLoaders: Record<string, PageLoader> = {
    '/Dashboard': () => import('../Pages/DashboardPage'),
    '/Daily-Log': () => import('../Pages/DailyLogPage'),
    '/Daily-Log/Setup': () => import('../Pages/DailyLogGoalSetupPage'),
    '/Daily-Log/History': () => import('../Pages/DailyLogHistoryPage'),
    '/Journal': () => import('../Pages/JournalPage'),
    '/Journal/Edit': () => import('../Pages/JournalEditPage'),
    '/Mind-Charts': () => import('../Pages/MindChartsPage'),
    '/Measurements': () => import('../Pages/MeasurementsPage'),
    '/Books': () => import('../Pages/BooksPage'),
    '/Workouts': () => import('../Pages/WorkoutsPage'),
    '/Projects': () => import('../Pages/ProjectsPage'),
    '/Abstinence': () => import('../Pages/AbstinencePage'),
    '/Academic': () => import('../Pages/AcademicPage'),
    '/Study-Timer': () => import('../Pages/StudyTimerPage'),
    '/Notes': () => import('../Pages/NotesPage'),
    '/Settings': () => import('../Pages/SettingsPage'),
    '/Settings/App': () => import('../Pages/AppPage'),
    '/Settings/Account': () => import('../Pages/AccountPage'),
    '/Profile': () => import('../Pages/ProfilePage'),
    '/Profile/Edit': () => import('../Pages/EditProfilePage'),
    '/credits': () => import('../Pages/CreditsPage'),
    '/privacy-policy': () => import('../Pages/PrivacyPolicyPage'),
    '/terms-of-service': () => import('../Pages/TermsOfServicePage'),
};

const preloaded = new Map<string, Promise<PageModule>>();

export const isRoutePreloaded = (path: string): boolean => {
    const basePath = path.replace(/\/[^/]+$/, '') || path;
    const cacheKey = pageLoaders[path] ? path : basePath;
    return preloaded.has(cacheKey);
};

type DataLoader = {
    key: readonly unknown[];
    load: () => Promise<unknown>;
};

const dataLoaders: Record<string, DataLoader[]> = {
    '/Dashboard': [
        { key: queryKeys.dailyLogs, load: () => import('../services/dailyLogService').then(module => module.getUserDailyLogs()) },
        { key: queryKeys.habits, load: () => import('../services/habitService').then(module => module.getUserHabits()) },
        { key: queryKeys.habitLogs, load: () => import('../services/habitService').then(module => module.getAllHabitLogs()) },
        { key: queryKeys.userSettings, load: () => import('../services/profileService').then(module => module.getUserSettings()) },
    ],
    '/Daily-Log': [
        { key: queryKeys.userSettings, load: () => import('../services/profileService').then(module => module.getUserSettings()) },
        { key: queryKeys.habits, load: () => import('../services/habitService').then(module => module.getUserHabits()) },
    ],
    '/Measurements': [
        { key: queryKeys.bodyMeasurements, load: () => import('../services/measurementService').then(module => module.getBodyMeasurements()) },
    ],
    '/Notes': [
        { key: queryKeys.notes, load: () => import('../services/noteService').then(module => module.getUserNotes()) },
    ],
    // The mind charts are drawn entirely from the daily-log list, which the
    // dashboard has already asked for. Prefetching it here is what makes opening
    // the page instant rather than a spinner over an empty graph.
    '/Mind-Charts': [
        { key: queryKeys.dailyLogs, load: () => import('../services/dailyLogService').then(module => module.getUserDailyLogs()) },
    ],
    '/Academic': [
        { key: queryKeys.academicSemesters, load: () => import('../services/academicService').then(module => module.getUserAcademicSemesters()) },
        { key: queryKeys.academicCourses, load: () => import('../services/academicService').then(module => module.getUserAcademicCourses()) },
        { key: queryKeys.academicItems, load: () => import('../services/academicService').then(module => module.getUserAcademicItems()) },
        { key: queryKeys.gpaScales, load: () => import('../services/academicService').then(module => module.ensureDefaultGpaScales()) },
    ],
};

export const preloadRoute = (path: string, queryClient?: QueryClient): void => {
    const basePath = path.replace(/\/[^/]+$/, '') || path;
    const loader = pageLoaders[path] ?? pageLoaders[basePath];
    const cacheKey = pageLoaders[path] ? path : basePath;
    if (!loader || preloaded.has(cacheKey)) return;

    const promise = loader();
    preloaded.set(cacheKey, promise);
    void promise.catch(() => {
        preloaded.delete(cacheKey);
    });

    if (queryClient) {
        for (const dataLoader of dataLoaders[basePath] ?? []) {
            void queryClient.prefetchQuery({
                queryKey: dataLoader.key,
                queryFn: dataLoader.load,
            });
        }
    }
};
