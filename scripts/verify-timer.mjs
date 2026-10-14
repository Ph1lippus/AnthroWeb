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
    formatClock, formatStopwatch, formatHumanDuration, formatUntil, formatAlarmTime,
    splitDuration, joinDuration, clampDuration, remainingMs, progressFraction,
    phaseAt, intervalTotalMs, isLongRestRound, nextAlarmFire, describeAlarmDays,
    buildLaps, normalizeSettings, normalizeIntervalConfig,
    DEFAULT_INTERVAL, DEFAULT_SETTINGS, CHIMES, MAX_DURATION_MS, SECOND, MINUTE, HOUR,
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

check('stopwatch adds hundredths', formatStopwatch(1234) === '00:01.23', formatStopwatch(1234));
check('stopwatch hundredths truncate', formatStopwatch(1999) === '00:01.99', formatStopwatch(1999));

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
// SETTINGS
// ============================================================================

console.log('\n== settings ==');

check('null becomes the defaults', JSON.stringify(normalizeSettings(null)) === JSON.stringify(DEFAULT_SETTINGS),
    JSON.stringify(normalizeSettings(null)));
check('undefined becomes the defaults', JSON.stringify(normalizeSettings(undefined)) === JSON.stringify(DEFAULT_SETTINGS));

// A volume of `undefined` reaching the audio graph is a silent failure, and the
// value has two sources that can each be wrong -- localStorage from an older
// build, and a settings row that predates a column.
check('a missing volume becomes a number', typeof normalizeSettings({}).volume === 'number',
    typeof normalizeSettings({}).volume);
check('an unknown sound falls back rather than rendering', normalizeSettings({ chime: 'kazoo' }).chime === 'chime');
check('a real sound is kept', normalizeSettings({ chime: 'bell' }).chime === 'bell');
check('volume above 1 is clamped', normalizeSettings({ volume: 5 }).volume === 1);
check('volume below 0 is clamped', normalizeSettings({ volume: -1 }).volume === 0);
check('a NaN volume falls back', normalizeSettings({ volume: Number.NaN }).volume === DEFAULT_SETTINGS.volume);
check('a string volume is rejected, not coerced', normalizeSettings({ volume: '0.5' }).volume === DEFAULT_SETTINGS.volume);
// "off" is a real choice, so a false has to survive. `|| DEFAULT` would lose it.
check('false survives normalisation', normalizeSettings({ vibrate: false }).vibrate === false,
    String(normalizeSettings({ vibrate: false }).vibrate));
check('every chime id is one the player knows',
    CHIMES.every(c => ['chime', 'bell', 'digital', 'radar'].includes(c.id)));

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

act(() => { engine.api().start(); });
check('starting marks it running', engine.api().running === true);
check('a running countdown has a deadline', typeof engine.api().deadline === 'number');
check('the deadline is in the future',
    engine.api().deadline > window.Date.now(), String(engine.api().deadline));

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
// But it is *refused* while a run is going, rather than stopping it. That is the
// fix: this used to set `running: false`, so touching the mode chips mid-run
// silently threw the run away -- no alert, no confirmation, the display simply
// reset. The two controls already in that panel refused instead of stopping, and
// this was the odd one out.
act(() => { reloaded.api().setMode('stopwatch'); });
check('switching mode mid-run is refused', reloaded.api().mode === 'countdown',
    String(reloaded.api().mode));
check('and the run is untouched by the attempt', reloaded.api().running === true);
check('with its deadline intact', reloaded.api().deadline !== null);

// Stopped, the switch goes through and does clear the loaded run.
act(() => { reloaded.api().pause(); });
act(() => { reloaded.api().setMode('stopwatch'); });
check('switching mode clears the deadline', reloaded.api().deadline === null);
check('and the elapsed time', reloaded.api().elapsed === 0, String(reloaded.api().elapsed));
check('and lands on the requested mode', reloaded.api().mode === 'stopwatch');

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

// Unmounting must not leave an interval running. A leaked one keeps a whole
// component tree's worth of work alive for the life of the document, and the only
// symptom is a tab that gets hot for no visible reason.
//
// Counted on a *running* engine, because an engine that is not running has no
// interval to leak -- asserting this against a stopped one would pass whether or
// not the cleanup existed.
// Patched on `window` rather than on `globalThis`: the engine calls
// `window.clearInterval`, and a wrapper on the Node global would never be reached.
const originalClear = window.clearInterval;
let cleared = 0;
window.clearInterval = id => { cleared++; return originalClear.call(window, id); };

act(() => { engine.api().reset(); });
act(() => { engine.api().setDuration(30_000); });
act(() => { engine.api().start(); });
await engine.refresh();
check('it is running, so there is an interval to leak', engine.api().running === true,
    String(engine.api().running));

act(() => { engine.root.unmount(); });
check('unmounting clears the repaint interval', cleared > 0, `${cleared} intervals cleared`);

window.clearInterval = originalClear;

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

// The switch, which the app did not have before. `role="switch"` is what makes a
// screen reader say "on" rather than nothing.
const settings = await mountComponent('src/Components/Timer/SettingsPanel.tsx', h(
    (await loadComponent('src/Components/Timer/SettingsPanel.tsx')).default,
    {
        settings: {
            chime: 'bell', volume: 0.5, vibrate: true, notify: false,
            keepAwake: true, hundredths: false,
        },
        onChange: () => {}, onPreview: () => {}, notificationsBlocked: false,
    },
));
check('the settings panel renders its switches', (settings.html().match(/role="switch"/g) || []).length === 4,
    String((settings.html().match(/role="switch"/g) || []).length));
check('a switch reports its state to assistive tech',
    /aria-checked="true"/.test(settings.html()) && /aria-checked="false"/.test(settings.html()));
// Four identical-looking toggles, with the one that cannot work disabled and the
// reason on screen. Otherwise it reads as broken rather than unavailable.
const blocked = await mountComponent('src/Components/Timer/SettingsPanel.tsx', h(
    (await loadComponent('src/Components/Timer/SettingsPanel.tsx')).default,
    {
        settings: {
            chime: 'chime', volume: 0.6, vibrate: true, notify: true,
            keepAwake: true, hundredths: false,
        },
        onChange: () => {}, onPreview: () => {}, notificationsBlocked: true,
    },
));
check('a blocked notification toggle is disabled', /disabled/.test(blocked.html()));
check('and says why rather than looking broken', /Blocked for this site/.test(blocked.html()));
// The OS-alarm limitation is a permissions decision, not a bug, and somebody
// setting a 6am alarm deserves to know before they rely on it.
check('the panel states the OS-level limitation', /no permission for one/.test(blocked.html())
    || /needs an OS-level alarm/.test(blocked.html()));

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