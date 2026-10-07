// Behavioural checks for the mood helpers in src/utils/moodSeries.ts.
//
// This script strips the TypeScript rather than importing it, so it runs in plain
// Node with no build step and no ts-node. The transform is a type-annotation
// strip only -- no logic is rewritten -- so what runs here is the code that ships.
//
// What is being checked is not that the functions return numbers but that they
// answer the questions the app actually asks them, several of which are about
// what they must *not* do: a day with no rating must not read as a bad one, and a
// day rated once must not carry half the weight of a day rated twice.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`); }
};

/**
 * Transpiled with the project's own TypeScript rather than by stripping types with
 * a regex.
 *
 * A regex was the first attempt and it is the wrong tool: `? log?.a : log?.b` is
 * a ternary whose `:` is indistinguishable from an annotation's, so the stripper
 * ate the second branch and produced a syntax error. TypeScript's own transpiler
 * understands the grammar, emits the real JavaScript, and is already a dependency
 * -- so this is both correct and one line shorter than the thing it replaced.
 */
const ts = (await import('typescript')).default;
const transpiled = ts.transpileModule(readFileSync('src/utils/moodSeries.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const NAMES = ['moodFor', 'moodPair', 'meanMood', 'dayDelta', 'moodTone', 'moodColor', 'meanMoodAcross', 'moodDistribution', 'moodLabel'];

// The transpiled module is CommonJS and requires its one dependency, so it is
// evaluated with a stub in scope. The stub returns the *real* moodSeries -- the
// module under test -- so nothing here can pass by agreeing with a copy of it.
const mod = { exports: {} };
const stub = { exports: mod.exports };
new Function('module', 'exports', 'require', transpiled)(mod, mod.exports, () => stub.exports);
const m = mod.exports;

for (const name of NAMES) {
    if (typeof m[name] !== 'function') {
        console.log(`  FAIL could not load ${name} from the transpiled module`);
        process.exit(1);
    }
}

console.log('== a day rated only in the evening ==');
check('meanMood averages what exists rather than half', m.meanMood({ evening_mood: 8 }) === 8, `got ${m.meanMood({ evening_mood: 8 })}`);
check('dayDelta is null without two ends to compare', m.dayDelta({ evening_mood: 8 }) === null);

console.log('\n== a day rated both ways ==');
check('meanMood is the middle of the pair', m.meanMood({ morning_mood: 9, evening_mood: 3 }) === 6);
check('dayDelta is evening minus morning', m.dayDelta({ morning_mood: 9, evening_mood: 3 }) === -6);
check('moodPair returns both readings', (() => {
    const p = m.moodPair({ morning_mood: 9, evening_mood: 3 });
    return p.morning === 9 && p.evening === 3;
})());

console.log('\n== an unrated day is not a bad day ==');
check('meanMood(null) is null, not 0', m.meanMood(null) === null);
check('meanMood({}) is null', m.meanMood({}) === null);
check('moodTone(null) is null rather than a colour', m.moodTone(null) === null);
check('the distribution counts only rated days', m.moodDistribution([{}, { evening_mood: 8 }, { morning_mood: 9, evening_mood: 3 }]).rated === 2);
check('moodColor falls back to the axis colour', m.moodColor(null) === 'var(--chart-axis)');

console.log('\n== the ramp boundaries match the daily score bands ==');
check('1 is low', m.moodTone(1) === 'low');
check('4 is low', m.moodTone(4) === 'low');
check('5 is mid', m.moodTone(5) === 'mid');
check('6 is mid', m.moodTone(6) === 'mid');
check('7 is high', m.moodTone(7) === 'high');
check('10 is high', m.moodTone(10) === 'high');
check('each tone has a distinct colour', new Set([
    m.moodColor(2), m.moodColor(5), m.moodColor(9),
]).size === 3);

console.log('\n== an out-of-range value is missing, not clamped ==');
check('moodFor rejects 0', m.moodFor({ morning_mood: 0 }, 'morning') === null);
check('moodFor rejects 11', m.moodFor({ evening_mood: 11 }, 'evening') === null);
check('moodFor rejects NaN', m.moodFor({ morning_mood: NaN }, 'morning') === null);
check('moodTone(0) is null rather than clamped to low', m.moodTone(0) === null);
check('a bad value does not drag the mean', m.meanMood({ morning_mood: 0, evening_mood: 8 }) === 8);

console.log('\n== a twice-rated day is not double-weighted ==');
// A day rated 8/8 and a day rated 4 in the evening only. Weighting the *readings*
// rather than the *days* would average (8+8+4)/3 = 6.67 and quietly let the
// twice-rated day outvote the once-rated one by two to one.
const uneven = [{ morning_mood: 8, evening_mood: 8 }, { evening_mood: 4 }];
check('meanMoodAcross averages per-day means: (8 + 4) / 2 = 6', m.meanMoodAcross(uneven) === 6, `got ${m.meanMoodAcross(uneven)}`);
check('meanMoodAcross of nothing rated is null', m.meanMoodAcross([{}, {}]) === null);
check('meanMoodAcross of a single rated day is that day', m.meanMoodAcross([{ evening_mood: 3 }]) === 3);
const dist = m.moodDistribution(uneven);
check('the distribution puts 8 in high', dist.high === 1);
check('the distribution puts 4 in low', dist.low === 1);

console.log('\n== labels read the way a screen reader needs them ==');
check('an unrated day says so', m.moodLabel(null) === 'not rated');
check('a rating rounds to one decimal', m.moodLabel(7.25) === '7.3/10', m.moodLabel(7.25));
check('a whole rating is not given a decimal point', m.moodLabel(8) === '8/10', m.moodLabel(8));

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);