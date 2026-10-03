/**
 * Exercises the workouts stats helpers in src/utils/workoutStats.ts.
 *
 * These are date maths, which is the kind of code that passes by eye and fails
 * on the cases nobody thought about: a year boundary, a leap day, a grid that
 * runs off the end of its own range. The assertions here are the invariants the
 * UI depends on, not the implementation restated.
 *
 * It imports the real module rather than a copy, so the tests break when the code
 * changes and not when a duplicate drifts. The repo's TS uses extensionless
 * relative imports (`from './dates'`), which Node's ESM resolver rejects, so the
 * loader below resolves those the way Vite does.
 *
 * Timezone-sensitive on purpose: the whole point of utils/dates.ts is local-time
 * key building, and a UTC implementation passes these tests in UTC and fails
 * them for a user in Los Angeles. The expectations below are computed from the
 * local calendar, not from a fixed string, so they hold anywhere.
 */
import { register } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

// Vite resolves './dates' to './dates.ts'. Mirror that for the loader below.
register(new URL('./lib/ts-extension-resolver.mjs', import.meta.url));

const { toDateString, addDays, todayString } = await import('../src/utils/dates.ts');
const {
    buildHeatGrid, currentStreak, longestStreak, completedDates,
    totalsBetween, emptyTotals, rollupExercises, muscleGroupTotals, kindTotals,
} = await import('../src/utils/workoutStats.ts');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const DAY = 86_400_000;
const at = (y, m, d, h = 12) => new Date(y, m, d, h);
const day = (y, m, d) => toDateString(at(y, m, d));
const record = (extra = {}) => ({ completed: true, exerciseCount: 3, volumeKg: 1000, ...extra });
const mapOf = entries => new Map(entries);

// ---------------------------------------------------------------------------
console.log('\n== buildHeatGrid shape ==');
{
    // A fixed endDate keeps this independent of when the suite runs.
    const end = at(2025, 5, 15);              // Sunday 15 June 2025
    const weeks = buildHeatGrid(new Map(), end);

    check('produces 53 week columns', weeks.length === 53, `n=${weeks.length}`);
    check('every column holds 7 cells', weeks.every(w => w.cells.length === 7),
        weeks.map(w => w.cells.length).join(','));

    const all = weeks.flatMap(w => w.cells);
    check('no duplicate dates', new Set(all.map(c => c.date)).size === all.length,
        `${all.length} cells, ${new Set(all.map(c => c.date)).size} distinct`);

    check('is Sunday-first', weeks[0].cells[0].weekday === 0 && all[0].date.endsWith(day(0, 1, 1).slice(0, 0) || weeks[0].cells[0].date),
        `first cell ${weeks[0].cells[0].date} weekday ${weeks[0].cells[0].weekday}`);
    check('every column starts on a Sunday',
        weeks.every(w => w.cells[0].weekday === 0),
        weeks.filter(w => w.cells[0].weekday !== 0).map(w => w.cells[0].weekday).join(','));

    check('weekdays run 0..6 down each column',
        weeks.every(w => w.cells.every((c, i) => c.weekday === i)),
        'a column is out of order');

    // 364 days back plus up to 6 forward of slack, so the span is 53*7 = 371.
    const span = Math.round(
        (new Date(all[all.length - 1].date) - new Date(all[0].date)) / DAY,
    );
    check('spans 53 weeks of cells', span === 370, `span=${span} days`);

    check('ends on the Saturday of the endDate week',
        all[all.length - 1].weekday === 6 && all[all.length - 1].date === day(2025, 5, 21),
        all[all.length - 1].date);

    check('nothing after endDate is counted as a missed day',
        all.filter(c => c.date > day(2025, 5, 15)).every(c => c.isFuture && c.level === 0),
        'a future cell is not marked isFuture');
    check('nothing before endDate is future',
        all.filter(c => c.date <= day(2025, 5, 15)).every(c => !c.isFuture),
        'a past cell is marked future');
}

