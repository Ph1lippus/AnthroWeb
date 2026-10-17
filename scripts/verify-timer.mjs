/**
 * The timer's arithmetic, and the invariants the UI relies on.
 *
 * Everything here is asserted against `src/utils/timerMath.ts` imported directly,
 * not against a copy. That matters more than usual for this file: the whole
 * design rests on the countdown being derived from an absolute deadline rather
 * than accumulated per tick, and a test against a reimplementation would keep
 * passing after the real module had drifted. `verify-grid.mjs` does the same
 * thing for `dates.ts`; the extensionless-relative-import problem is solved by
 * the loader in `lib/ts-extension-resolver.mjs`.
 *
 * The engine's own behaviour -- does a timer survive a reload, does the alert
 * fire once -- is jsdom territory and belongs with the component. What is tested
 * here is the arithmetic those behaviours are made of, with a `now` supplied by
 * the test rather than by the wall clock, which is the only reason "crossing into
 * the rest phase" can be asserted without waiting for it.
 */
import { register } from 'node:module';
import { JSDOM } from 'jsdom';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Vite resolves './timerMath' to './timerMath.ts'. Mirror that for the loader.
register(new URL('./lib/ts-extension-resolver.mjs', import.meta.url));

const {
    formatClock, formatTimer, formatHumanDuration, formatUntil, formatAlarmTime,
    splitDuration, joinDuration, clampDuration, remainingMs, progressFraction,
    phaseAt, intervalTotalMs, isLongRestRound, nextAlarmFire, nextStartAt, describeAlarmDays,
    buildLaps, normalizeIntervalConfig,
    DEFAULT_INTERVAL, ALERT_VOLUME, CHIMES, MAX_DURATION_MS, SECOND, MINUTE, HOUR,
} = await import('../src/utils/timerMath.ts');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`); }
};

// ============================================================================
// FORMATTING
// ============================================================================

console.log('\n== formatting ==');

// An expired timer is 00:00 and never "-1:-2" or "NaN:NaN". `deadline - now`
// goes negative the instant a countdown ends, and every display in the app reads
// through this function, so this is the one that decides what "finished" looks
// like.
check('zero is 00:00', formatClock(0) === '00:00', formatClock(0));
check('a negative duration is 00:00', formatClock(-5000) === '00:00', formatClock(-5000));
check('NaN is 00:00', formatClock(Number.NaN) === '00:00', formatClock(Number.NaN));
check('Infinity is 00:00', formatClock(Infinity) === '00:00', formatClock(Infinity));

// 59 seconds must not round up to "01:00". A timer showing its last second as a
// full minute reads as having already finished, and the ring is still nearly
// empty when it does.
check('59s is 00:59, not 01:00', formatClock(59 * SECOND) === '00:59', formatClock(59 * SECOND));
check('60s is 01:00', formatClock(60 * SECOND) === '01:00', formatClock(60 * SECOND));
check('just under a minute truncates', formatClock(59_900) === '00:59', formatClock(59_900));

// Hours appear only at the hour. "25:00" is what somebody reads off a kitchen
// timer; "0:25:00" is not, and the jump to three fields is the one visual
// discontinuity the ring has to absorb.
check('under an hour is MM:SS', formatClock(25 * MINUTE) === '25:00', formatClock(25 * MINUTE));
check('exactly an hour switches to H:MM:SS', formatClock(HOUR) === '1:00:00', formatClock(HOUR));
check('59:59 is still MM:SS', formatClock(59 * MINUTE + 59 * SECOND) === '59:59');
check('an hour and a minute', formatClock(HOUR + MINUTE) === '1:01:00', formatClock(HOUR + MINUTE));
check('over a day is not capped', formatClock(30 * HOUR) === '30:00:00', formatClock(30 * HOUR));

// Hundredths, on every clock. Two digits, because a hundredth is a value this
// display can actually present -- a millisecond changes a hundred times a second
// and a 60Hz screen cannot paint most of them, so a third digit flickers between
// values nobody can catch rather than resolving more time.
check('the display counts hundredths', formatTimer(1234) === '00:01.23', formatTimer(1234));
check('and truncates rather than rounding up', formatTimer(1999) === '00:01.99', formatTimer(1999));
// Two digits, always, including at zero -- a fraction that changes width between
// "00:00.00" and "00:00.0" shifts the whole string sideways mid-run.
check('there are always two of them', formatTimer(0) === '00:00.00', formatTimer(0));
check('and the last hundredth before a minute',
    formatTimer(59 * SECOND + 990) === '00:59.99', formatTimer(59 * SECOND + 990));
// A countdown must never show more time than is left, and 59.999s is 59.99.
check('the last instant before the minute is not 60.00',
    formatTimer(59 * SECOND + 999) !== '01:00.00', formatTimer(59 * SECOND + 999));
check('an hour and change keeps both digits',
    formatTimer(HOUR + SECOND + 70) === '1:00:01.07', formatTimer(HOUR + SECOND + 70));
check('an expired timer is zero, not NaN',
    formatTimer(-5000) === '00:00.00', formatTimer(-5000));

// The repaint rate, which is the half of this the formatter cannot fix.
//
// A hundredth is 10ms. At the 200ms interval this engine used to run on, one
// value in twenty was ever put on screen -- the fraction appeared to jump rather
// than count, which is exactly how it was reported. The assertion is that the
// display advances at least as often as the value it is displaying changes.
{
    const engineSource = readFileSync(join(root, 'src/hooks/useTimerEngine.tsx'), 'utf8');
    check('the repaint loop is on requestAnimationFrame',
        /requestAnimationFrame/.test(engineSource),
        'a fixed interval asks for renders faster than the screen can show them');
    check('and cancels the frame it scheduled',
        /cancelAnimationFrame/.test(engineSource), 'a leaked frame loop keeps a whole tree alive');
    // An explicit 200ms poll would reintroduce the skip in a way that still
    // renders, so the old number must not come back.
    check('there is no 200ms poll left in it',
        !/TICK_MS\s*=\s*200/.test(engineSource) && !/setInterval\(\(\) => setNow/.test(engineSource),
        'the timer has to be able to keep up with the digits it claims to show');
    check('and it reads the wall clock inside the frame',
        /requestAnimationFrame\(repaint\);\s*\n\s*setNow\(Date\.now\(\)\)/.test(engineSource));
}

check('45s reads as 45s', formatHumanDuration(45 * SECOND) === '45s', formatHumanDuration(45 * SECOND));
check('90s reads as 1m 30s', formatHumanDuration(90 * SECOND) === '1m 30s', formatHumanDuration(90 * SECOND));
check('an hour reads as 1h', formatHumanDuration(HOUR) === '1h', formatHumanDuration(HOUR));
// The leading zero unit is the thing that makes this readable: "0h 45m" is noise.
check('45m does not lead with 0h', formatHumanDuration(45 * MINUTE) === '45m', formatHumanDuration(45 * MINUTE));
check('2h 40m', formatHumanDuration(160 * MINUTE) === '2h 40m', formatHumanDuration(160 * MINUTE));

check('a past time is "now"', formatUntil(-1) === 'now', formatUntil(-1));
check('under a minute does not say "0m"', formatUntil(30 * SECOND) === 'in under a minute',
    formatUntil(30 * SECOND));
check('an hour away', formatUntil(HOUR) === 'in 1h', formatUntil(HOUR));
check('7h 20m away', formatUntil(7 * HOUR + 20 * MINUTE) === 'in 7h 20m', formatUntil(7 * HOUR + 20 * MINUTE));

check('an alarm time is zero-padded', formatAlarmTime(7, 30) === '07:30', formatAlarmTime(7, 30));
check('23:59 survives', formatAlarmTime(23, 59) === '23:59', formatAlarmTime(23, 59));

// ============================================================================
// THE PAD
// ============================================================================

console.log('\n== the digit pad ==');

check('25:00:00 splits correctly',
    JSON.stringify(splitDuration(25 * MINUTE)) === JSON.stringify({ hours: 0, minutes: 25, seconds: 0 }),
    JSON.stringify(splitDuration(25 * MINUTE)));
check('1:01:01 splits correctly',
    JSON.stringify(splitDuration(HOUR + MINUTE + SECOND)) === JSON.stringify({ hours: 1, minutes: 1, seconds: 1 }),
    JSON.stringify(splitDuration(HOUR + MINUTE + SECOND)));

// Minutes wrap rather than being refused. Typing "1:75" means one hour and fifteen
// minutes, and refusing the keystroke would leave the field stuck on the last good
// character with no message -- the more confusing of the two behaviours.
check('75 minutes rolls into the hour', joinDuration(1, 75, 0) === 2 * HOUR + 15 * MINUTE,
    String(joinDuration(1, 75, 0)));
check('90 seconds rolls into the minute', joinDuration(0, 0, 90) === MINUTE + 30 * SECOND,
    String(joinDuration(0, 0, 90)));
check('a plain value round-trips', joinDuration(1, 30, 45) === HOUR + 30 * MINUTE + 45 * SECOND);

// The ceiling lives on the input, not on the display. A timer left running
// overnight is legitimately past any cap, and truncating it would put the ring
// and the deadline at odds.
check('a 30-hour duration is representable', joinDuration(30, 0, 0) === 30 * HOUR);
check('the display does not cap at MAX_DURATION_MS',
    formatClock(30 * HOUR) === '30:00:00' && MAX_DURATION_MS >= 30 * HOUR,
    `${formatClock(30 * HOUR)} / max ${MAX_DURATION_MS}`);
check('a negative duration clamps to zero', clampDuration(-1) === 0);

// ============================================================================
// DEADLINES
// ============================================================================

console.log('\n== deadlines ==');

const T0 = 1_700_000_000_000; // fixed, so nothing here depends on the real clock

check('remaining is deadline minus now', remainingMs(T0 + 60_000, T0) === 60_000);
check('an expired deadline is zero, not negative', remainingMs(T0 - 1, T0) === 0);

// The property the entire engine is built on: remaining is a pure function of
// (deadline, now) and carries no memory of how many times it has been called. A
// caller polling it a thousand times gets the same answer as a caller polling it
// once, which is what makes a throttled background tab harmless.
check('polling does not accumulate', (() => {
    const deadline = T0 + 25 * MINUTE;
    let seen = 0;
    for (let i = 0; i < 1000; i++) seen = remainingMs(deadline, T0 + i * 10);
    return seen === remainingMs(deadline, T0 + 9990);
})());

// The bug this design exists to prevent. A tick counter polled once a minute in a
// background tab would have counted 60 ticks after an hour and reported a minute
// elapsed. Deriving from the wall clock cannot do that.
check('a throttled tab still reads correctly', (() => {
    const deadline = T0 + 25 * MINUTE;
    // One poll an hour later: what is left must be what is actually left.
    const anHourLater = T0 + HOUR;
    return remainingMs(deadline, anHourLater) === 0;
})());

check('the ring fills from 0 to 1', progressFraction(T0 + 1000, 1000, T0) === 0);
check('the ring is full at the deadline', progressFraction(T0, 1000, T0) === 1);
check('the ring is half at half', progressFraction(T0 + 500, 1000, T0) === 0.5);
check('an expired ring is full, not over', progressFraction(T0 - 5000, 1000, T0) === 1);
check('a zero total does not divide by zero', progressFraction(T0, 0, T0) === 0);

// ============================================================================
// INTERVALS
// ============================================================================

console.log('\n== intervals ==');

const pomodoro = {
    workSec: 25 * 60, restSec: 5 * 60, longRestSec: 15 * 60, roundsBeforeLong: 4, totalRounds: 4,
};
const W = 25 * MINUTE, R = 5 * MINUTE, LR = 15 * MINUTE;

check('at zero the phase is the first work block', phaseAt(0, pomodoro)?.kind === 'work');
check('work block reports round 1', phaseAt(0, pomodoro)?.round === 1);

// The boundary itself, in both directions. Off-by-one here is the whole bug: at
// exactly 25:00 the work is done, so it must already be a rest.
check('the last instant of work is still work',
    phaseAt(W - 1, pomodoro)?.kind === 'work', phaseAt(W - 1, pomodoro)?.kind);
check('exactly at the boundary it is rest',
    phaseAt(W, pomodoro)?.kind === 'rest', phaseAt(W, pomodoro)?.kind);

// The long rest replaces a short one rather than being added after it. Four
// rounds of pomodoro is work/short-rest x3, then work/long -- NOT work/short-rest
// x4 with fifteen extra minutes bolted on the end, which would make a "25/5 x4"
// block 130 minutes instead of the 115 every pomodoro timer in the world uses.
//
// So the long rest begins after the FOURTH work block, which ends at
// 4*W + 3*R = 115 minutes. (The offsets below are counted from the start of the
// sequence: work1 0-25, rest1 25-30, work2 30-55, rest2 55-60, work3 60-85,
// rest3 85-90, work4 90-115, long 115-130.)
check('rounds 1-3 are followed by a short rest',
    [phaseAt(W, pomodoro), phaseAt(W + R + W, pomodoro), phaseAt(2 * W + 2 * R + W, pomodoro)]
        .every(p => p?.kind === 'rest'));

// The fourth work block starts at 3*W + 3*R = 90 minutes, and running long means
// this is what the long rest has to be checked against. The default config stops
// at four rounds, so the long rest is only reachable on a longer run -- checked
// below with an eight-round config.
check('the fourth work block is work, not a rest',
    phaseAt(3 * W + 3 * R, pomodoro)?.kind === 'work', phaseAt(3 * W + 3 * R, pomodoro)?.kind);
check('with eight rounds, round 4 is followed by a long rest',
    phaseAt(3 * W + 3 * R + W, { ...pomodoro, totalRounds: 8 })?.kind === 'long',
    phaseAt(3 * W + 3 * R + W, { ...pomodoro, totalRounds: 8 })?.kind);
// A full four-round block that *is* followed by a long rest: 4 x work, three short
// rests, then the long one. 100 + 15 + 15 = 130 minutes. This is the block length
// that only matters once the run outlasts one block, which is why the four-round
// total below is shorter than 2 x this.
const BLOCK_WITH_LONG = 4 * W + 3 * R + LR;

check('and rounds 5-7 go back to a short rest',
    // Round r starts one (work + short rest) after the block for r > 4, so its own
    // short rest begins W after that.
    [5, 6, 7].every(round =>
        phaseAt(BLOCK_WITH_LONG + (round - 5) * (W + R) + W, { ...pomodoro, totalRounds: 8 })?.kind === 'rest'
    ));

// A four-round run is 4 x work + three short rests and nothing else -- 115
// minutes. The long rest is never reached because there is no round after the
// fourth to rest into, which is exactly right: a run does not end by announcing
// a break it is not going to take.
check('the classic block is 115 minutes', intervalTotalMs(pomodoro) === 115 * MINUTE,
    `${intervalTotalMs(pomodoro) / MINUTE}m`);

// Eight rounds: one full block with its long rest (130m), then three more
// work + short rest pairs (90m), then a final bare work block (25m). No trailing
// rest -- same reason as above.
check('an eight-round run is a full block plus three more rounds',
    intervalTotalMs({ ...pomodoro, totalRounds: 8 }) === BLOCK_WITH_LONG + 3 * (W + R) + W,
    `${intervalTotalMs({ ...pomodoro, totalRounds: 8 }) / MINUTE}m`);

// The run ends when the last work block ends -- no trailing rest, because a
// countdown that keeps ticking through a break after the final round is a timer
// that tells you it is still going.
check('the run is over at the end of the last work block',
    phaseAt(4 * W + 3 * R, pomodoro) === null, String(phaseAt(4 * W + 3 * R, pomodoro)?.kind));
check('but not one millisecond before',
    phaseAt(4 * W + 3 * R - 1, pomodoro)?.kind === 'work');
check('a phase with no rest configured still ends after the work',
    phaseAt(W, { ...pomodoro, restSec: 0, longRestSec: 0, roundsBeforeLong: 0 })?.kind === 'work'
    || phaseAt(W, { ...pomodoro, restSec: 0, longRestSec: 0, roundsBeforeLong: 0 }) === null);

// The property the whole interval design rests on: the phase is a pure function
// of elapsed time. A counter has to be stepped by something on a timer, so a
// backgrounded tab would overshoot; re-deriving cannot drift.
check('the phase is a function of elapsed, not of ticks', (() => {
    // Deep inside round 3's work block (60-85 minutes), ten seconds in.
    const at = 2 * W + 2 * R + 10_000;
    let last = null;
    // Poll a thousand times, as a throttled tab would, and land on the same answer.
    for (let i = 0; i < 1000; i++) last = phaseAt(at, pomodoro);
    return last?.kind === 'work' && last?.round === 3;
})());

check('an unbounded run never reports finished', (() => {
    const open = { ...pomodoro, totalRounds: 0 };
    // Ten hours in, the run is still going.
    return phaseAt(10 * HOUR, open) !== null;
})());
check('an unbounded run has no total', intervalTotalMs({ ...pomodoro, totalRounds: 0 }) === null);

// Pausing and resuming must not grant extra time. The engine banks elapsed at the
// pause and resumes from it, so the phase at the same total elapsed is unchanged
// -- which is only true if `phaseAt` depends on elapsed alone.
check('a pause grants no extra time', (() => {
    const beforePause = phaseAt(W, pomodoro);
    const afterPause = phaseAt(W, pomodoro);
    return beforePause?.kind === afterPause?.kind
        && beforePause?.index === afterPause?.index
        && beforePause?.remainingMs === afterPause?.remainingMs;
})());

check('zero-length work is refused rather than looping',
    phaseAt(0, { ...pomodoro, workSec: 0 }) === null);
check('a negative elapsed is treated as zero', phaseAt(-5000, pomodoro)?.round === 1);

check('a long rest round is every Nth', [1, 2, 3, 4, 5].map(r => isLongRestRound(pomodoro, r))
    .join(',') === 'false,false,false,true,false');
check('the default config is a classic pomodoro',
    DEFAULT_INTERVAL.workSec === 1500 && DEFAULT_INTERVAL.roundsBeforeLong === 4);

// The default session is unbounded. This was 4, which contradicted the card's own
// copy -- it said "Runs until you stop it" while stopping after four rounds -- and
// a timer that ends on a number nobody picked is wrong for the one mode people
// leave running while they get on with something. `0` is the until-stopped value
// `intervalTotalMs` and `phaseAt` already understand.
check('and the default run is unbounded, not four rounds',
    DEFAULT_INTERVAL.totalRounds === 0,
    `expected 0 (until stopped), got ${DEFAULT_INTERVAL.totalRounds}`);
check('so the default has no total length to count down to',
    intervalTotalMs(DEFAULT_INTERVAL) === null);
check('but still takes its long rest after the fourth round',
    isLongRestRound(DEFAULT_INTERVAL, 4) && !isLongRestRound(DEFAULT_INTERVAL, 3));
// The four is still here on purpose and it is a different question: the shape of a
// long session, not where it ends.
check('which is a separate setting from the number of rounds',
    DEFAULT_INTERVAL.roundsBeforeLong === 4 && DEFAULT_INTERVAL.totalRounds === 0);

// ============================================================================
// SCHEDULED START
// ============================================================================

console.log('\n== scheduled start ==');

// Local-time constructors throughout, so nothing here depends on the machine's zone.
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo, d, h, mi, 0, 0).getTime();

check('no schedule by default', DEFAULT_INTERVAL.startAt === null);
check('an unset schedule has no next time', nextStartAt(null, at(2026, 0, 5, 10)) === null);

// Local midnight, so the hour and minute assertions cannot be thrown off by a zone.
check('a time still ahead today is today', nextStartAt(9 * 60, at(2026, 0, 5, 6)).getTime()
    === at(2026, 0, 5, 9));
check('a time already past today is tomorrow', nextStartAt(9 * 60, at(2026, 0, 5, 11)).getTime()
    === at(2026, 0, 6, 9));
check('and it is strictly after, always',
    [0, 1, 9 * 60, 12 * 60, 23 * 60 + 59].every(m => nextStartAt(m, at(2026, 0, 5, 10)).getTime() > at(2026, 0, 5, 10)));
// This is the property that makes a closed tab safe rather than surprising: a page
// that was shut across the due time must not start a session hours late on reopen.
check('so a minute that has passed waits for tomorrow rather than firing late',
    nextStartAt(9 * 60, at(2026, 0, 5, 23)).getTime() === at(2026, 0, 6, 9));
check('including exactly on the minute',
    nextStartAt(9 * 60, at(2026, 0, 5, 9)).getTime() === at(2026, 0, 6, 9),
    'strictly after, so 09:00:00 does not count as still-ahead');

// The minute and hour are recombined, so 09:05 must come back as 09:05 rather than
// as whatever a single division gives.
check('the minute is not dropped when it is folded back out',
    nextStartAt(9 * 60 + 5, at(2026, 0, 5, 6)).getHours() === 9
    && nextStartAt(9 * 60 + 5, at(2026, 0, 5, 6)).getMinutes() === 5);
// Midnight is the boundary a `Math.floor(minute / 60)` gets wrong by being off by a
// day rather than by a minute. It also cannot fire "today" at all, and that is
// correct rather than a bug: 00:00 today has already gone by at any moment you could
// arm it, so it always means the start of the day ahead.
check('midnight comes back as midnight',
    nextStartAt(0, at(2026, 0, 5, 6)).getTime() === at(2026, 0, 6, 0)
    && nextStartAt(0, at(2026, 0, 5, 0)).getTime() === at(2026, 0, 6, 0));
check('and it means the start of the day ahead, not tonight',
    nextStartAt(0, at(2026, 0, 5, 22)).getHours() === 0
    && nextStartAt(0, at(2026, 0, 5, 22)).getDate() === 6,
    'armed at 22:00, 00:00 has to mean midnight tonight');
check('and the last minute of the day is 23:59, not 24:00',
    nextStartAt(23 * 60 + 59, at(2026, 0, 5, 6)).getHours() === 23);

// Clamped rather than rejected, so a corrupted blob becomes the nearest real time
// instead of silently becoming "no schedule" -- which is the difference between
// starting slightly wrong and not starting at all, with nothing saying which.
check('an out-of-range minute is clamped to the nearest real one',
    nextStartAt(9 * 60 + 900, at(2026, 0, 5, 6)).getTime() === at(2026, 0, 5, 23, 59)
    && nextStartAt(-500, at(2026, 0, 5, 6)).getTime() === at(2026, 0, 6, 0));
check('and the normaliser does the same, rather than discarding it',
    normalizeIntervalConfig({ startAt: 99999 }).startAt === 24 * 60 - 1
    && normalizeIntervalConfig({ startAt: -1 }).startAt === 0);
check('a non-numeric schedule is no schedule',
    normalizeIntervalConfig({ startAt: 'nine' }).startAt === null
    && normalizeIntervalConfig({ startAt: NaN }).startAt === null);
check('and one that was never there stays null',
    normalizeIntervalConfig({ workSec: 60 }).startAt === null);

// A preset carries no schedule, which is why there is no column for one.
check('a preset row restores with no schedule',
    normalizeIntervalConfig({ workSec: 1500 }).startAt === null
    && JSON.parse(JSON.stringify(DEFAULT_INTERVAL)).startAt === null);

// ============================================================================
// ALARMS
// ============================================================================

console.log('\n== alarms ==');

// A local Date constructor, so the assertions do not depend on the machine's zone.
const noon = new Date(2026, 5, 15, 12, 0, 0, 0);

check('a one-shot alarm later today fires today',
    nextAlarmFire({ hour: 18, minute: 30, days: [] }, noon).getTime() === new Date(2026, 5, 15, 18, 30).getTime(),
    nextAlarmFire({ hour: 18, minute: 30, days: [] }, noon).toString());
check('a one-shot alarm already past fires tomorrow',
    nextAlarmFire({ hour: 7, minute: 30, days: [] }, noon).getDate() === 16,
    nextAlarmFire({ hour: 7, minute: 30, days: [] }, noon).toString());
check('a one-shot alarm fires once, not weekly', describeAlarmDays([]) === 'Once');

// The scan is over the local calendar, so the rollover is the platform's and
// stays right across a DST boundary. An alarm is a wall-clock statement, and
// adding 24h to a timestamp to find "tomorrow" is wrong twice a year.
check('a daily alarm finds the right weekday', (() => {
    // 2026-06-15 is a Monday, so the next Wednesday is the 17th.
    const next = nextAlarmFire({ hour: 9, minute: 0, days: [3] }, noon);
    return next.getDate() === 17 && next.getDay() === 3;
})(), nextAlarmFire({ hour: 9, minute: 0, days: [3] }, noon).toString());

check('a later time today wins over the same day next week',
    nextAlarmFire({ hour: 23, minute: 0, days: [1] }, noon).getDate() === 15);

// The boundary is strict, so an alarm set for the current minute does not
// repeatedly resolve to "right now" -- which the scheduler would read as due on
// every single check and ring forever.
check('an alarm at the current minute is not in the past', (() => {
    const at = new Date(2026, 5, 15, 12, 0, 0);
    const next = nextAlarmFire({ hour: 12, minute: 0, days: [1] }, at);
    return next.getTime() > at.getTime();
})());

check('a Sunday alarm after a Monday finds the next Sunday', (() => {
    const next = nextAlarmFire({ hour: 9, minute: 0, days: [0] }, noon);
    return next.getDay() === 0 && next.getDate() === 21;
})());

check('an all-days alarm reads as every day', describeAlarmDays([0, 1, 2, 3, 4, 5, 6]) === 'Every day');
check('Mon-Fri reads as weekdays', describeAlarmDays([1, 2, 3, 4, 5]) === 'Weekdays');
check('Sat-Sun reads as weekends', describeAlarmDays([0, 6]) === 'Weekends');
check('a single day reads as itself', describeAlarmDays([3]) === 'Wed');
// Weekday order, not numeric -- so Sunday reads last rather than first.
check('a scattered set is in week order', describeAlarmDays([5, 1, 0]) === 'Mon, Fri, Sun',
    describeAlarmDays([5, 1, 0]));

// ============================================================================
// LAPS
// ============================================================================

console.log('\n== laps ==');

const laps = buildLaps([30_000, 90_000, 120_000]);
check('three marks make three laps', laps.length === 3);
check('the first split is the mark itself', laps[0].splitMs === 30_000, String(laps[0].splitMs));
check('a later split is the difference between marks', laps[1].splitMs === 60_000, String(laps[1].splitMs));
check('the total is cumulative', laps[2].totalMs === 120_000, String(laps[2].totalMs));
check('laps are numbered from 1', laps.map(l => l.index).join(',') === '1,2,3');
check('no marks means no laps', buildLaps([]).length === 0);

// ============================================================================
// THE ALERT
// ============================================================================

// There are no settings any more, and that is the point rather than a gap in the
// coverage. The panel they lived on held a slider and four switches for one sound
// and three behaviours, and every one of those was a way for a finished timer to
// end in silence -- which is the failure this page exists to prevent, offered as
// four checkboxes. So there is nothing left to normalise, coerce or validate, and
// what remains is a level and a list of one.
console.log('\n== the alert ==');

check('there is exactly one sound to choose', CHIMES.length === 1, String(CHIMES.length));
check('and it is the one the player knows', CHIMES[0].id === 'chime', CHIMES[0].id);
check('the id is a single-member union, so nothing can be asked for that is not there',
    CHIMES.every(c => c.id === 'chime'));

// The level has to be a real number in range, because an `undefined` or a NaN
// reaching the gain node is a silent failure -- the timer ends and makes no sound,
// which is precisely what nobody would notice until they needed it.
check('the alert level is a number', typeof ALERT_VOLUME === 'number', typeof ALERT_VOLUME);
check('and in range', ALERT_VOLUME > 0 && ALERT_VOLUME <= 1, String(ALERT_VOLUME));
// Loud enough to be heard across a room, which is the whole point of a chime.
check('and audible rather than a token level', ALERT_VOLUME >= 0.5, String(ALERT_VOLUME));
check('but not the ceiling, so it is not startling either', ALERT_VOLUME < 1, String(ALERT_VOLUME));

// And the notification is unconditional: there is no switch left to turn it off,
// so the only question the engine asks is whether the browser will take one.
const engineSource = readFileSync(join(root, 'src/hooks/useTimerEngine.tsx'), 'utf8');
check('the alert always raises a notification',
    /playChime\(ALERT_VOLUME\);\s*\n\s*void showNotification\(/.test(engineSource),
    'gated, it is a switch for the timer to end in silence');
check('and nothing in the engine can turn it off',
    !/args\.notify/.test(engineSource) && !/ChimeArgs/.test(engineSource));
check('nor the page',
    !/notify:/.test(readFileSync(join(root, 'src/Pages/TimerPage.tsx'), 'utf8')));

// Same reasoning for the screen lock: a timer that dims the display halfway
// through looks exactly like a timer that stopped.
check('and the screen lock is held unconditionally too',
    /useWakeLock\(engine\.running\)/.test(
        readFileSync(join(root, 'src/Pages/TimerPage.tsx'), 'utf8')),
    'gated, it is a switch for the screen to go dark mid-run');

// Same reasoning for an interval config arriving from a preset row, which can be
// null in every column and is not guaranteed to have been written by this build.
check('a null interval config becomes the default',
    JSON.stringify(normalizeIntervalConfig(null)) === JSON.stringify(DEFAULT_INTERVAL));
check('a partial interval config is filled in',
    normalizeIntervalConfig({ workSec: 60 }).restSec === DEFAULT_INTERVAL.restSec);
check('a zero-length phase is raised to one second',
    normalizeIntervalConfig({ workSec: 0 }).workSec === 1, String(normalizeIntervalConfig({ workSec: 0 }).workSec));
// 24 hours, matching the database's own CHECK on timer_presets.work_seconds.
check('an absurd phase is capped at 24 hours', normalizeIntervalConfig({ workSec: 999999 }).workSec === 86400,
    String(normalizeIntervalConfig({ workSec: 999999 }).workSec));
// A phase is a duration, so 1499.6s is 1499s of work. Rounding up would hand the
// user 0.4s they did not ask for.
check('a fractional phase is floored, not rounded',
    normalizeIntervalConfig({ workSec: 1499.6 }).workSec === 1499,
    String(normalizeIntervalConfig({ workSec: 1499.6 }).workSec));
// A count, and `Math.round` on one is worse than on a duration: 3.7 rounds would
// silently become a four-round run, longer than the row describes.
check('a fractional round count is floored, not rounded',
    normalizeIntervalConfig({ totalRounds: 3.7 }).totalRounds === 3,
    String(normalizeIntervalConfig({ totalRounds: 3.7 }).totalRounds));

// The normaliser rebuilds the object from scratch rather than spreading what it was
// given, so a field that is dropped from the config actually disappears rather than
// riding along forever in a stored blob.
check('and the normaliser rebuilds rather than spreads',
    /return \{[\s\S]{0,600}?workSec: seconds\(/.test(readFileSync(join(root, 'src/utils/timerMath.ts'), 'utf8')),
    'a spread would carry a removed field through forever');

// `startAt` was a wall-clock minute of day that nothing ever read. It was removed for
// that reason and put back only once there was something on the other side of it, so
// the property worth pinning is that it is *read* -- a field with a control and no
// reader is the exact bug this replaced.
check('something reads the schedule, rather than only a field writing it',
    /nextStartAt\(startAt, Date\.now\(\)\)/.test(engineSource),
    'a control that accepts a value and ignores it is worse than no control');
// Delegated rather than reimplemented, so there is one calendar walk and not two.
check('through the one helper, so the date arithmetic is not duplicated',
    /nextStartAt/.test(readFileSync(join(root, 'src/utils/timerMath.ts'), 'utf8'))
    && /nextAlarmFire\([\s\S]{0,160}days: \[\]/.test(
        readFileSync(join(root, 'src/utils/timerMath.ts'), 'utf8')));
// One-shot by construction: the schedule is cleared in the same update that starts
// the run, so there is no "already fired today" flag to fall out of step.
check('and it clears itself in the same update that starts the run',
    /intervalConfig: \{ \.\.\.prev\.intervalConfig, startAt: null \}/.test(engineSource));
// A finished run leaves `elapsedBefore` at the end of the sequence, so a scheduled
// start that did not reset it would begin a new session already finished and alert
// on its first tick -- the bug `start()` already has a branch for.
check('a scheduled start resets a finished run rather than resuming its end',
    /const exhausted = phaseAt\(prev\.elapsedBefore, prev\.intervalConfig\) === null/.test(engineSource));
// It arms only in interval mode. The field is on the interval card, and arming it
// while a countdown is on screen would start a different kind of run than the one it
// was set on.
check('and it arms for the interval session only',
    /if \(current\.mode !== 'interval'\) return;/.test(engineSource));
// Starting a session is not something to be woken for; the ring starting to move is
// the feedback. An alert here would fire in a tab nobody is looking at.
check('and starting on its own is silent',
    !/fireAlert[\s\S]{0,80}schedule/i.test(engineSource));

// What comes back out of localStorage goes through the same normaliser as a
// database row. The blob is written by whichever build last ran and read by
// whichever is running now, so trusting it raw is how a deleted field and an
// out-of-range phase length both survive a reload.
check('a restored config is normalised, not trusted raw',
    /intervalConfig: normalizeIntervalConfig\(parsed\.intervalConfig\)/.test(engineSource));
// And normalised *before* the running check, which replays elapsed time through the
// config to decide which phase a closed tab wakes up in.
check('before the restore decides whether it is still running',
    /const restored[\s\S]{0,200}normalizeIntervalConfig[\s\S]{0,400}restoreRunning\(restored/.test(engineSource),
    'a raw config here can put the restored phase in the wrong place');

// ============================================================================

// ============================================================================
// THE ENGINE, IN A DOM
// ============================================================================

// Everything above is arithmetic. These are the behaviours that arithmetic exists
// to make possible, and they cannot be asserted without React: a countdown that
// derives from its deadline rather than counting ticks is only meaningful if a
// reload or a throttled tab cannot lose time, and the only way to show that is to
// build the engine, let real time pass, and look.
//
// Loading follows `verify-popover-dismissal.mjs`: Node cannot handle JSX, and the
// transpiled output has to land inside `node_modules` so its own `react` import
// resolves against this project's copy.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
});
const { window } = dom;
// A define rather than a plain write: Node 24 defines `navigator` as a getter-only
// global, and assigning to it throws rather than shadowing it.
const install = (key, value) =>
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
for (const key of [
    'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
    'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'DocumentFragment',
    'HTMLInputElement', 'HTMLButtonElement', 'FocusEvent', 'localStorage',
]) {
    install(key, window[key]);
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const loadComponent = async relative => {
    const source = readFileSync(join(root, relative), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
        },
    });
    // Relative imports are rewritten to absolute file URLs pointing at the real
    // source, because the transpiled copy lives somewhere else entirely: `../utils/
    // timerMath` means nothing from inside node_modules. Resolving them at the
    // original path is also what keeps this honest -- the engine under test is
    // the engine that ships, sharing the real timerMath, not a copy of it.
    const sourceDir = dirname(join(root, relative));
    // The extension has to be explicit in the rewritten URL. Node resolves a
    // `file:` URL literally -- the extensionless-to-.ts trick in
    // lib/ts-extension-resolver-hooks.mjs only applies to relative specifiers,
    // and it deliberately passes absolute ones straight through.
    const withExtension = path => (
        existsSync(`${path}.ts`) ? `${path}.ts`
            : existsSync(`${path}.tsx`) ? `${path}.tsx`
                : path
    );
    const rewritten = outputText.replace(
        /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.[^'"]*)\2/g,
        (match, prefix, quote, specifier) => {
            const resolved = withExtension(join(sourceDir, specifier)).replace(/\\/g, '/');
            return `${prefix}${quote}file:///${resolved}${quote}`;
        },
    );

    const dir = join(root, 'node_modules', '.tmp', 'verify-timer');
    mkdirSync(dir, { recursive: true });
    const name = relative.replace(/[\\/]/g, '_').replace(/\.tsx?$/, '.engine.mjs');
    const target = join(dir, name);
    writeFileSync(target, rewritten, 'utf8');
    return import(`file://${target.replace(/\\/g, '/')}`);
};

