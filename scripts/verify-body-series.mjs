/**
 * Checks the weight and body-fat series behind the two dashboard charts.
 *
 * Migration 0013 collapsed this from two sources onto one. These are the rules
 * that collapse leaves behind, each of which was a bug before it:
 *
 *  - The series is `body_measurements` only. It used to read `daily_logs`, so
 *    the weight line was empty for anyone who records their weight on the
 *    Measurements page, which is where it belongs.
 *
 *  - There is no averaging, because there is no second source to disagree with
 *    it. `body_measurements` is unique per user per date.
 *
 *  - Body fat is a stored column rather than something recovered. It used to be
 *    divided back out of `fat_mass`, which meant a Navy circumference estimate
 *    was indistinguishable from a reading off a scale.
 *
 *  - There is no starting-value point. `user_settings.starting_weight` has no
 *    date, so the series cannot carry it without inventing one; the chart
 *    attaches it as its opening point and draws it, and the target, as
 *    reference lines. What must not happen is a dated baseline creeping into
 *    this series and going invisible in short windows.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) {
        pass++;
        console.log(`  ok   ${name}`);
    } else {
        fail++;
        console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
    }
};

// Compiled rather than regexed, the same way verify-notes-tree does it, so a
// formatting change cannot fail a behaviour check. No runtime imports to shim:
// everything the module needs is either a type or its own.
const compiled = ts.transpileModule(
    readFileSync(new URL('../src/utils/bodySeries.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;

let buildBodySeries;
let buildCompositionPayload;
try {
    buildBodySeries = (
        await import(
            `data:text/javascript;base64,${Buffer.from(
                `${compiled.replace(/^export /gm, '')}\nexport { buildBodySeries };\n`,
            ).toString('base64')}`
        )
    ).buildBodySeries;
    // The write side of the same collapse, kept apart from the supabase call so
    // the absent-versus-null rule can be checked without a database.
    const payloadSource = ts.transpileModule(
        readFileSync(new URL('../src/utils/compositionPayload.ts', import.meta.url), 'utf8'),
        { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    buildCompositionPayload = (
        await import(
            `data:text/javascript;base64,${Buffer.from(
                `${payloadSource.replace(/^export /gm, '')}\nexport { buildCompositionPayload };\n`,
            ).toString('base64')}`
        )
    ).buildCompositionPayload;
} catch (error) {
    console.log(` FAIL  bodySeries could not be loaded: ${error.message}`);
    process.exit(1);
}

// Mirrors MetricsCharts' inRange, which is what the series is filtered by.
const inRange = (date, days) => {
    if (days === null) return true;
    const diff = Math.floor((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000);
    return diff >= 0 && diff < days;
};

const TODAY = new Date();
const daysAgo = n => {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

const measurement = (measure_date, over = {}) => ({
    measure_date, weight: null, body_fat: null, body_fat_method: null, ...over,
});

const build = (over = {}) =>
    buildBodySeries({ measurements: null, days: null, inRange, ...over });

const weightOn = (rows, date) => rows.find(r => r.date === date)?.weight ?? null;
const fatOn = (rows, date) => rows.find(r => r.date === date)?.bodyFat ?? null;
const dates = rows => rows.map(r => r.date).join(',');

console.log('\n== one row per measurement ==');
{
    const rows = build({ measurements: [measurement(daysAgo(10), { weight: 81.5 })] });
    check('a weight is read', weightOn(rows, daysAgo(10)) === 81.5);
    check('and produces one row', rows.length === 1, dates(rows));

    check('no measurements is an empty series', build().length === 0);
    check('a null list is an empty series, not a crash', build({ measurements: null }).length === 0);
}

console.log('\n== body fat is a stored column ==');
{
    const rows = build({ measurements: [measurement(daysAgo(5), { weight: 80, body_fat: 20, body_fat_method: 'scale' })] });
    check('body fat is read straight off the column', fatOn(rows, daysAgo(5)) === 20);
    check('its method comes with it', rows[0].bodyFatMethod === 'scale');

    // The old shape: fat_mass present, no body_fat column value. Before 0013 this
    // was the only way a measurement carried body fat at all.
    check('fat_mass alone no longer yields a body fat percentage',
        fatOn(build({ measurements: [measurement(daysAgo(5), { weight: 80, fat_mass: 16 })] }), daysAgo(5)) === null);

    check('an unknown method is reported as unknown rather than guessed',
        build({ measurements: [measurement(daysAgo(5), { body_fat: 18 })] })[0].bodyFatMethod === null);
}

console.log('\n== partial rows ==');
{
    const rows = build({ measurements: [measurement(daysAgo(5), { body_fat: 18, body_fat_method: 'calipers' })] });
    check('body fat with no weight is still a row', rows.length === 1);
    check('and its weight is null rather than zero', weightOn(rows, daysAgo(5)) === null);
    check('body fat survives it', fatOn(rows, daysAgo(5)) === 18);

    const weightOnly = build({ measurements: [measurement(daysAgo(5), { weight: 0 })] });
    check('a zero weight is a real reading, kept as zero',
        weightOn(weightOnly, daysAgo(5)) === 0, String(weightOn(weightOnly, daysAgo(5))));
    check('and body fat stays absent', fatOn(weightOnly, daysAgo(5)) === null);
}

console.log('\n== ordering ==');
{
    const rows = build({
        measurements: [
            measurement(daysAgo(1), { weight: 80 }),
            measurement(daysAgo(5), { weight: 82 }),
            measurement(daysAgo(3), { weight: 81 }),
        ],
    });
    check('dates come out in order regardless of input order',
        dates(rows) === `${daysAgo(5)},${daysAgo(3)},${daysAgo(1)}`, dates(rows));
    check('in the right order', rows.map(r => r.weight).join(',') === '82,81,80');
}

console.log('\n== the window ==');
{
    const rows = build({
        measurements: [
            measurement(daysAgo(3), { weight: 80 }),
            measurement(daysAgo(90), { weight: 70 }),
        ],
        days: 7,
    });
    check('readings outside the window are dropped', dates(rows) === daysAgo(3), dates(rows));

    const all = build({
        measurements: [measurement(daysAgo(3), { weight: 80 }), measurement(daysAgo(90), { weight: 70 })],
        days: null,
    });
    check('all time keeps both', all.length === 2, dates(all));

    const future = build({ measurements: [measurement(daysAgo(-3), { weight: 80 })], days: 7 });
    check('a future-dated reading is dropped from a bounded window',
        future.length === 0, dates(future));
}

console.log('\n== no starting-value point ==');
{
    // The profile is no longer an input at all. This asserts the shape rather than
    // the behaviour: passing one is ignored, which is what keeps a dated baseline
    // from creeping back into the series and going invisible in short windows.
    const rows = build({
        measurements: [measurement(daysAgo(10), { weight: 86 })],
        settings: { starting_weight: 95, starting_bodyfat: 30 },
    });
    check('a starting weight does not become a point', rows.length === 1, dates(rows));
    check('the first point is the earliest real measurement', rows[0].weight === 86);
    check('there is no row carrying the profile values',
        rows.every(r => r.weight !== 95 && r.bodyFat !== 30));
}

console.log('== the write side ==');
{
    // Two writers share the row, so the payload has to say which columns it means.
    // `absent` is not mentioned and must survive; `null` was emptied and must go.
    const payload = fields => buildCompositionPayload('u1', '2026-03-01', fields);
    const has = (p, key) => Object.prototype.hasOwnProperty.call(p, key);

    const weightOnly = payload({ weight: 82 });
    check('a weight write carries the weight', weightOnly.weight === 82);
    check('a weight write leaves body fat alone', !has(weightOnly, 'body_fat'),
        JSON.stringify(weightOnly));
    check('a weight write leaves the method alone', !has(weightOnly, 'body_fat_method'));
    check('a weight write leaves fat mass alone', !has(weightOnly, 'fat_mass'),
        'derived from both, and only one was given');

    const fatOnly = payload({ body_fat: 18, body_fat_method: 'manual' });
    check('a body fat write carries the body fat', fatOnly.body_fat === 18);
    check('a body fat write carries its method', fatOnly.body_fat_method === 'manual');
    check('a body fat write leaves the weight alone', !has(fatOnly, 'weight'));
    check('a body fat write leaves fat mass alone when the weight is unknown',
        !has(fatOnly, 'fat_mass'));

    check('both readings settle fat mass', payload({ weight: 80, body_fat: 20 }).fat_mass === 16);
    check('fat mass is derived from both, not carried in', payload({ weight: 80, body_fat: 20 }).body_fat === 20);

    // The case that started this: a weight typed by mistake has to be removable.
    const clearedWeight = payload({ weight: null });
    check('a null weight is written, not dropped', has(clearedWeight, 'weight') && clearedWeight.weight === null,
        'dropping it would leave the mistyped number wedged in forever');
    check('clearing the weight leaves body fat alone', !has(clearedWeight, 'body_fat'));
    check('clearing the weight retires fat mass', clearedWeight.fat_mass === null);

    const clearedFat = payload({ body_fat: null });
    check('a null body fat is written, not dropped', has(clearedFat, 'body_fat') && clearedFat.body_fat === null);
    check('clearing body fat clears the method with it', clearedFat.body_fat_method === null,
        'a removed reading must not go on claiming it came off a scale');
    check('clearing body fat retires fat mass', clearedFat.fat_mass === null);
    check('clearing body fat leaves the weight alone', !has(clearedFat, 'weight'));

    check('an empty write touches nothing but the row keys',
        JSON.stringify(payload({})) === JSON.stringify({ user_id: 'u1', measure_date: '2026-03-01' }),
        JSON.stringify(payload({})));

    // The Daily Log's boxes, one at a time. Circumferences live in the same row and
    // are absent from both payloads, which is the whole reason this is partial.
    check('a Daily Log weight write spares the tape fields',
        !has(payload({ weight: 82 }), 'chest') && !has(payload({ weight: 82 }), 'waist'));
}

console.log(
    fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`,
);
process.exit(fail === 0 ? 0 : 1);
