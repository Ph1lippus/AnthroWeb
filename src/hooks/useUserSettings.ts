import { useQuery } from '@tanstack/react-query';
import { getUserSettings } from '../services/profileService';
import type { UserSettings } from '../services/profileService';
import { queryKeys } from '../utils/queryKeys';

export const useUserSettings = (): { settings: UserSettings | null } => {
    const { data } = useQuery({
        queryKey: queryKeys.userSettings,
        queryFn: getUserSettings,
    });
    return { settings: data ?? null };
};