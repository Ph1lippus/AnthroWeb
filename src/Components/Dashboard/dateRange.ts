export interface DateRange {
    label: string;
    days: number | null;
}

// Shared window selector for the dashboard. The range pills and the analysis
// cards read from this so both always describe the same time window.
export const RANGES: DateRange[] = [
    { label: '14 Days', days: 14 },
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: 'All Time', days: null },
];

export const DEFAULT_RANGE: DateRange = RANGES[1];
