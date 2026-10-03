import { useQuery } from '@tanstack/react-query';
import { getUserSettings } from '../services/profileService';
import type { UserSettings } from '../services/profileService';
import { queryKeys } from '../utils/queryKeys';

export const useUserSettings = (): { settings: UserSettings | null; isLoading: boolean } => {
    const { data, isLoading } = useQuery({
        queryKey: queryKeys.userSettings,
        queryFn: getUserSettings,
        staleTime: 30_000,
    });
    return { settings: data ?? null, isLoading };
};
