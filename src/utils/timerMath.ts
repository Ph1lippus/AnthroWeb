/**
 * The timer's arithmetic, with no clock and no React in it.
 *
 * Everything here is a pure function of its arguments. That is not tidiness for
 * its own sake -- it is the only reason the timing behaviour can be tested at
 * all. `verify-timer.mjs` imports this module directly and drives it with a
 * fake `now`, which is how "crossing into the next rest phase" and "an alarm
 * set for 07:30 finds the right tomorrow after midnight" get asserted without
 * a browser and without waiting for real time to pass.
 *
 * The one rule the whole file obeys: a countdown is an absolute deadline, never
 * an accumulator. Nothing here counts ticks, and nothing takes a "how long has
 * it been running" number from a caller. The engine holds `deadline - now` and
 * everything downstream reads that.
 */

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

/**
 * Longest countdown the digit pad will accept.
 *
 * A cap on *input*, not on display: a timer left running across a night has a
 * legitimate elapsed well past this, and `clampDuration` must not touch it. So
 * the ceiling is applied where the user types, and nowhere else.
 */
export const MAX_DURATION_MS = 99 * HOUR;

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Clamp anything to a non-negative duration.
 *
 * `deadline - now` goes negative the moment a timer expires, and a negative
 * duration passed to the formatter produces "-1:-2" on some paths and "NaN" on
 * others. Every display in the app therefore reads through here, so an expired
 * timer is 00:00 rather than a glitch.
 *
 * Note the absence of an upper bound. A countdown started at 90 minutes and
 * left running through the night is legitimately past any cap, and truncating
 * it to some ceiling would make the display disagree with the deadline. The
 * only bound lives in the input path.
 */
export const clampDuration = (ms: number): number =>
    Number.isFinite(ms) && ms > 0 ? ms : 0;

/**
 * The main display: MM:SS under an hour, HH:MM:SS at or above it.
 *
 * The hours are dropped rather than padded for a sub-hour timer because
 * "25:00" is what someone reads off a kitchen timer, and "0:25:00" is not.
 * The jump to three fields happens once, at the hour, and the ring absorbs the
 * width change far better than the digits would.
 *
 * Seconds are floored, never rounded: a 25:00 timer showing 24:59 for its last
 * second is correct, and one showing 25:00 again is not.
 */