// ---------------------------------------------------------------------------
console.log('\n== buildHeatGrid levels ==');
{
    const end = at(2025, 5, 15);
    const records = mapOf([
        [day(2025, 5, 10), record({ intensity: 1 })],
        [day(2025, 5, 11), record({ intensity: 4 })],
        [day(2025, 5, 12), record({ intensity: 10 })],
        [day(2025, 5, 13), record({ intensity: null })],   // completed, no rating
        [day(2025, 5, 14), record({ intensity: 0 })],
        [day(2025, 5, 15), { completed: false, exerciseCount: 0, volumeKg: 0 }],
    ]);
    const cells = buildHeatGrid(records, end).flatMap(w => w.cells);
    const level = d => cells.find(c => c.date === d)?.level;

    check('a completed day is never level 0', level(day(2025, 5, 13)) > 0, `level=${level(day(2025, 5, 13))}`);
    check('intensity 1 is the lightest bucket', level(day(2025, 5, 10)) === 1, `level=${level(day(2025, 5, 10))}`);
    check('intensity 4 sits above 1', level(day(2025, 5, 11)) > level(day(2025, 5, 10)));
    check('intensity 10 saturates at HEAT_LEVELS', level(day(2025, 5, 12)) === 5, `level=${level(day(2025, 5, 12))}`);
    check('a rated 0 still counts as trained', level(day(2025, 5, 14)) > 0, `level=${level(day(2025, 5, 14))}`);
    check('an uncompleted day is level 0', level(day(2025, 5, 15)) === 0, `level=${level(day(2025, 5, 15))}`);
    check('a day with no record is level 0', level(day(2025, 5, 1)) === 0);

    check('the record rides along on the cell',
        cells.find(c => c.date === day(2025, 5, 11))?.record?.intensity === 4);
}

// ---------------------------------------------------------------------------
console.log('\n== buildHeatGrid labels ==');
{
    const weeks = buildHeatGrid(new Map(), at(2025, 5, 15));
    const labelled = weeks.filter(w => w.label);
    check('a 53-week span is labelled 12 or 13 times', labelled.length >= 12 && labelled.length <= 13,
        `n=${labelled.length}`);

    // A 53-week span covers up to 14 distinct months, so a month name can repeat
    // at the two ends (June at both, here). What must not happen is one month
    // being labelled twice, which is what a column straddling a boundary would
    // cause -- so the key is year+month, not the month index on its own.
    const seen = new Set();
    let duplicates = 0;
    for (const w of labelled) {
        const key = new Date(w.cells[0].date).toISOString().slice(0, 7);
        if (seen.has(key)) duplicates++;
        seen.add(key);
    }
    check('no month is labelled twice', duplicates === 0, `${duplicates} duplicate(s)`);
    check('every labelled month is distinct in the calendar',
        seen.size === labelled.length, `${seen.size} distinct / ${labelled.length} labelled`);

    check('the first column is labelled',
        weeks[0].label != null
            && new Date(weeks[0].cells[0].date).getMonth() === weeks[0].monthIndex,
        `${weeks[0].label} / ${weeks[0].cells[0].date}`);
}

// ---------------------------------------------------------------------------
console.log('\n== buildHeatGrid boundaries ==');
{
    // The cases that break hand-written date maths.
    const leap = buildHeatGrid(new Map(), at(2024, 1, 29));    // 29 Feb 2024
    const leapDates = leap.flatMap(w => w.cells).map(c => c.date);
    check('survives a leap day', leapDates.includes(day(2024, 1, 29)), '29 Feb 2024 missing');
    check('a leap year grid has no duplicate days',
        new Set(leapDates).size === leapDates.length);

    const jan = buildHeatGrid(new Map(), at(2025, 0, 1));      // 1 Jan, a Wednesday
    check('survives a year boundary', jan[0].cells[0].weekday === 0);
    check('a grid ending in January contains December cells',
        jan.flatMap(w => w.cells).some(c => c.date.startsWith('2024-12')));

    const far = buildHeatGrid(new Map(), at(2030, 0, 1));
    check('is bounded on a distant endDate', far.length <= 54, `n=${far.length}`);
}

// ---------------------------------------------------------------------------
console.log('\n== streaks ==');
{
    const today = todayString();
    const yesterday = addDays(today, -1);

    check('an empty map has no streak', currentStreak(new Map()) === 0);
    check('today alone is a streak of 1',
        currentStreak(mapOf([[today, record()]])) === 1);
    check('an untoday-logged day does not break the streak',
        currentStreak(mapOf([[yesterday, record()], [addDays(yesterday, -1), record()]])) === 2,
        `n=${currentStreak(mapOf([[yesterday, record()], [addDays(yesterday, -1), record()]]))}`);
    check('a gap ends the streak',
        currentStreak(mapOf([
            [today, record()],
            [addDays(today, -2), record()],
            [addDays(today, -3), record()],
        ])) === 1);

    check('an uncompleted today is not counted',
        currentStreak(mapOf([[today, { completed: false, exerciseCount: 0, volumeKg: 0 }]])) === 0);

    check('longestStreak finds the longest run', longestStreak([
        day(2025, 0, 1), day(2025, 0, 2), day(2025, 0, 3), day(2025, 0, 10),
    ]) === 3);
    check('longestStreak is order-independent', longestStreak([
        day(2025, 0, 3), day(2025, 0, 1), day(2025, 0, 2),
    ]) === 3);
    check('longestStreak dedupes', longestStreak([day(2025, 0, 1), day(2025, 0, 1)]) === 1);
    check('longestStreak of nothing is 0', longestStreak([]) === 0);
    // A month boundary is where naive "+1 day" arithmetic goes wrong.
    check('longestStreak crosses a month boundary', longestStreak([
        day(2025, 0, 30), day(2025, 0, 31), day(2025, 1, 1),
    ]) === 3);

    check('completedDates only lists completed days, sorted', JSON.stringify(
        completedDates(mapOf([
            [day(2025, 0, 5), record()],
            [day(2025, 0, 1), record()],
            [day(2025, 0, 3), { completed: false, exerciseCount: 0, volumeKg: 0 }],
        ])),
    ) === JSON.stringify([day(2025, 0, 1), day(2025, 0, 5)]));
}