console.log('\n== the engine, driven ==');

// `localStorage` is stubbed before the engine module is imported, because it reads
// its persisted deadline during the first render of the provider.
const store = new Map();
install('localStorage', {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
    clear: () => { store.clear(); },
});

// The engine asks for sound on expiry. Stubbed so the test does not need an audio
// device, and so the fact that an alert fired is *observable* -- which is the
// property actually being tested.
const played = [];
install('AudioContext', class {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createGain() {
        return {
            gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} },
            connect() {}, disconnect() {},
        };
    }
    createOscillator() {
        return {
            type: 'sine', frequency: { setValueAtTime() {} },
            connect() {}, start() {}, stop() {}, addEventListener() {},
        };
    }
    resume() { return Promise.resolve(); }
});

const { TimerEngineProvider, useTimer } = await loadComponent('src/hooks/useTimerEngine.tsx');

/**
 * Mounts the provider and hands back the engine plus a way to read it from outside
 * React.
 *
 * `seen` is refreshed by a component that renders inside the provider, because the
 * assertions below need the *rendered* value -- the point is that the display
 * shows the right time, not that a field was assigned.
 */
const mountEngine = async () => {
    const container = window.document.createElement('div');
    window.document.body.appendChild(container);
    const root = createRoot(container);
    let api = null;

    const Probe = () => {
        api = useTimer();
        return null;
    };

    /**
     * Let one repaint interval fire, then settle React.
     *
     * The engine only recomputes `now` inside its own `setInterval`, so moving the
     * wall clock alone changes nothing observable. Waiting out one real interval is
     * what makes the new time reach the derived values -- and the wait is on the
     * *real* clock deliberately. Advancing the fake one faster would only make the
     * engine repaint sooner, not prove anything about a tab whose ticks were
     * throttled, which is the case several of these assertions exist for.
     */
    const refresh = async () => {
        // The wait itself has to be inside `act`, because the interval fires during
        // it and React will warn about an update it did not see. Wrapping only the
        // microtask drain afterwards leaves the warning and produces the same result.
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 260));
        });
    };

    // The first render is synchronous, so `api` is populated the moment this
    // returns -- the async `refresh` above is only for later ticks.
    await act(async () => {
        root.render(React.createElement(TimerEngineProvider, null, React.createElement(Probe)));
    });
    return { api: () => api, refresh, root, container };
};

