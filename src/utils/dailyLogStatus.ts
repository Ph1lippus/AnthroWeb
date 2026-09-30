import { useSyncExternalStore } from 'react';

export type DailyLogSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface DailyLogSaveState {
    status: DailyLogSaveStatus;
    /** Timestamp of the last successful save, or null before the first one. */
    savedAt: Date | null;
    /** Human-readable reason the last save failed, or null. */
    error: string | null;
    /** The day the status refers to, so the navbar can label it. */
    date: string | null;
}

const INITIAL_STATE: DailyLogSaveState = {
    status: 'idle',
    savedAt: null,
    error: null,
    date: null,
};

/**
 * Single source of truth for the daily log's save indicator. The page owns the
 * save lifecycle but it renders far below the fold, so the status is published
 * here and read by the primary navbar instead.
 */
let state: DailyLogSaveState = INITIAL_STATE;
const listeners = new Set<() => void>();

const emit = () => {
    listeners.forEach(listener => listener());
};

export const publishDailyLogSaveState = (next: DailyLogSaveState) => {
    if (next === state) return;
    state = next;
    emit();
};

/** Reset to the pre-first-save state; called when the page unmounts. */
export const resetDailyLogSaveState = () => publishDailyLogSaveState(INITIAL_STATE);

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = () => state;

// Module state never changes between server and client render, so the server
// snapshot is the same object. Keeps `useSyncExternalStore` from re-rendering.
const getServerSnapshot = () => state;

export const useDailyLogSaveState = (): DailyLogSaveState =>
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
