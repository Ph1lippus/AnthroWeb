// Behavioural checks for the cheat-day budget helpers in src/utils/cheatDays.ts.
//
// The budget is the one piece of the feature that is pure arithmetic, so it is
// the piece that is worth pinning down here: which window a date falls in, and
// which cheat day in that window is the one that runs past the allowance. The
// React side only renders the verdict this returns.
//
// Like verify-mood-math, this transpiles the TypeScript with the project's own
// compiler rather than importing it, so it runs in plain Node with no build step
// and no ts-node. cheatDays imports `./dates`, so the real dates module is
// transpiled and handed to it -- the helpers under test use the same calendar
// arithmetic the app does, not a copy.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const ts = (await import('typescript')).default;

const transpile = (path) =>
    ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;

/** Evaluate a transpiled CommonJS module, resolving its `./x` requires from `deps`. */
const load = (path, deps = {}) => {
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', transpile(path))(mod, mod.exports, (id) => {
        const key = id.replace(/^\.\//, '').replace(/\.ts$/, '');
        if (!(key in deps)) throw new Error(`unexpected require: ${id}`);
        return deps[key];
    });
    return mod.exports;
};

const dates = load('src/utils/dates.ts');
const cheat = load('src/utils/cheatDays.ts', { dates });

for (const name of ['periodBounds', 'startOfWeekMonday', 'cheatDayStatus']) {
    if (typeof cheat[name] !== 'function') {
        console.log(`  FAIL could not load ${name} from the transpiled module`);
        process.exit(1);
    }
}

// 2026-01-01 is a Thursday, so its ISO week starts Monday 2025-12-29.
console.log('\n== period bounds ==');
const week = cheat.periodBounds('2026-01-01', 'week');
check('a Thursday lands in a Monday-started week',
    week.start === '2025-12-29' && week.end === '2026-01-04', JSON.stringify(week));
check('a Sunday is the last day of its own week, not the next',
    cheat.startOfWeekMonday('2026-01-04') === '2025-12-29', cheat.startOfWeekMonday('2026-01-04'));

const feb = cheat.periodBounds('2026-02-15', 'month');
check('a month window is the calendar month',
    feb.start === '2026-02-01' && feb.end === '2026-02-28', JSON.stringify(feb));

// Count only cheat days on or before the date, within the window.
const cheatLog = (log_date) => ({ log_date, cheat_day: true });

console.log('\n== unlimited budget ==');
check('null allowance is always exempt',
    cheat.cheatDayStatus({ logs: [], date: '2026-01-08', isCheat: true, allowed: null, period: 'week' }).exempt === true);

console.log('\n== within and past a weekly allowance ==');
const within = cheat.cheatDayStatus({
    logs: [cheatLog('2026-01-06')], date: '2026-01-08', isCheat: true, allowed: 2, period: 'week',
});
check('two cheat days against a budget of two is still free',
    within.used === 2 && within.exempt === true, JSON.stringify(within));

const over = cheat.cheatDayStatus({
    logs: [cheatLog('2026-01-06')], date: '2026-01-08', isCheat: true, allowed: 1, period: 'week',
});
check('the second cheat day against a budget of one is penalised',
    over.used === 2 && over.exempt === false, JSON.stringify(over));

check('a budget of zero never excuses one',
    cheat.cheatDayStatus({ logs: [], date: '2026-01-08', isCheat: true, allowed: 0, period: 'week' }).exempt === false);

console.log('\n== the window edges ==');
const crossingWeek = cheat.cheatDayStatus({
    logs: [cheatLog('2025-12-29')], date: '2026-01-04', isCheat: true, allowed: 1, period: 'week',
});
check('a Monday counts against the Sunday of the same week',
    crossingWeek.used === 2 && crossingWeek.exempt === false, JSON.stringify(crossingWeek));

const crossingMonth = cheat.cheatDayStatus({
    logs: [cheatLog('2026-01-31')], date: '2026-02-01', isCheat: true, allowed: 1, period: 'month',
});
check('last month does not spend this month\'s budget',
    crossingMonth.used === 1 && crossingMonth.exempt === true, JSON.stringify(crossingMonth));

console.log('\n== later days do not change an earlier verdict ==');
const earlier = cheat.cheatDayStatus({
    logs: [cheatLog('2026-01-07')], date: '2026-01-06', isCheat: true, allowed: 1, period: 'week',
});
check('a cheat day later in the week is not counted',
    earlier.used === 1 && earlier.exempt === true, JSON.stringify(earlier));

console.log('\n== the stored row for the day is the form\'s job ==');
const stored = cheat.cheatDayStatus({
    logs: [cheatLog('2026-01-08')], date: '2026-01-08', isCheat: true, allowed: 1, period: 'week',
});
check('the same date in the log is not double-counted',
    stored.used === 1 && stored.exempt === true, JSON.stringify(stored));

console.log('\n== an unmarked day still reports what it has spent ==');
const unmarked = cheat.cheatDayStatus({
    logs: [cheatLog('2026-01-06'), cheatLog('2026-01-07')], date: '2026-01-08', isCheat: false, allowed: 3, period: 'week',
});
check('used counts earlier cheat days even when this one is not a cheat day',
    unmarked.used === 2 && unmarked.exempt === true, JSON.stringify(unmarked));

console.log(fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
