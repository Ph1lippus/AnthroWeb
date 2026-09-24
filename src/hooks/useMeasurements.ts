import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getBodyMeasurements,
    getBodyMeasurementByDate,
    getLatestMeasurement,
    saveBodyMeasurement,
    deleteBodyMeasurement,
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