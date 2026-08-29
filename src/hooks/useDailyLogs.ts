import { useEffect, useState } from 'react';
import { getUserDailyLogs } from '../services/dailyLogService';
import type { DailyLog } from '../services/dailyLogService';

export const useDailyLogs = (): { logs: DailyLog[] | null } => {
    const [logs, setLogs] = useState<DailyLog[] | null>(null);

    useEffect(() => {
        let active = true;
        getUserDailyLogs().then(data => {
            if (active) setLogs(data);
        });
        return () => {
            active = false;
        };
    }, []);

    return { logs };
};