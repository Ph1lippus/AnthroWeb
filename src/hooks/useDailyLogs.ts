import { useQuery } from '@tanstack/react-query';
import { getUserDailyLogs } from '../services/dailyLogService';
import type { DailyLog } from '../services/dailyLogService';
import { queryKeys } from '../utils/queryKeys';

export const useDailyLogs = (): { logs: DailyLog[] | null } => {
    const { data } = useQuery({
        queryKey: queryKeys.dailyLogs,
        queryFn: getUserDailyLogs,
    });
    return { logs: data ?? null };
};