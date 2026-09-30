export interface DateRange {
    label: string;
    days: number | null;
}

// Shared window selector for the dashboard. The range pills and the analysis
// cards read from this so both always describe the same time window.
//
// The list runs shortest first so switching windows is a single tap away, and
// All Time is the default because the dashboard is meant to be read as the
// whole picture; the shorter windows are there to zoom in on.
export const RANGES: DateRange[] = [
    { label: '7 Days', days: 7 },
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: 'All Time', days: null },
];

export const DEFAULT_RANGE: DateRange = RANGES.find(r => r.days === null) ?? RANGES[RANGES.length - 1];