/**
 * A controllable wall clock.
 *
 * Patched on `globalThis.Date`, not on `window.Date`: the engine calls bare
 * `Date.now()`, which resolves against the Node global rather than jsdom's own
 * `Date`. Patching the wrong one produces a test that passes against real time --
 * every assertion about "time passed" would be measuring how long the test took,
 * which is close enough to zero to look like a hang rather than a failure.
 */
/**
 * A frozen synthetic clock.
 *
 * Frozen rather than offset-from-real, because the engine only reads the wall
 * clock inside its repaint interval, and every `refresh()` below waits out a real
 * one. With real time still flowing underneath, that wait leaks into every elapsed
 * measurement -- a lap asserted at exactly 2000ms comes out as 2001ms because the
 * test spent a millisecond of its own time waiting. A deterministic clock is what
 * lets the assertions use exact values at all.
 *
 * Frozen, not paused: `refresh` still has to wait for the interval to fire, but
 * what it reads when it does is entirely determined by `advance`.
 */
const EPOCH = 1_700_000_000_000;
let clockOffset = 0;
const shiftedNow = () => EPOCH + clockOffset;
Object.defineProperty(Date, 'now', { value: shiftedNow, configurable: true, writable: true });
window.Date.now = shiftedNow;

/** Advance the wall clock the engine reads. */
const advance = ms => { clockOffset += ms; };

