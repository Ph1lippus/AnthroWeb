/**
 * Mood ratings: reading them, averaging them, and colouring them.
 *
 * `daily_logs` carries two 1-10 ratings per day -- `morning_mood` and
 * `evening_mood` -- and five places in the app need to answer the same three
 * questions about them. This is the only place that answers them, because the
 * answers have to agree: a node in the mind graph, a badge on the daily log and
 * a line on the dashboard chart are three views of one number, and a ramp that
 * is subtly different in each of them makes a good week look flat.
 *
 * The split exists to show disagreement between the two readings of a day, so
 * nothing here averages them into a single verdict unless the caller asks for
 * the day's score. `meanMood` is for exactly that, and `dayDelta` is for the
 * thing the split was added to reveal.
 */

/** Which reading of a day is being asked about. */
export type MoodSlot = 'morning' | 'evening';

/** The shape this module needs, so callers can pass a whole DailyLog. */
export interface MoodBearing {
    morning_mood?: number | null;
    evening_mood?: number | null;
}

export const MOOD_MIN = 1;
export const MOOD_MAX = 10;

/**
 * One reading of a day, or null when it was never rated.
 *
 * Out-of-range values are treated as missing rather than clamped. A 0 or an 11
 * cannot be typed through the slider and cannot be written past the column's
 * CHECK, so the only way one arrives is a value stored before the constraint
 * existed -- and clamping it would put a plausible-looking rating on a day
 * nobody rated. Missing is the honest answer.
 */
export const moodFor = (log: MoodBearing | null | undefined, slot: MoodSlot): number | null => {
    const raw = slot === 'morning' ? log?.morning_mood : log?.evening_mood;
    if (raw == null || !Number.isFinite(raw)) return null;
    if (raw < MOOD_MIN || raw > MOOD_MAX) return null;
    return raw;
};

/** Both readings of a day, with either side possibly null. */
export const moodPair = (log: MoodBearing | null | undefined): { morning: number | null; evening: number | null } => ({
    morning: moodFor(log, 'morning'),
    evening: moodFor(log, 'evening'),
});

/**
 * The day's average rating, or null if neither side was rated.
 *
 * Averaged over the readings that *exist*, not over a ten-wide scale. A day
 * rated only in the evening is one honest data point, and dividing it by two
 * because the morning was skipped would halve its weight in every chart -- so
 * the morning series would systematically read lower than the evening series for
 * no reason other than that mornings get skipped more.
 *
 * The graph's node colours and the score both need one number per day, which is
 * what this is for. Where the split is the point, use `moodPair` instead.
 */
export const meanMood = (log: MoodBearing | null | undefined): number | null => {
    const { morning, evening } = moodPair(log);
    const rated = [morning, evening].filter((v): v is number => v !== null);
    if (rated.length === 0) return null;
    return rated.reduce((sum, v) => sum + v, 0) / rated.length;
};

/**
 * How far the day drifted between its two readings, or null when that cannot be
 * said.
 *
 * Positive means the evening was the better half. Null for a day with only one
 * reading, because a drift needs two ends -- reporting 0 for an evening-only
 * day would draw it as "steady", which is a claim nobody made.
 */
export const dayDelta = (log: MoodBearing | null | undefined): number | null => {
    const { morning, evening } = moodPair(log);
    if (morning === null || evening === null) return null;
    return evening - morning;
};

/**
 * The tone for a rating, as a chart palette variable.
 *
 * Three bands rather than a continuous ramp. The palette already has the three
 * colours, they are tuned against the dark background, and a continuous
 * interpolation would have to be re-derived for every surface it is drawn on.
 * Low (1-4) reads red, mid (5-6) reads amber, high (7-10) reads green -- the
 * same 4/6/7 split the daily score uses to grade a mood, so a green node and a
 * green score ring mean the same thing.
 *
 * Null for an unrated day. Callers must handle it rather than defaulting to a
 * colour: "not rated" and "rated 5" are different claims and colouring them the
 * same would put invented days in the middle of the graph's mood distribution.
 */
export const moodTone = (mood: number | null | undefined): 'low' | 'mid' | 'high' | null => {
    // The range is checked here, not only in `moodFor`, because `moodTone` is
    // reached directly by the graph's node and edge colouring, which are handed
    // pre-computed means. A value outside 1-10 in that path -- a stored rating
    // from before the column's CHECK existed, or a mean of nothing -- has to come
    // back as "no tone" rather than as a confident red.
    if (mood == null || !Number.isFinite(mood)) return null;
    if (mood < MOOD_MIN || mood > MOOD_MAX) return null;
    if (mood <= 4) return 'low';
    if (mood <= 6) return 'mid';
    return 'high';
};

/** The concrete colour behind a tone. */
export const MOOD_TONE_COLOR: Record<'low' | 'mid' | 'high', string> = {
    low: 'var(--chart-red)',
    mid: 'var(--chart-amber)',
    high: 'var(--chart-primary)',
};

/**
 * A colour for any rating, unrated days included.
 *
 * For surfaces that must render *something* -- a graph edge to an unrated day,
 * a legend swatch, a chart line with a gap in it. Unrated falls back to the
 * grid colour, which reads as "no data" against the palette instead of as a
 * mood. Prefer `moodTone` where there is room to render nothing at all.
 */
export const moodColor = (mood: number | null | undefined): string => {
    const tone = moodTone(mood);
    return tone ? MOOD_TONE_COLOR[tone] : 'var(--chart-axis)';
};

/**
 * The mean of a series of logs' mood, over the logs that were rated.
 *
 * Deliberately a plain mean of per-day means rather than a mean over every
 * rating: a day with two readings should not carry twice the weight of a day
 * with one in an overview average, for the same reason `meanMood` divides by
 * what exists.
 */
export const meanMoodAcross = (logs: readonly MoodBearing[]): number | null => {
    const values: number[] = [];
    for (const log of logs) {
        const mean = meanMood(log);
        if (mean !== null) values.push(mean);
    }
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
};

/**
 * A coarse distribution of the day's average mood, for a stat tile.
 *
 * Buckets rather than an average, because "your average day was a 5.4" hides the
 * shape the split was added to show. Buckets are counted over per-day means so a
 * twice-rated day still lands in exactly one.
 */
export interface MoodDistribution {
    low: number;
    mid: number;
    high: number;
    rated: number;
}

export const moodDistribution = (logs: readonly MoodBearing[]): MoodDistribution => {
    const counts = { low: 0, mid: 0, high: 0, rated: 0 };
    for (const log of logs) {
        const mean = meanMood(log);
        if (mean === null) continue;
        counts.rated += 1;
        const tone = moodTone(mean);
        if (tone) counts[tone] += 1;
    }
    return counts;
};

/** One-line label for a rating, for tooltips and aria text. */
export const moodLabel = (mood: number | null | undefined): string =>
    mood == null ? 'not rated' : `${Math.round(mood * 10) / 10}/10`;