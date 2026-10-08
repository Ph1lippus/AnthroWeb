import type { BodyMeasurement } from '../services/measurementService';

export interface BodyReading {
    date: string;
    weight: number | null;
    bodyFat: number | null;
    /** How `bodyFat` was arrived at, or null when unknown. */
    bodyFatMethod: string | null;
}

export interface BodySeriesInput {
    measurements: BodyMeasurement[] | null;
    days: number | null;
    inRange: (date: string, days: number | null) => boolean;
}

/**
 * The weight and body-fat series behind the two dashboard charts.
 *
 * One source, one row per date: `body_measurements`. It used to read
 * `daily_logs`, which meant the weight line was empty for anyone who records
 * their weight on the Measurements page, and it used to merge in a second table
 * as well, which meant a day with readings in both had to average them. Both are
 * gone with migration 0013, which dropped the daily-log columns and gave
 * `body_measurements` a real `body_fat` to store.
 *
 * There is no starting-value point here either. The value the user began at lives
 * in `user_settings.starting_weight` and has no date, so it has no place in a
 * series of dated readings - the chart attaches it as its opening point, next to
 * the target line, rather than this function inventing a date for it.
 */
export const buildBodySeries = ({
    measurements,
    days,
    inRange,
}: BodySeriesInput): BodyReading[] =>
    (measurements ?? [])
        .filter(m => m.measure_date && inRange(m.measure_date, days))
        .slice()
        .sort((a, b) => a.measure_date.localeCompare(b.measure_date))
        .map(m => ({
            date: m.measure_date,
            weight: typeof m.weight === 'number' ? m.weight : null,
            bodyFat: typeof m.body_fat === 'number' ? m.body_fat : null,
            bodyFatMethod: m.body_fat_method ?? null,
        }));