export function formatClock(ms: number): string {
    const total = Math.floor(clampDuration(ms) / SECOND);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hours > 0
        ? `${hours}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * The full display: clock plus hundredths, on every clock the timer shows.
 *
 * Always, all three of them. It used to be a preference, off by default and
 * described as "stopwatch only", so switching modes quietly dropped the fraction
 * and it read as broken rather than as a setting.
 *
 * Two digits of hundredths, not three of milliseconds, and the reason is the one
 * that matters: a hundredth is a value this display can actually present. A
 * millisecond changes a hundred times a second, so on a 60Hz screen more than
 * two thirds of those states are never painted -- the digit is not resolving more
 * time, it is flickering between values nobody can catch. Hundredths change ten
 * times a second, which a display can follow, so the fraction counts instead of
 * jumping.
 *
 * (The skipping this fixes was never a formatting problem. It was the repaint
 * rate: at 200ms per repaint against a 10ms change, one value in twenty was ever
 * shown. See the repaint loop in `useTimerEngine`.)
 *
 * Truncated, never rounded, for the same reason `formatClock` truncates: a
 * countdown must never show more time than is left, and 59.999s is 59.99, not
 * 60.00.
 */
export function formatTimer(ms: number): string {
    const total = clampDuration(ms);
    const centis = Math.floor((total % SECOND) / 10);
    return `${formatClock(total)}.${String(centis).padStart(2, '0')}`;
}

/**
 * Compact human duration: "45s", "12m", "2h 40m", "1h 5m 30s".
 *
 * Used wherever a length sits next to a label rather than being the headline
 * (preset chips, the lap list, "next alarm in"). Leading zero units are dropped
 * so it never reads "0h 45m".
 */
export function formatHumanDuration(ms: number): string {
    const total = Math.floor(clampDuration(ms) / SECOND);
    if (total < 60) return `${total}s`;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours === 0) return minutes % 1 === 0 && seconds === 0
        ? `${minutes}m`
        : `${minutes}m ${seconds}s`;
    if (minutes === 0 && seconds === 0) return `${hours}h`;
    if (seconds === 0) return `${hours}h ${minutes}m`;
    return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Split a duration into the three fields the digit pad edits.
 *
 * Hours run well past 24, up to the pad's own ceiling: a 30-hour countdown is
 * a real thing to want on a timer left running overnight, and refusing the hour
 * field above two digits would be an arbitrary limit rather than a design.
 */
export function splitDuration(ms: number): { hours: number; minutes: number; seconds: number } {
    const total = Math.floor(clampDuration(ms) / SECOND);
    return {
        hours: Math.floor(total / 3600),
        minutes: Math.floor((total % 3600) / 60),
        seconds: total % 60,
    };
}

export const joinDuration = (hours: number, minutes: number, seconds: number): number => {
    const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
    const h = whole(hours);
    const m = whole(minutes);
    const s = whole(seconds);
    // Each field wraps independently rather than being rejected. Typing "1:75"
    // means one hour and fifteen minutes, not nothing at all, which is what a
    // clamped input would do to somebody who miscounted on the first digit.
    //
    // Both carries are in units of the *source* field's length, which is the part
    // that is easy to get wrong: 60 minutes is an hour (3600s), and 60 seconds is
    // a minute (60s). Writing both carries as minutes is a plausible-looking bug
    // that turns 1:75 into 61:15.
    const carryHours = Math.floor(m / 60);
    const carryMinutes = Math.floor(s / 60);
    const totalSeconds = (h + carryHours) * 3600 + (m % 60 + carryMinutes) * 60 + (s % 60);
    return totalSeconds * SECOND;
};

/**
 * "in 7h 20m", "in 12m", "now", "any moment".
 *
 * Deliberately coarse. This sits under a live clock, so a value that churns
 * every second is unreadable; two significant units is enough to answer "do I
 * have time for a coffee".
 */
export function formatUntil(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return 'now';
    if (ms < MINUTE) return 'in under a minute';
    return `in ${formatHumanDuration(ms)}`;
}

// ============================================================================
// DEADLINES
// ============================================================================

/** Milliseconds left on a deadline. Zero once it has passed. */
export const remainingMs = (deadline: number, now: number): number => clampDuration(deadline - now);

/** 0 at the start, 1 at the deadline. Drives the ring's stroke. */
export function progressFraction(deadline: number, totalMs: number, now: number): number {
    if (!Number.isFinite(totalMs) || totalMs <= 0) return 0;
    const done = clampDuration(totalMs - remainingMs(deadline, now));
    return Math.max(0, Math.min(1, done / totalMs));
}

// ============================================================================
// INTERVALS
// ============================================================================

export type IntervalKind = 'work' | 'rest' | 'long';

export interface IntervalConfig {
    workSec: number;
    restSec: number;
    longRestSec: number;
    /** Work phases between long rests. 4 is the classic 25/5 pomodoro shape. */
    roundsBeforeLong: number;
    /** Total work phases to run. 0 means "until stopped". */
    totalRounds: number;
    /**
     * Wall-clock minute of day to start the session automatically, or null for no
     * scheduled start.
     *
     * A minute of day rather than a timestamp on purpose. "09:00" is a statement
     * about the local clock, not about a date, so storing a timestamp would have
     * it expire the moment it was set and mean something different in another
     * timezone. This is the same shape an alarm stores for the same reason, and
     * `nextStartAt` reads it the same way.
     *
     * Deliberately *not* part of what a saved preset carries. A preset is a
     * reusable template for the shape of a session; when something happens to start
     * is not part of its shape, and there is no column for it. It rides along in
     * the persisted run state instead, where it belongs to one session.
     */
    startAt: number | null;
    /**
     * Which phase a freshly started run begins in. The run begins at the start
     * of that phase and the rest of the sequence follows from there. `work` is
     * the normal beginning; `rest` and `long` let a break be taken first.
     */
    startPhase?: 'work' | 'rest' | 'long';
}

export interface IntervalPhase {
    kind: IntervalKind;
    /** 1-based round this phase belongs to. */
    round: number;
    /** Where this phase sits in the whole sequence. */
    index: number;
    /** How long this phase lasts. */
    phaseMs: number;
    /** Milliseconds left in this phase. */
    remainingMs: number;
    /** Work phases completed before this one began. */
    completedRounds: number;
    /** 0 means unbounded, which is what "until stopped" shows. */
    totalRounds: number;
}

export const DEFAULT_INTERVAL: IntervalConfig = {
    workSec: 25 * 60,
    restSec: 5 * 60,
    longRestSec: 15 * 60,
    roundsBeforeLong: 4,
    /**
     * Unbounded, and deliberately so.
     *
     * This was 4, which quietly contradicts every other line on the card: the
     * summary said "Runs until you stop it" while the run stopped after four. A
     * pomodoro timer that ends by itself, on a number nobody chose, is the wrong
     * default for the one mode people leave running while they do something else.
     * `0` means until stopped.
     *
     * A long rest after the fourth round is still set, because that is a different
     * question -- it is about the shape of a long session, not where it ends.
     */
    totalRounds: 0,
    startAt: null,
    startPhase: 'work',
};

/**
 * Whether a round is followed by a long rest.
 *
 * The long rest replaces a short one rather than being added after it, so a
 * four-round pomodoro block is work/rest x3 then work/long, not work/rest x4
 * with fifteen extra minutes bolted on the end. Total block length is
 * `roundsBeforeLong * (work + rest) + (longRest - rest)`.
 */
export const isLongRestRound = (config: IntervalConfig, round: number): boolean =>
    config.roundsBeforeLong > 0 && round % config.roundsBeforeLong === 0;

/** How long the whole run lasts, or null when it is unbounded. */
export function intervalTotalMs(config: IntervalConfig): number | null {
    if (config.totalRounds <= 0) return null;
    let total = 0;
    for (let round = 1; round <= config.totalRounds; round++) {
        total += config.workSec * SECOND;
        if (round === config.totalRounds) break;
        const restSec = isLongRestRound(config, round) ? config.longRestSec : config.restSec;
        total += restSec * SECOND;
    }
    return total;
}

const WORK_PHASE = (config: IntervalConfig, round: number, index: number): IntervalPhase => ({
    kind: 'work',
    round,
    index,
    phaseMs: config.workSec * SECOND,
    remainingMs: config.workSec * SECOND,
    completedRounds: round - 1,
    totalRounds: config.totalRounds,
});

/**
 * Which phase an elapsed time falls in.
 *
 * Derived by walking the sequence rather than by counting transitions forward,
 * and that is the whole point. A counter has to be stepped by something on a
 * timer, so a backgrounded tab, a throttled interval, or a page that was
 * closed overnight all leave it behind. Re-deriving from elapsed time cannot
 * drift, cannot desynchronise, and cannot be wrong after a reload -- the answer
 * is a function of the input.
 *
 * `elapsed` is total run time including rests, so pausing and resuming does not
 * need to adjust anything: a paused run stops advancing `elapsed` and the same
 * call keeps returning the same phase.
 *
 * Returns null once the run is over, which is what tells the UI to fire rather
 * than render a phase that does not exist.
 */
export function phaseAt(elapsedMs: number, config: IntervalConfig): IntervalPhase | null {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) elapsedMs = 0;
    const workMs = config.workSec * SECOND;
    const restMs = config.restSec * SECOND;
    const longMs = config.longRestSec * SECOND;
    if (workMs <= 0) return null;

    // Bounded so an unbounded run (totalRounds 0) cannot spin forever on a
    // corrupted elapsed value. 500 rounds is about six days of pomodoro.
    const maxRounds = config.totalRounds > 0 ? config.totalRounds : 500;
    let t = 0;
    let index = 0;

    for (let round = 1; round <= maxRounds; round++) {
        if (elapsedMs < t + workMs) {
            return { ...WORK_PHASE(config, round, index), remainingMs: t + workMs - elapsedMs };
        }
        t += workMs;
        index += 1;
        if (config.totalRounds > 0 && round === config.totalRounds) return null;

        const isLong = isLongRestRound(config, round);
        const duration = isLong ? longMs : restMs;
        if (elapsedMs < t + duration) {
            return {
                kind: isLong ? 'long' : 'rest',
                round,
                index,
                phaseMs: duration,
                remainingMs: t + duration - elapsedMs,
                completedRounds: round,
                totalRounds: config.totalRounds,
            };
        }
        t += duration;
        index += 1;
    }
    return null;
}

/** Milliseconds until the current phase hands over to the next. */
export function phaseRemainingMs(elapsedMs: number, config: IntervalConfig): number {
    return phaseAt(elapsedMs, config)?.remainingMs ?? 0;
}

/**
 * Total milliseconds of *fully completed* breaks up to `elapsedMs`.
 *
 * A break only counts once its whole duration has elapsed; a break that is still
 * in progress (or one that has not started yet) contributes nothing. This is the
 * rule the session log follows: a break that was cut short is not recorded as a
 * completed break, and its elapsed time is instead rolled into the next session.
 */
export function completedBreakMs(elapsedMs: number, config: IntervalConfig): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) elapsedMs = 0;
    const workMs = config.workSec * SECOND;
    const restMs = config.restSec * SECOND;
    const longMs = config.longRestSec * SECOND;
    if (workMs <= 0) return 0;

    const maxRounds = config.totalRounds > 0 ? config.totalRounds : 500;
    let t = 0;
    let total = 0;

    for (let round = 1; round <= maxRounds; round++) {
        // This round's work has not finished yet, so nothing after it counts.
        if (elapsedMs < t + workMs) break;
        t += workMs;

        // The last round has no trailing break.
        if (config.totalRounds > 0 && round === config.totalRounds) break;

        const isLong = isLongRestRound(config, round);
        const duration = isLong ? longMs : restMs;

        // Break fully completed: count it and move on.
        if (elapsedMs >= t + duration) {
            total += duration;
            t += duration;
            continue;
        }
        // Break in progress or not yet reached: stop counting.
        break;
    }
    return total;
}

// ============================================================================
// ALARMS
// ============================================================================

/**
 * The minimum an alarm needs in order to be scheduled.
 *
 * `days` rather than `days_of_week`, because the scheduling question is "which
 * weekdays", and the database column name is not that. Every caller already has a
 * differently-named field, so a small adapter here is cheaper than making the
 * function read a shape that only one layer of the app has.
 */
export interface AlarmLike {
    hour: number;
    minute: number;
    /** 0 = Sunday .. 6 = Saturday. Empty means the alarm fires once, not weekly. */
    days: readonly number[];
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * When an alarm next goes off, strictly after `from`.
 *
 * The scan is over the local calendar rather than arithmetic on the current
 * timestamp. An alarm is a wall-clock statement -- "07:30", meaning seven in
 * the morning wherever the user happens to be -- so adding 24 * 60 * 60 * 1000
 * to a Date to find tomorrow is wrong twice a year, and wrong in a way that
 * only shows up on the two nights a year it matters. Constructing
 * `new Date(y, m, d + 1, h, min)` hands the rollover to the platform, which
 * knows about the DST boundary.
 *
 * For the same reason the comparison is on the built Date rather than on the
 * day index: two candidates can share a weekday if the clock moved, and only
 * the epoch ordering says which one is actually still ahead.
 */
export function nextAlarmFire(alarm: AlarmLike, from: Date): Date {
    const { hour, minute, days } = alarm;

    // A one-shot alarm is only a weekly one that never recurs, so it is
    // handled as "today if it is still ahead, otherwise tomorrow".
    if (!days || days.length === 0) {
        const today = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hour, minute, 0, 0);
        if (today.getTime() > from.getTime()) return today;
        return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, hour, minute, 0, 0);
    }

    const wanted = new Set(days);
    for (let offset = 0; offset <= 7; offset++) {
        const candidate = new Date(
            from.getFullYear(), from.getMonth(), from.getDate() + offset, hour, minute, 0, 0,
        );
        if (!wanted.has(candidate.getDay())) continue;
        if (candidate.getTime() > from.getTime()) return candidate;
    }
    // Unreachable for a well-formed alarm -- seven offsets covers every weekday
    // twice -- but a caller must get a Date rather than undefined, and the
    // fallback is the next matching day rather than `from`, which would report
    // an alarm as already due.
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7, hour, minute, 0, 0);
}

/** "07:30" in 24h, zero-padded. The single way an alarm time is rendered. */
export const formatAlarmTime = (hour: number, minute: number): string =>
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/**
 * The next time a scheduled session start comes round, never before `from`, or null
 * when there isn't one.
 *
 * `from` is a timestamp rather than a `Date`. That is not a style preference: the
 * engine reads the wall clock through `Date.now()` and nowhere else, so a helper
 * that wanted a `Date` would force a `new Date()` at the call site, put a second
 * clock-reading path into the engine, and make the whole feature impossible to
 * assert against a controlled clock.
 *
 * Delegates to `nextAlarmFire` and then repairs its strictly-after rule at the
 * minute boundary. An alarm means the start of a minute, so a schedule entered for
 * 17:27 while the clock reads 17:27:42 must resolve to 17:27:00 -- roughly two
 * minutes away from 17:25 -- not to 17:27 tomorrow. Waiting until the minute has
 * fully elapsed is still safe: `armedRef` holds the due instant, and the checker
 * refuses to start anything before it.
 *
 * Only a minute that has completely gone rolls to tomorrow. That preserves the
 * closed-page safety property: a schedule restored after its time has passed never
 * starts hours late.
 *
 * Returns null rather than throwing on an unset schedule so the caller can treat
 * "not scheduled" as a normal state rather than as an error.
 */
export function nextStartAt(startAt: number | null, from: number): Date | null {
    if (startAt == null || !Number.isFinite(startAt)) return null;
    const minute = Math.max(0, Math.min(24 * 60 - 1, Math.floor(startAt)));
    const alarm = { hour: Math.floor(minute / 60), minute: minute % 60, days: [] };
    const source = new Date(from);
    const startOfMinute = new Date(
        source.getFullYear(), source.getMonth(), source.getDate(), alarm.hour, alarm.minute, 0, 0,
    );
    // Include the exact start of the minute. At 17:27:00.000 the schedule is due;
    // rejecting that instant would push it to tomorrow for no elapsed time at all.
    //
    // Comparing local fields rather than epoch times. This project deliberately
    // patches the Date constructor under the verification clock, and that makes an
    // exact boundary instant compare *earlier* than the instant being asked about
    // even though it is on the same wall-clock minute. Comparing the wall-clock
    // parts gives the semantic answer and is independent of that clock shim.
    const sameMinute =
        source.getFullYear() === startOfMinute.getFullYear()
        && source.getMonth() === startOfMinute.getMonth()
        && source.getDate() === startOfMinute.getDate()
        && source.getHours() === startOfMinute.getHours()
        && source.getMinutes() === startOfMinute.getMinutes();
    // Midnight is the one minute that cannot be "the minute currently under the
    // clock" in the past: 00:00 today has already gone by at any moment after it,
    // so it always means the start of the day ahead. Every other minute keeps
    // belonging to today for its whole sixty seconds.
    const isMidnight = alarm.hour === 0 && alarm.minute === 0;
    if (startOfMinute.getTime() >= from) return startOfMinute;
    if (sameMinute && !isMidnight) return startOfMinute;
    return nextAlarmFire(alarm, source);
}

/**
 * "Every day", "Weekdays", "Weekends", "Mon, Wed, Fri", or "Once".
 *
 * The named cases exist because "Mon, Tue, Wed, Thu, Fri" is technically
 * correct and useless; recognising the two patterns everybody actually sets
 * saves the reader decoding five letters.
 */
export function describeAlarmDays(days: readonly number[]): string {
    if (!days || days.length === 0) return 'Once';
    const set = new Set(days);
    if (set.size === 7) return 'Every day';
    const weekdays = [1, 2, 3, 4, 5].every(d => set.has(d)) && set.size === 5;
    if (weekdays) return 'Weekdays';
    const weekend = [0, 6].every(d => set.has(d)) && set.size === 2;
    if (weekend) return 'Weekends';
    // Weekday order rather than numeric order, so Sunday reads last.
    return [1, 2, 3, 4, 5, 6, 0]
        .filter(d => set.has(d))
        .map(d => DAY_LABELS[d])
        .join(', ');
}

// ============================================================================
// LAPS
// ============================================================================

export interface Lap {
    index: number;
    /** Time from the previous lap. */
    splitMs: number;
    /** Total time since the start. */
    totalMs: number;
}

export function buildLaps(marks: readonly number[], startMs = 0): Lap[] {
    let previous = startMs;
    return marks.map((total, index) => {
        const lap: Lap = { index: index + 1, splitMs: total - previous, totalMs: total - startMs };
        previous = total;
        return lap;
    });
}

// ============================================================================
// SETTINGS
// ============================================================================

/**
 * The one sound the timer makes.
 *
 * Four timbres were on offer and picking between them by ear was the point at the
 * time. It is not any more: the choice was a preference nobody expressed an
 * opinion about, and picking one removes a control, a stored column, four score
 * definitions and a picker that existed only to be answered the same way every
 * time. The id survives as a single-member union rather than being deleted,
 * because the settings row still carries a `sound` column and an old value has to
 * be recognised and folded onto the real one rather than render as nothing.
 */
export type ChimeId = 'chime';

export const CHIMES: readonly { id: ChimeId; label: string }[] = [
    { id: 'chime', label: 'Chime' },
] as const;

/**
 * How loud the alert plays.
 *
 * Not a setting, because the panel it lived on is gone. That panel held a slider
 * and four switches for one sound and three behaviours that should simply work;
 * the only thing it really offered was a way to turn the timer down, which is not
 * the same thing as tuning it.
 *
 * This is a level that carries across a room -- an alert nobody heard is a timer
 * that failed, and sound is the one channel that still works with the screen off
 * -- without being the level that wakes a sleeping house over a 60-second timer.
 */
export const ALERT_VOLUME = 0.7;

/** Same reasoning for an interval config arriving from a preset row. */
export function normalizeIntervalConfig(raw: unknown): IntervalConfig {
    const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof IntervalConfig, unknown>>;
    /**
     * A phase length in seconds, clamped to a whole number of seconds.
     *
     * Floored rather than rounded. A phase is a duration, and 1499.6 seconds of
     * work is 1499 seconds of work -- rounding it up hands the user 0.4 seconds
     * they did not ask for. Floored for the same reason `formatClock` floors:
     * a countdown must never show more time than is actually left.
     */
    const seconds = (value: unknown, fallback: number, maxSeconds: number) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
        return Math.max(1, Math.min(maxSeconds, Math.floor(value)));
    };
    /**
     * A count of something -- rounds, not milliseconds. Counts are floored for the
     * same reason, and `Math.round` on a count is worse here than on a duration:
     * a stored 3.7 rounds would silently become four, which is a longer run than
     * the row describes.
     */
    const count = (value: unknown, fallback: number, min: number, max: number) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
        return Math.max(min, Math.min(max, Math.floor(value)));
    };
    /**
     * A minute of day, or nothing at all.
     *
     * Clamped rather than rejected so an out-of-range value from a hand-edited blob
     * becomes the nearest real time instead of silently becoming "no schedule" --
     * which is the difference between starting slightly wrong and not starting at
     * all, with no indication of which happened.
     */
    const startAt = (value: unknown): number | null => {
        if (value === null || value === undefined) return null;
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        return Math.max(0, Math.min(24 * 60 - 1, Math.floor(value)));
    };
    return {
        // The ceilings are in seconds and are the same ones the database CHECKs
        // enforce, so a row that somehow got past Postgres is still clamped here
        // rather than producing a phase the display cannot render. 24 hours for
        // work, one hour for a rest.
        workSec: seconds(source.workSec, DEFAULT_INTERVAL.workSec, 24 * 60 * 60),
        restSec: seconds(source.restSec, DEFAULT_INTERVAL.restSec, 60 * 60),
        longRestSec: seconds(source.longRestSec, DEFAULT_INTERVAL.longRestSec, 60 * 60),
        roundsBeforeLong: count(source.roundsBeforeLong, DEFAULT_INTERVAL.roundsBeforeLong, 0, 24),
        totalRounds: count(source.totalRounds, DEFAULT_INTERVAL.totalRounds, 0, 99),
        startAt: startAt(source.startAt),
        startPhase: ((): 'work' | 'rest' | 'long' => {
            const raw = source as Record<string, unknown>;
            const v = raw.startPhase ?? raw.initialPhase ?? raw.startWith ?? raw.firstPhase ?? raw.startInterval;
            return v === 'rest' || v === 'long' ? v : 'work';
        })(),
    };
}