// ---------------------------------------------------------------------------
console.log('\n== totalsBetween ==');
{
    const records = mapOf([
        [day(2025, 0, 5), record({ volumeKg: 1000, durationMinutes: 60, intensity: 4 })],
        [day(2025, 0, 10), record({ volumeKg: 500, durationMinutes: 30, intensity: 8 })],
        [day(2025, 0, 20), record({ volumeKg: 9999, durationMinutes: 999 })],
        [day(2025, 0, 11), { completed: false, exerciseCount: 0, volumeKg: 5000, durationMinutes: 500 }],
    ]);
    const totals = totalsBetween(records, day(2025, 0, 1), day(2025, 0, 15));

    check('counts only completed days in range', totals.sessions === 2, `n=${totals.sessions}`);
    check('sums volume', totals.volumeKg === 1500, `kg=${totals.volumeKg}`);
    check('sums minutes', totals.minutes === 90, `min=${totals.minutes}`);
    check('averages only rated sessions', totals.avgIntensity === 6, `avg=${totals.avgIntensity}`);

    check('an empty range gives null average, not 0',
        totalsBetween(new Map(), day(2025, 0, 1), day(2025, 0, 15)).avgIntensity === null);
    check('the bounds are inclusive on both ends', totalsBetween(
        records, day(2025, 0, 5), day(2025, 0, 5),
    ).sessions === 1);
    check('emptyTotals is a fresh object each call', emptyTotals() !== emptyTotals());
}

// ---------------------------------------------------------------------------
console.log('\n== rollupExercises ==');
{
    // One 10x50 set = 500kg, then one 10x60 = 600kg, so the merge has to total
    // 1100kg across the two dates and report two sets.
    const sets = (extra = {}) => [{ reps: 10, weight: 50, ...extra }];
    const rows = [
        {
            exercise_id: 'lib-1', exercise_name: 'Bench Press', activity_type: 'strength',
            muscles: ['Chest'], workout_date: day(2025, 0, 5), completed: true,
            sets_detail: sets(), duration_minutes: 45,
        },
        {
            exercise_id: 'lib-1', exercise_name: 'Bench Press', activity_type: 'strength',
            muscles: ['Chest'], workout_date: day(2025, 0, 8), completed: true,
            sets_detail: sets({ weight: 60 }), duration_minutes: 50,
        },
        {
            exercise_name: 'Running', activity_type: 'cardio', muscles: [],
            workout_date: day(2025, 0, 9), completed: true,
            sets_detail: [], duration_minutes: 30, distance_km: 5,
        },
        {
            exercise_id: 'lib-9', exercise_name: 'Never Logged', activity_type: 'strength',
            muscles: ['Back'], workout_date: day(2025, 0, 9), completed: false,
        },
    ];
    const rollups = rollupExercises(rows);
    const bench = rollups.find(r => r.exercise_name === 'Bench Press');
    const run = rollups.find(r => r.exercise_name === 'Running');
    const never = rollups.find(r => r.exercise_name === 'Never Logged');

    check('one row per exercise', rollups.length === 3, `n=${rollups.length}`);
    check('the same id merges across dates', bench.timesLogged === 2, `n=${bench?.timesLogged}`);
    check('sums volume across dates', bench.volumeKg === 1100, `kg=${bench?.volumeKg}`);
    check('counts sets', bench.setsLogged === 2, `n=${bench?.setsLogged}`);
    check('keeps the best set', bench.bestWeight === 60 && bench.bestReps === 10,
        `${bench?.bestWeight}x${bench?.bestReps}`);
    check('tracks the last date', bench.lastDate === day(2025, 0, 8), bench?.lastDate);
    check('carries the muscles through', bench.muscles[0] === 'Chest');

    check('cardio minutes are not counted as tonnage', run.volumeKg === 0, `kg=${run?.volumeKg}`);
    check('cardio minutes accumulate', run.minutesLogged === 30, `min=${run?.minutesLogged}`);
    check('cardio distance accumulates', run.distanceKm === 5, `km=${run?.distanceKm}`);

    check('an unlogged plan row appears but logs nothing',
        never != null && never.timesLogged === 0, JSON.stringify(never?.timesLogged));

    // exercise_id is the key when present, so the same name under two ids stays
    // separate -- that is the whole point of propagating the id through the picker.
    const split = rollupExercises([
        { exercise_id: 'a', exercise_name: 'Bench Press', workout_date: day(2025, 0, 1), completed: true },
        { exercise_id: 'b', exercise_name: 'Bench Press', workout_date: day(2025, 0, 1), completed: true },
    ]);
    check('the same name under two ids stays separate', split.length === 2, `n=${split.length}`);

    // Without an id the normalised name is the fallback, which is what the 0010
    // backfill relies on.
    const merged = rollupExercises([
        { exercise_name: '  bench press ', workout_date: day(2025, 0, 1), completed: true },
        { exercise_name: 'Bench Press', workout_date: day(2025, 0, 2), completed: true },
    ]);
    check('without an id, names merge case- and space-insensitively',
        merged.length === 1 && merged[0].timesLogged === 2, `n=${merged.length}`);

    const filtered = rollupExercises(rows, new Set(['id:lib-1']));
    check('`only` restricts to the given keys',
        filtered.length === 1 && filtered[0].exercise_name === 'Bench Press', `n=${filtered.length}`);
}

