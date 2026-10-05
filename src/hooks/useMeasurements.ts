import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getBodyMeasurements,
    getBodyMeasurementByDate,
    getLatestMeasurement,
    saveBodyMeasurement,
    logBodyComposition,
    deleteBodyMeasurement,
    type BodyFatMethod,
    type BodyMeasurement,
} from '../services/measurementService';
import { queryKeys } from '../utils/queryKeys';

export const useBodyMeasurements = () => {
    return useQuery({
        queryKey: queryKeys.bodyMeasurements,
        queryFn: getBodyMeasurements,
    });
};

export const useBodyMeasurementByDate = (date: string, enabled = true) => {
    return useQuery({
        queryKey: queryKeys.bodyMeasurementByDate(date),
        queryFn: () => getBodyMeasurementByDate(date),
        enabled,
    });
};

// The most recent measurement date (used by the daily-score recency metric).
export const useLatestMeasurement = () => {
    return useQuery({
        queryKey: queryKeys.latestMeasurement,
        queryFn: async () => {
            const latest = await getLatestMeasurement();
            return latest?.measure_date ?? null;
        },
    });
};

export const useSaveBodyMeasurement = (onDone?: (saved: BodyMeasurement) => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (m: BodyMeasurement) => saveBodyMeasurement(m),
        onSuccess: (saved) => {
            if (!saved) return;
            qc.invalidateQueries({ queryKey: queryKeys.bodyMeasurements });
            qc.invalidateQueries({ queryKey: queryKeys.latestMeasurement });
            qc.invalidateQueries({ queryKey: queryKeys.bodyMeasurementByDate(saved.measure_date) });
            qc.invalidateQueries({ queryKey: queryKeys.userSettings });
            onDone?.(saved);
        },
    });
};

/**
 * Writes just the weight and body fat for a date, from anywhere.
 *
 * Separate from `useSaveBodyMeasurement` because that one replaces the whole row:
 * it nulls every field it was not handed, so the Daily Log cannot use it or a
 * morning weigh-in would erase the tape measurements for the same day. This is
 * the second door onto the same single record.
 */
export const useLogBodyComposition = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            measure_date: string;
            weight?: number | null;
            body_fat?: number | null;
            body_fat_method?: BodyFatMethod | null;
        }) => logBodyComposition(input),
        onSuccess: saved => {
            if (!saved) return;
            qc.invalidateQueries({ queryKey: queryKeys.bodyMeasurements });
            qc.invalidateQueries({ queryKey: queryKeys.latestMeasurement });
            qc.invalidateQueries({ queryKey: queryKeys.bodyMeasurementByDate(saved.measure_date) });
        },
    });
};

export const useDeleteBodyMeasurement = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteBodyMeasurement(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.bodyMeasurements });
            qc.invalidateQueries({ queryKey: queryKeys.latestMeasurement });
            qc.invalidateQueries({ queryKey: queryKeys.userSettings });
            onDone?.();
        },
    });
};