// A three-second countdown, so expiry is reachable without the test taking long.
const engine = await mountEngine();

act(() => { engine.api().setDuration(3000); });
check('a duration is accepted', engine.api().totalMs === 3000, String(engine.api().totalMs));
check('nothing is running before start', engine.api().running === false);

// The bug this file's clock is worth more than: `now` lives in state and only
// advances inside the repaint interval, which does not exist until something is
// running. So a page left sitting on the pad had a `now` from mount, and pressing
// Start set a deadline from the real clock -- and `remaining` then measured the
// gap as time still to run. A 59 second timer read 01:07 after eight idle
// seconds, which is exactly how it was reported.
advance(8000);
act(() => { engine.api().start(); });
check('starting after sitting idle does not add the idle time to the countdown',
    engine.api().remaining === 3000, `${engine.api().remaining} of ${engine.api().totalMs}`);
check('and the ring agrees with the digits rather than being a tick behind them',
    engine.api().progress === 0, String(engine.api().progress));

act(() => { engine.api().start(); });
check('starting marks it running', engine.api().running === true);
check('a running countdown has a deadline', typeof engine.api().deadline === 'number');
check('the deadline is in the future',
    engine.api().deadline > window.Date.now(), String(engine.api().deadline));
check('the ring starts empty and fills',
    engine.api().progress === 0, String(engine.api().progress));