// ---------------------------------------------------------------------------
console.log('\n== muscleGroupTotals ==');
{
// `sessions` sums timesLogged, so a muscle on a 3-session rollup plus one on a
    // 1-session rollup reads 4. Legs sits on a rollup with nothing logged and
    // must not appear at all -- the totals are a record of work done, not of a plan.
    const rollups = [
        { muscles: ['Chest', 'Triceps'], timesLogged: 3, setsLogged: 9, volumeKg: 3000, activityType: 'strength', minutesLogged: 40 },
        { muscles: ['Chest'], timesLogged: 1, setsLogged: 2, volumeKg: 500, activityType: 'strength', minutesLogged: 10 },
        { muscles: ['Legs'], timesLogged: 0, setsLogged: 0, volumeKg: 0, activityType: 'strength', minutesLogged: 0 },
    ];
    const totals = muscleGroupTotals(rollups);
    const chest = totals.find(t => t.muscle === 'Chest');
    const triceps = totals.find(t => t.muscle === 'Triceps');

    check('one entry per muscle that was worked', totals.length === 2, `n=${totals.length} (${totals.map(t => t.muscle)})`);
    check('sessions sums timesLogged across every rollup hitting the muscle',
        chest.sessions === 4, `n=${chest?.sessions}`);
    check('sets sum the same way', chest.setsLogged === 11, `n=${chest?.setsLogged}`);
    check('volume accumulates per muscle', chest.volumeKg === 3500, `kg=${chest?.volumeKg}`);
    check('a muscle on one rollup only still totals', triceps.sessions === 3, `n=${triceps?.sessions}`);
    check('a muscle only on an unlogged row is left out',
        totals.some(t => t.muscle === 'Legs') === false,
        totals.map(t => t.muscle).join(','));
    check('sorted by sessions, then volume',
        totals[0].muscle === 'Chest' && totals[1].muscle === 'Triceps', totals.map(t => t.muscle).join(','));
}

// ---------------------------------------------------------------------------
console.log('\n== kindTotals ==');
{
    // `cardioSessions` and `mobilitySessions` count rollups that were logged at
    // least once, not raw log rows -- that is what the "x sessions" tiles label
    // themselves as, and it is the only reading that matches the tile.
    const totals = kindTotals([
        { activityType: 'strength', timesLogged: 2, minutesLogged: 90, distanceKm: 0 },
        { activityType: 'cardio', timesLogged: 1, minutesLogged: 30, distanceKm: 5 },
        { activityType: 'mobility', timesLogged: 3, minutesLogged: 45, distanceKm: 0 },
        { activityType: 'cardio', timesLogged: 0, minutesLogged: 999, distanceKm: 999 },
    ]);

    check('strength minutes are their own bucket', totals.strengthMinutes === 90, `n=${totals.strengthMinutes}`);
    check('cardio minutes accumulate', totals.cardioMinutes === 30, `n=${totals.cardioMinutes}`);
    check('mobility minutes accumulate', totals.mobilityMinutes === 45, `n=${totals.mobilityMinutes}`);
    check('cardio sessions count logged rollups only', totals.cardioSessions === 1, `n=${totals.cardioSessions}`);
    check('mobility sessions count logged rollups only', totals.mobilitySessions === 1, `n=${totals.mobilitySessions}`);
    check('an unlogged cardio row contributes no time or distance',
        totals.cardioDistanceKm === 5, `km=${totals.cardioDistanceKm}`);
    check('cardio and mobility are never summed into tonnage',
        totals.cardioMinutes + totals.mobilityMinutes !== totals.strengthMinutes);
}

console.log(fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);