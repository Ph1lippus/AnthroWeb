export type DailyLogNavAction = 'prev' | 'today' | 'next';

type Listener = (action: DailyLogNavAction) => void;

const listeners = new Set<Listener>();

// Subscribe to daily-log day navigation events fired from the primary navbar.
export const subscribeDailyLogNav = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export const publishDailyLogNav = (action: DailyLogNavAction): void => {
    listeners.forEach(listener => listener(action));
};