// The core property. A tick counter would have subtracted 500ms per tick; a
// deadline-based one reads the wall clock, so time that passed without anybody
// ticking is still accounted for.
advance(1000);
await engine.refresh();
check('a second of wall time is a second of countdown',
    engine.api().remaining === 2000, String(engine.api().remaining));

// The throttled-tab case, which is the one a counter cannot survive. In a frozen
// or background tab the interval stops firing entirely; the deadline does not move.
advance(60_000);
await engine.refresh();
check('a minute of un-ticked time still expires the timer',
    engine.api().remaining === 0, String(engine.api().remaining));
check('the engine reports it stopped',
    engine.api().running === false, String(engine.api().running));
check('and raises time’s up',
    engine.api().alert?.kind === 'timeup', JSON.stringify(engine.api().alert));

// Pausing must not grant extra time. Resume pushes the deadline forward by the
// paused duration; if it did not, a paused timer would silently gain minutes.
// A refresh before the pause is deliberate: remaining is derived from `now`, which
// only the repaint interval advances. Reading it straight after pausing would read
// the last tick rather than the moment of the pause.
act(() => { engine.api().reset(); });
act(() => { engine.api().setDuration(3000); });
act(() => { engine.api().start(); });
await engine.refresh();
act(() => { engine.api().pause(); });
await engine.refresh();
check('pausing stops it', engine.api().running === false);
check('remaining is frozen while paused', engine.api().remaining === 3000, String(engine.api().remaining));

