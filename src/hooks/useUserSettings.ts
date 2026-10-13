import { useQuery } from '@tanstack/react-query';
import { fetchUserSettings } from '../services/profileService';
import type { UserSettings } from '../services/profileService';
import { queryKeys } from '../utils/queryKeys';

export interface UserSettingsResult {
    settings: UserSettings | null;
    isLoading: boolean;
    /**
     * Whether the last attempt actually failed.
     *
     * Needed because `settings === null` covers two very different situations:
     * a user who genuinely has no settings row, and a request that never
     * completed. Callers that treat null as "not set up yet" -- the daily log
     * redirects to onboarding -- need to tell them apart, because sending someone
     * through onboarding because their connection blipped destroys the goal
     * history they already had.
     */
    isError: boolean;
    refetch: () => void;
}

/**
 * The only caller of `fetchUserSettings`, which throws on failure.
 *
 * Using the throwing variant here and the null-returning one everywhere else is
 * what lets this hook report the difference: React Query has a real error state,
 * so "this user has no settings row" and "the request failed" arrive as two
 * different things. The daily log needs that distinction -- it redirects to
 * onboarding when there are no goals, and sending someone through onboarding
 * because their connection blipped collapses their goal history to one version.
 */
export const useUserSettings = (): UserSettingsResult => {
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: queryKeys.userSettings,
        queryFn: fetchUserSettings,
        staleTime: 30_000,
    });
    return { settings: data ?? null, isLoading, isError, refetch: () => void refetch() };
};