// Five seconds pass with it paused. Nothing repaints, so nothing notices -- which is
// the point: remaining is not accumulated from ticks.
advance(5000);
act(() => { engine.api().start(); });
await engine.refresh();
check('time spent paused is not counted', engine.api().remaining === 3000, String(engine.api().remaining));

// Reset clears everything a reset should clear.
act(() => { engine.api().reset(); });
check('reset drops the deadline', engine.api().deadline === null);
check('reset clears elapsed', engine.api().elapsed === 0, String(engine.api().elapsed));

// Adding time moves the deadline and the total together. If only the deadline
// moved, the ring's denominator would be stale and the arc would jump backwards.
// Start, refresh so the deadline exists against the current clock, then read the
// total before extending.
act(() => { engine.api().setDuration(1000); });
act(() => { engine.api().start(); });
await engine.refresh();
const beforeAdd = engine.api().totalMs;
act(() => { engine.api().addMinutes(5); });
await engine.refresh();
check('+5 min extends the deadline by five minutes',
    engine.api().deadline !== null && engine.api().deadline - shiftedNow() > 5 * MINUTE - 2000,
    String(engine.api().deadline));
check('and grows the total, so the ring does not jump',
    engine.api().totalMs === beforeAdd + 5 * MINUTE,
    `${beforeAdd} -> ${engine.api().totalMs}`);

// An expired countdown must not "resume" from zero -- that is the stuck-timer
// symptom, where pressing Start appears to do nothing and instantly re-alerts.
advance(20 * MINUTE);
await engine.refresh();
check('it expired', engine.api().alert?.kind === 'timeup', JSON.stringify(engine.api().alert));
act(() => { engine.api().dismissAlert(); });
await engine.refresh();
check('dismissing clears the alert', engine.api().alert === null);
check('and the timer stays stopped', engine.api().running === false);
act(() => { engine.api().start(); });
await engine.refresh();
check('starting again re-arms from the full length',
    engine.api().remaining === engine.api().totalMs,
    `${engine.api().remaining} of ${engine.api().totalMs}`);
check('and clears the old alert', engine.api().alert === null, JSON.stringify(engine.api().alert));
check('and is running again', engine.api().running === true, String(engine.api().running));
check('the deadline is a whole length ahead of now',
    engine.api().deadline !== null && engine.api().deadline >= shiftedNow(),
    `${engine.api().deadline} vs now ${shiftedNow()}`);

// Persistence. The deadline is written on every state change, and read back on
// mount -- this is what makes a timer survive a reload.
advance(0);
const persisted = store.get('anthroweb:timer:v1');
check('the running timer is persisted', !!persisted, String(persisted));
if (persisted) {
    const parsed = JSON.parse(persisted);
    // The shape is the design, not an implementation detail. A persisted *count*
    // -- "elapsed so far" -- is what cannot survive a reload, so asserting the
    // keys here is asserting that the thing which makes a timer survive is the
    // thing that is actually stored.
    check('and stores a deadline, not a count',
        typeof parsed.deadline === 'number' && typeof parsed.legStartedAt === 'number',
        JSON.stringify({ deadline: parsed.deadline, legStartedAt: parsed.legStartedAt }));
    check('with no accumulated elapsed to drift',
        !Object.keys(parsed).some(key => /^remaining|elapsed$/.test(key)),
        JSON.stringify(Object.keys(parsed)));
    // The deadline outlives the tab by construction. It is derived from a wall
    // clock rather than accumulated, so however long the document is closed, the
    // restored timer knows exactly what is left -- or that it expired.
    check('the deadline is still in the future, so a reload resumes the run',
        parsed.deadline > shiftedNow(), `${parsed.deadline} vs now ${shiftedNow()}`);
    check('and it is a real future deadline rather than zero',
        parsed.deadline - shiftedNow() > 0 && parsed.deadline - shiftedNow() <= engine.api().totalMs,
        String(parsed.deadline - shiftedNow()));
}

// The reload case, and the reason persistence exists at all. The second mount reads
// the same localStorage key the first one wrote, and finds a run that is still in
// the future -- so the timer a user reloads into is the timer they left, not one
// restarted from zero or, worse, one that expired while the tab was closed.
const reloaded = await mountEngine();
check('a fresh mount restores the running timer', reloaded.api().running === true,
    String(reloaded.api().running));
check('and the same deadline',
    reloaded.api().deadline === engine.api().deadline,
    `${reloaded.api().deadline} vs ${engine.api().deadline}`);

// Mode switching abandons the loaded run rather than converting it, because a
// stopwatch carries no duration and an interval carries a shape.
//
// But it is *refused* while there is time left to run, rather than stopping it.
// That is the fix: this used to set `running: false`, so touching the mode chips
// mid-run silently threw the run away -- no alert, no confirmation, the display
// simply reset. The two controls already in that panel refused instead of
// stopping, and this was the odd one out.
act(() => { reloaded.api().setMode('stopwatch'); });
check('switching mode mid-run is refused', reloaded.api().mode === 'countdown',
    String(reloaded.api().mode));
check('and the run is untouched by the attempt', reloaded.api().running === true);
check('with its deadline intact', reloaded.api().deadline !== null);

// The other half of the same question, and the one that was reported as "I used
// the countdown and now I cannot pick stopwatch or intervals".
//
// Stored `running` is a historical fact -- the user pressed start -- and it stays
// true after a run finishes on purpose, so that a loaded run survives a reload.
// The UI reads the *derived* flag, which is false the moment a run ends. Testing
// the stored flag in `setMode` therefore left the buttons looking enabled and
// doing nothing at all, for as long as the finished countdown stayed loaded. Only
// Reset cleared it, which is why it looked like the modes had been taken away.
//
// The run has to actually finish first: `reloaded` restored a countdown with
// time still on it, and refusing mid-run is the case above.
advance(20 * MINUTE);
await reloaded.refresh();
check('the run has ended', reloaded.api().running === false);
act(() => { reloaded.api().dismissAlert(); });
await reloaded.refresh();
act(() => { reloaded.api().setMode('stopwatch'); });
check('so switching mode after a run has ended is allowed',
    reloaded.api().mode === 'stopwatch', reloaded.api().mode);
check('and clears the expired deadline with it',
    reloaded.api().deadline === null, String(reloaded.api().deadline));
check('rather than leaving a finished run flagged as running',
    reloaded.api().running === false);

// The same test governs the pad, which is the other control that used to go dead
// on a finished countdown.
act(() => { reloaded.api().setMode('countdown'); });
act(() => { reloaded.api().setDuration(5000); });
check('the pad is live again once the run is over', reloaded.api().totalMs === 5000,
    String(reloaded.api().totalMs));

// Stopped, the switch goes through and does clear the loaded run.
act(() => { reloaded.api().pause(); });
act(() => { reloaded.api().setMode('stopwatch'); });
check('switching mode clears the deadline', reloaded.api().deadline === null);
check('and the elapsed time', reloaded.api().elapsed === 0, String(reloaded.api().elapsed));
check('and lands on the requested mode', reloaded.api().mode === 'stopwatch');
// No end to measure against, so no arc to draw. A ring that fills toward nothing
// is decoration pretending to be a measurement.
check('and has no ring fraction, because a stopwatch has no end',
    reloaded.api().progress === null, String(reloaded.api().progress));

// Laps are stopwatch-only, and a lap at a fixed zero is a split of nothing.
act(() => { reloaded.api().start(); });
advance(2000);
act(() => { reloaded.api().addLap(); });
advance(3000);
act(() => { reloaded.api().addLap(); });
check('two laps recorded', reloaded.api().laps.length === 2, String(reloaded.api().laps.length));
// Cumulative, not per-lap: the second mark is at 2s + 3s = 5s of total elapsed.
// A lap list holding per-lap deltas would show 3s here, which is the bug the
// distinction exists to catch.
check('the first lap is at 2s', reloaded.api().laps[0] === 2000, String(reloaded.api().laps[0]));
check('the second lap is at 5s, cumulative', reloaded.api().laps[1] === 5000, String(reloaded.api().laps[1]));
check('a lap while stopped is refused', (() => {
    act(() => { reloaded.api().pause(); });
    const before = reloaded.api().laps.length;
    act(() => { reloaded.api().addLap(); });
    return reloaded.api().laps.length === before;
})());

// Unmounting must not leave the repaint loop running. A leaked frame loop keeps a
// whole component tree's worth of work alive for the life of the document, and
// the only symptom is a tab that gets hot for no visible reason -- which matters
// more now than it did, since the loop runs on every animation frame rather than
// five times a second.
//
// Counted on a *running* engine, because an engine that is not running has no
// loop to leak -- asserting this against a stopped one would pass whether or not
// the cleanup existed.
// Patched on `window` rather than on `globalThis`: the engine calls
// `window.cancelAnimationFrame`, and a wrapper on the Node global would never be
// reached.
const originalCancel = window.cancelAnimationFrame;
const originalClear = window.clearInterval;
const originalSet = window.setInterval;
let cancelled = 0;
let cleared = 0;
let created = 0;
window.cancelAnimationFrame = id => { cancelled++; return originalCancel.call(window, id); };
window.setInterval = (...args) => { created++; return originalSet.apply(window, args); };
window.clearInterval = id => { cleared++; return originalClear.call(window, id); };

act(() => { engine.api().reset(); });
act(() => { engine.api().setDuration(30_000); });
act(() => { engine.api().start(); });
await engine.refresh();
check('it is running, so there is a repaint loop to leak', engine.api().running === true,
    String(engine.api().running));

act(() => { engine.root.unmount(); });
check('unmounting cancels the scheduled frame', cancelled > 0, `${cancelled} frames cancelled`);
// Every timer started is a timer stopped, rather than "no timers exist". The
// scheduled-start checker polls once a second, so it legitimately owns one; what
// must not survive unmount is the interval itself, and an assertion of "zero
// intervals" would be satisfied only by deleting the feature.
check('and every interval it started is cleared', cleared >= created && cleared > 0,
    `${created} started, ${cleared} cleared -- an interval outliving the provider is a leak`);

window.cancelAnimationFrame = originalCancel;
window.clearInterval = originalClear;
window.setInterval = originalSet;

// ============================================================================
// THE SCHEDULED START, DRIVEN
// ============================================================================

console.log('\n== the scheduled start, driven ==');

// The checker is driven through `focus` rather than by waiting out its one-second
// interval. A `focus` event reaches the same handler a backgrounded tab uses, so the
// assertion covers the path that matters -- the tab that was not in front of you --
// and costs no wall-clock time.
const poke = () => act(() => { window.dispatchEvent(new window.Event('focus')); });

store.clear();
const scheduled = await mountEngine();

const shortSession = {
    ...DEFAULT_INTERVAL, workSec: 60, restSec: 60, longRestSec: 60,
    totalRounds: 0, roundsBeforeLong: 0,
};

/**
 * Arms a schedule for the minute the frozen clock is *currently* in.
 *
 * By construction that minute is just past, so its next occurrence is the same
 * minute tomorrow -- which is what makes `advance` able to reach it without the
 * test sleeping. Read at arm time rather than once at the top: several advances
 * happen in between, and a minute-of-day captured before them describes a minute
 * that may still be two days away.
 */
const armNow = target => {
    const at = new Date(shiftedNow());
    const minuteOfDay = at.getHours() * 60 + at.getMinutes();
    act(() => { target.api().setIntervalConfig({ ...shortSession, startAt: minuteOfDay }); });
    return minuteOfDay;
};

/**
 * A day and a minute later.
 *
 * Exactly a day, because that lands on the same minute of day with the seconds
 * still past it -- the armed minute has just gone by, and `nextStartAt` is
 * strictly-after so this is the one instant where it reports it as due. An extra
 * minute makes that independent of where in the minute the test happened to start,
 * which is the difference between a reliable assertion and one that fails on
 * 1-in-60 runs.
 */
const comeRound = () => advance(24 * 60 * 60 * 1000 + 60_000);

act(() => { scheduled.api().setMode('interval'); });
const armedMinute = armNow(scheduled);
check('a schedule can be armed', scheduled.api().intervalConfig.startAt === armedMinute,
    String(scheduled.api().intervalConfig.startAt));

poke();
check('and it does not fire early, however many times it is asked',
    scheduled.api().running === false, String(scheduled.api().running));

// Busy: a run already going means the schedule waits rather than stacking a second
// run on top of it, and rather than being consumed and lost while it waits.
//
// The run is started *after* the clock is moved rather than before. A minute-long
// session is long enough to still be running when the check happens but not long
// enough to survive a day, and advancing first is what makes "still running" a fact
// the engine can agree with -- otherwise the run has ended by the time the check
// runs and this asserts nothing at all.
comeRound();
act(() => { scheduled.api().start(); });
poke();
check('a run already going is left alone', scheduled.api().running === true
    && scheduled.api().intervalConfig.startAt === armedMinute,
    `running=${scheduled.api().running} startAt=${scheduled.api().intervalConfig.startAt}`);

act(() => { scheduled.api().pause(); });
poke();
check('it fires at the first idle moment after the minute comes round',
    scheduled.api().running === true && scheduled.api().intervalConfig.startAt === null,
    `running=${scheduled.api().running} startAt=${scheduled.api().intervalConfig.startAt}`);
check('in work, not in a rest phase', scheduled.api().phase?.kind === 'work',
    String(scheduled.api().phase?.kind));

// The alerts recorded so far are from earlier assertions, so the bar is whatever was
// played before this run rather than zero. Silent: a session beginning is not
// something to wake anyone for -- they set it precisely so they would not have to be
// there -- and the ring starting to move is the feedback.
store.clear();
const silent = await mountEngine();
act(() => { silent.api().setMode('interval'); });
armNow(silent);
const playsBefore = played.length;
comeRound();
poke();
check('an idle timer starts itself when the minute comes round',
    silent.api().running === true, String(silent.api().running));
check('silently -- nobody is woken by a session beginning',
    played.length === playsBefore, `${played.length - playsBefore} alerts raised`);

// A second check after the run is already going must not stack another run on top of
// it, which is what the busy case above asserts from the other direction.
poke();
advance(60 * 1000);
poke();
check('and being asked again does not start a second session',
    silent.api().intervalConfig.startAt === null && silent.api().running === true,
    `startAt=${silent.api().intervalConfig.startAt} running=${silent.api().running}`);
act(() => { silent.root.unmount(); });

// Re-arming, which is the case a latched flag would break: the feature has to work
// more than once in the life of a page, not only for the first schedule.
act(() => { scheduled.api().reset(); });
const rearmed = armNow(scheduled);
check('a new schedule can be armed after one has fired',
    scheduled.api().intervalConfig.startAt === rearmed, String(scheduled.api().intervalConfig.startAt));
comeRound();
poke();
check('and it fires in turn', scheduled.api().running === true
    && scheduled.api().intervalConfig.startAt === null);

// Not in interval mode. The field is on the interval card and starts an interval
// session; it must not start a countdown.
store.clear();
const wrongMode = await mountEngine();
act(() => { wrongMode.api().setDuration(30_000); });
armNow(wrongMode);
comeRound();
poke();
check('a countdown is not started by the interval schedule',
    wrongMode.api().running === false, String(wrongMode.api().running));
check('and the countdown it had armed is left exactly as it was',
    wrongMode.api().totalMs === 30_000, String(wrongMode.api().totalMs));
act(() => { wrongMode.root.unmount(); });
act(() => { scheduled.root.unmount(); });

// The provider is what makes `useTimer` usable at all outside it, and the failure
// mode has to be loud.
check('useTimer throws outside the provider', (() => {
    let threw = false;
    const container = window.document.createElement('div');
    window.document.body.appendChild(container);
    const root = createRoot(container);
    const Bare = () => { useTimer(); return null; };
    try {
        act(() => { root.render(React.createElement(Bare)); });
    } catch (error) {
        threw = /TimerEngineProvider/.test(String(error?.message ?? error));
    }
    try { act(() => { root.unmount(); }); } catch { /* already failed */ }
    return threw;
})());

// ============================================================================
// THE COMPONENTS, RENDERED
// ============================================================================

console.log('\n== the components, rendered ==');

// The engine is arithmetic; these are the parts where a wrong prop type or a
// missing DOM API turns into a blank page rather than a wrong number, and a blank
// page is the failure a test is least likely to catch by reading the code.

const mountComponent = async (modulePath, element) => {
    const mod = await loadComponent(modulePath);
    const container = window.document.createElement('div');
    window.document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(element); });
    return { mod, container, root, html: () => container.innerHTML };
};

const h = React.createElement;

// The ring, in each state the page puts it in. A countdown has an arc; a stopwatch
// does not, because it has no end to measure against.
const countdown = await mountComponent('src/Components/Timer/TimerDisplay.tsx', h(
    (await loadComponent('src/Components/Timer/TimerDisplay.tsx')).default,
    { text: '24:59', fraction: 0.5, running: true, dimmed: false, done: false, phase: 'Counting down' },
));
check('the display renders the digits', countdown.html().includes('24:59'), countdown.html().slice(0, 120));
// A real length the browser interpolates, rather than a conic-gradient -- which is
// why the arc moves smoothly instead of stepping once per render.
check('the countdown ring drives the arc with a dash offset',
    /stroke-dashoffset/.test(countdown.html()) && /stroke-dasharray/.test(countdown.html()));
check('and is a live region, polite', /aria-live="polite"/.test(countdown.html()));
check('the phase label renders', countdown.html().includes('Counting down'));
// An assertive live region updating five times a second would talk over everything
// else on the page, so this is worth pinning.
check('and it is polite, not assertive', !/aria-live="assertive"/.test(countdown.html()));

const stopwatch = await mountComponent('src/Components/Timer/TimerDisplay.tsx', h(
    (await loadComponent('src/Components/Timer/TimerDisplay.tsx')).default,
    { text: '00:42', fraction: null, running: true, dimmed: false, done: false, phase: 'Stopwatch' },
));
// A full ring on a stopwatch reads as "finished", so the arc is withheld entirely
// and the sweep takes its place.
/**
 * The rendered circle elements, as plain attribute records.
 *
 * Parsed rather than pattern-matched, because the two things told apart here -- the
 * progress arc and the sweep -- are both dash-attributed circles, and a substring
 * test cannot separate them. What separates them is which element carries the
 * `rotate(-90)` transform, and only the arc does: the sweep is meant to spin about
 * its own centre.
 */
const circlesOf = html =>
    [...html.matchAll(/<circle\b([^>]*)>/g)].map(match => {
        const attributes = {};
        for (const [, name, value] of match[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
            attributes[name] = value;
        }
        return attributes;
    });

const countdownCircles = circlesOf(countdown.html());
const stopwatchCircles = circlesOf(stopwatch.html());
const arcOf = circles => circles.filter(circle => circle.transform?.includes('rotate(-90'));

check('the track is always drawn', countdownCircles.length >= 2 && stopwatchCircles.length >= 2,
    `${countdownCircles.length} / ${stopwatchCircles.length}`);
// `stroke-dashoffset`, dashed. React renders camelCase SVG props in kebab-case, and
// reading it back as `strokeDashoffset` would silently be `undefined` -- which is
// exactly the kind of check that passes for the wrong reason if the `&&` short
// circuits on the length first.
const countdownArc = arcOf(countdownCircles)[0] ?? {};
check('the countdown draws one arc, starting at twelve o clock',
    arcOf(countdownCircles).length === 1
    && countdownArc['stroke-dashoffset'] !== undefined
    && countdownArc['stroke-dasharray'] !== undefined,
    JSON.stringify(countdownArc));
check('a stopwatch draws no arc at all, because it has no end to measure against',
    arcOf(stopwatchCircles).length === 0,
    JSON.stringify(stopwatchCircles.map(c => c.transform ?? '(no transform)')));
check('and gets the sweep instead', /timer-sweep/.test(stopwatch.html()));

const done = await mountComponent('src/Components/Timer/TimerDisplay.tsx', h(
    (await loadComponent('src/Components/Timer/TimerDisplay.tsx')).default,
    { text: '00:00', fraction: 1, running: false, dimmed: false, done: true, phase: 'Counting down' },
));
check('an expired display is marked done', /timer-digits--done/.test(done.html()));

// The pad, which is the one component with real input handling.
const pad = await mountComponent('src/Components/Timer/DurationPad.tsx', h(
    (await loadComponent('src/Components/Timer/DurationPad.tsx')).default,
    { value: 25 * 60 * 1000, onChange: () => {}, disabled: false },
));
check('the pad renders three fields', (pad.html().match(/timer-pad__input/g) || []).length === 3,
    String((pad.html().match(/timer-pad__input/g) || []).length));
check('each field has an accessible name', /aria-label="hr"/.test(pad.html())
    && /aria-label="min"/.test(pad.html()) && /aria-label="sec"/.test(pad.html()));
// The scroll-wheel spinner is the reason this is `type="text"`: a number input
// changes a duration when the page scrolls over it.
check('the fields are text inputs, not number inputs', !/type="number"/.test(pad.html()));
check('they ask for a numeric keypad', (pad.html().match(/inputmode="numeric"/g) || []).length === 3);

// Typing commits upward on every keystroke, so the display above stays live.
const typed = [];
const padLive = await mountComponent('src/Components/Timer/DurationPad.tsx', h(
    (await loadComponent('src/Components/Timer/DurationPad.tsx')).default,
    { value: 0, onChange: ms => typed.push(ms), disabled: false },
));
const minutesField = padLive.container.querySelector('#timer-minutes');
await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(minutesField, '25');
    minutesField.dispatchEvent(new window.Event('input', { bubbles: true }));
});
check('typing in a field commits a duration', typed.length > 0 && typed[typed.length - 1] === 25 * 60 * 1000,
    JSON.stringify(typed));

// The overlay, which is the one thing that must not be dismissible by accident.
const overlay = await mountComponent('src/Components/Timer/TimeUpOverlay.tsx', h(
    (await loadComponent('src/Components/Timer/TimeUpOverlay.tsx')).default,
    {
        alert: { kind: 'timeup' },
        onDismiss: () => {},
        onRestart: () => {},
        onAddMinutes: () => {},
    },
));
check('the overlay renders when there is an alert', /timer-up-overlay/.test(overlay.html()));
check('it is an alert dialog, modal', /role="alertdialog"/.test(overlay.html())
    && /aria-modal="true"/.test(overlay.html()));
// A toast fades on a timer. This is the one moment in the app where being missed is
// the actual failure, so it has to survive until it is acknowledged.
check('it offers the three useful next steps',
    /5 more minutes/.test(overlay.html()) && /Restart/.test(overlay.html())
    && /Dismiss/.test(overlay.html()));
check('focus moves into it, so a keyboard user is not stranded',
    overlay.container.querySelector('.btn-form-submit') === window.document.activeElement
    || window.document.activeElement?.classList?.contains('btn-form-submit'),
    String(window.document.activeElement?.className));

const noOverlay = await mountComponent('src/Components/Timer/TimeUpOverlay.tsx', h(
    (await loadComponent('src/Components/Timer/TimeUpOverlay.tsx')).default,
    { alert: null, onDismiss: () => {}, onRestart: () => {}, onAddMinutes: () => {} },
));
check('and renders nothing at all when there is no alert',
    !/timer-up-overlay/.test(noOverlay.html()), noOverlay.html().slice(0, 80));

// An alarm gets no "+5 minutes", because a bed time that quietly became six
// minutes later would be worse than useless.
const alarmOverlay = await mountComponent('src/Components/Timer/TimeUpOverlay.tsx', h(
    (await loadComponent('src/Components/Timer/TimeUpOverlay.tsx')).default,
    {
        alert: { kind: 'alarm', alarmLabel: 'Wake up' },
        onDismiss: () => {}, onRestart: () => {}, onAddMinutes: () => {},
    },
));
check('an alarm names itself', /Wake up/.test(alarmOverlay.html()));
check('and offers no way to extend it', !/5 more minutes/.test(alarmOverlay.html()));

// The settings panel is gone, and this file no longer mounts it.
//
// It held a slider and four switches for one sound and three behaviours, and every
// one of those was a way for a finished timer to end in silence -- the failure this
// page exists to prevent, offered as four checkboxes. The level is a constant and
// the rest is unconditional, so there is nothing left to render or assert switch
// counts on. What replaced it is asserted above, against the constant and against
// the engine.
//
// The file itself is deleted rather than left unreferenced: an orphaned panel with
// a working volume slider in it is a control somebody would eventually wire back
// in, on the assumption that it still did something.
check('the settings panel is deleted, not merely unused',
    !existsSync(join(root, 'src/Components/Timer/SettingsPanel.tsx')),
    'left in place it is a control that looks live and is not');
check('and nothing imports it',
    !/SettingsPanel/.test(readFileSync(join(root, 'src/Pages/TimerPage.tsx'), 'utf8')),
    'a dead import is still a dead import');

// ============================================================================

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);

// jsdom's window is torn down before exiting.
//
// The script passes its checks, prints ALL PASS, and then aborts with
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` -- a libuv assertion
// from exiting while jsdom's window still holds open handles. It only shows up in
// the full `npm run verify` chain, where it fails the whole suite on a script that
// reported success, which is the most confusing possible failure. Closing the
// window first is the fix; `process.exit` after it has nothing left to race.
window.close();

process.exit(fail === 0 ? 0 : 1);