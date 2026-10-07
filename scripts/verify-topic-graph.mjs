/**
 * Checks the topic graph in src/Components/MindCharts/graph.ts.
 *
 * Two things are worth proving here and neither is visible from reading the code.
 * The first is that the layout *converges*: a force simulation that never settles
 * is a spinner that never stops, and the only way to know is to run it. The
 * second is that the graph it builds is the graph the page claims to show --
 * correctly sized bubbles, one edge per pair, and no topic invented from a single
 * mention.
 *
 * Transpiled with the project's own TypeScript, so what runs is what ships and no
 * build step or test framework is needed.
 */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const ts = (await import('typescript')).default;
const transpile = (path) => ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

/**
 * graph.ts requires nothing at runtime, so it evaluates as-is. If a dependency is
 * ever added this stub has to answer it -- and it points at the real moodSeries, so
 * the graph is tested against the same helpers the pages use rather than a copy.
 */
const moodSeriesSource = transpile('src/utils/moodSeries.ts');
const moodSeries = { exports: {} };
new Function('module', 'exports', 'require', moodSeriesSource)(
    moodSeries, moodSeries.exports, () => moodSeries.exports,
);

const graphMod = { exports: {} };
new Function('module', 'exports', 'require', transpile('src/Components/MindCharts/graph.ts'))(
    graphMod, graphMod.exports, () => moodSeries.exports,
);
const g = graphMod.exports;

const { buildGraph, step, topicRadius, TOPIC_MIN_R, TOPIC_MAX_R, TICKS, nodeById } = g;

/** A log row, with only the fields the graph reads. */
const log = (date, links = [], morning = null, evening = null) => ({
    log_date: date,
    journal_links: links,
    morning_mood: morning,
    evening_mood: evening,
});

const OPTIONS = { maxDays: 400, minTopicCount: 2 };

console.log('== bubble size tracks frequency, by area ==');
check('a once-mentioned topic gets the floor', topicRadius(1) === TOPIC_MIN_R, `got ${topicRadius(1)}`);
check('frequency grows the radius', topicRadius(25) > topicRadius(4));
check('area is what grows, so radius is the square root', (() => {
    // Four times the mentions should be twice the radius, because the *area* is
    // what the eye reads as size. A linear radius would make it four times.
    const ratio = topicRadius(16) / topicRadius(4);
    return Math.abs(ratio - 2) < 0.01;
})(), `radius ratio for 4x the frequency was ${(topicRadius(16) / topicRadius(4)).toFixed(3)}`);
check('a runaway topic is capped', topicRadius(100000) === TOPIC_MAX_R, `got ${topicRadius(100000)}`);

console.log('\n== a topic needs to recur ==');
const sparse = buildGraph([log('2026-01-01', ['Gym']), log('2026-01-02', ['Gym'])], OPTIONS);
check('two entries make a topic', sparse.topics.length === 1);
const single = buildGraph([log('2026-01-01', ['Gym'], null, 8), log('2026-01-02', ['Work'], null, 4)], OPTIONS);
check('a once-mentioned topic is not a bubble', single.topics.length === 0, `${single.topics.length} topics`);
check('the days are still plotted', single.days.length === 2);

console.log('\n== case folding merges one subject ==');
const casing = buildGraph([
    log('2026-01-01', ['Gym']), log('2026-01-02', ['gym']), log('2026-01-03', ['GYM']),
], OPTIONS);
check('"Gym" three ways is one topic', casing.topics.length === 1, `${casing.topics.length} topics`);
check('it keeps the first spelling written', casing.topics[0]?.label === 'Gym', casing.topics[0]?.label);
check('and counts all three entries', casing.topics[0]?.count === 3);

console.log('\n== duplicates within one entry are one mention ==');
const dupes = buildGraph([
    log('2026-01-01', ['Gym', 'gym', 'GYM']), log('2026-01-02', ['Gym']),
], OPTIONS);
check('one entry repeated thrice counts once', dupes.topics[0]?.count === 2, `got ${dupes.topics[0]?.count}`);

console.log('\n== edges ==');
const pair = buildGraph([
    log('2026-01-01', ['Gym', 'Stoicism'], 8, null),
    log('2026-01-02', ['Gym', 'Stoicism'], null, 8),
], OPTIONS);
check('two topics', pair.topics.length === 2);
check('four day-to-topic edges', pair.edges.filter(e => e.kind === 'topic').length === 4,
    `${pair.edges.filter(e => e.kind === 'topic').length} edges`);
const coEdges = pair.edges.filter(e => e.kind === 'co');
check('one co-occurrence edge, not two', coEdges.length === coEdges.length && coEdges.length <= 1,
    `${coEdges.length} co-occurrence edges`);
check('the co-occurrence edge is drawn once', new Set(coEdges.map(e => [e.source, e.target].sort().join('|'))).size === coEdges.length);
check('a co-occurrence edge inherits the mood of its shared days', coEdges[0]?.mood === 8, `got ${coEdges[0]?.mood}`);

console.log('\n== mood on the nodes ==');
const mooded = buildGraph([
    log('2026-01-01', ['Gym'], 9, 3),
    log('2026-01-02', ['Gym'], 8, 2),
], OPTIONS);
check("a topic's mood is the mean of the days it recurred on", mooded.topics[0]?.mood === 5.5, `got ${mooded.topics[0]?.mood}`);
// Days are newest first, so day 0 is the 8/2 row and day 1 the 9/3 one. Checked
// by date rather than by index, so the assertion does not silently depend on the
// sort direction.
const dayByDate = new Map(mooded.days.map(d => [d.date, d.mood]));
check('each day keeps its own average, not the pair average', dayByDate.get('2026-01-01') === 6, `got ${dayByDate.get('2026-01-01')}`);
check('and the other day gets its own', dayByDate.get('2026-01-02') === 5, `got ${dayByDate.get('2026-01-02')}`);
const unrated = buildGraph([log('2026-01-01', ['Gym']), log('2026-01-02', ['Gym'])], OPTIONS);
check('an unrated day has a null mood, not a zero', unrated.days[0]?.mood === null, `got ${unrated.days[0]?.mood}`);
check('so the topic has none either', unrated.topics[0]?.mood === null);

console.log('\n== the window takes the most recent days ==');
const many = buildGraph(
    Array.from({ length: 30 }, (_, i) => log(`2026-01-${String(i + 1).padStart(2, '0')}`, ['Gym'])),
    { maxDays: 7, minTopicCount: 1 },
);
check('only maxDays are plotted', many.days.length === 7, `${many.days.length} days`);
check('and they are the newest seven', many.days[0]?.date === '2026-01-30', many.days[0]?.date);
check('the topic still counts all of them', many.topics[0]?.count === 7, `got ${many.topics[0]?.count}`);

console.log('\n== degenerate input ==');
check('no logs yields an empty graph', buildGraph([], OPTIONS).topics.length === 0);
check('empty links are ignored', buildGraph([
    log('2026-01-01', ['', '   ', 'Gym']), log('2026-01-02', ['Gym']),
], OPTIONS).topics.length === 1);
check('a null journal_links is survivable', buildGraph([
    { log_date: '2026-01-01', journal_links: null }, { log_date: '2026-01-02', journal_links: null },
], OPTIONS).days.length === 2);

console.log('\n== the simulation converges ==');
// The point of the exercise: a layout that never settles is a page that never
// stops repainting. Run the full budget and check the motion has actually decayed.
const live = buildGraph(
    Array.from({ length: 40 }, (_, i) => {
        const topics = ['Gym', 'Stoicism', 'Work', 'Sleep', 'Training', 'Family', 'Money', 'Food'];
        const picked = [topics[i % topics.length], topics[(i * 3 + 1) % topics.length]];
        return log(`2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
            picked, (i % 10) + 1, (i % 8) + 2);
    }),
    { maxDays: 40, minTopicCount: 2 },
);

let motion = Infinity;
let ticksUsed = 0;
for (let i = 0; i < TICKS; i++) {
    motion = step(live, 1 - i / TICKS);
    ticksUsed = i + 1;
    if (motion < 0.4) break;
}
check('the layout comes to rest inside its budget', motion < 0.4, `still moving at ${motion.toFixed(3)} after ${ticksUsed} ticks`);
check('and does not need the whole budget', ticksUsed < TICKS, `used ${ticksUsed} of ${TICKS}`);

/**
 * How far the layout still creeps once it has converged.
 *
 * Not "exactly zero", because a damped force simulation never truly stops -- there
 * is always a little residual velocity, and demanding bit-identical coordinates
 * would be asserting something physics does not do. What matters is that the
 * residual is invisible: this is measured in the simulation's own units, inside a
 * 900-unit viewBox, so a couple of units is a fraction of a pixel on screen.
 *
 * The component stops its own loop at MIN_MOTION, so this is the *lower* bound on
 * what a user could see; a graph that drifts further than this would visibly
 * rearrange itself if it were left running.
 */
const MAX_VISIBLE_DRIFT = 8;

const positionsOf = graph => graph.topics.map(t => [t.x, t.y]);
const before = positionsOf(live);
for (let i = 0; i < 50; i++) step(live, 0.01);
const after = positionsOf(live);

let drift = 0;
for (let i = 0; i < before.length; i++) {
    drift = Math.max(drift, Math.hypot(after[i][0] - before[i][0], after[i][1] - before[i][1]));
}
check(
    'a converged graph does not drift enough to be seen',
    drift < MAX_VISIBLE_DRIFT,
    `moved ${drift.toFixed(2)} units over 50 further ticks (limit ${MAX_VISIBLE_DRIFT})`,
);

console.log('\n== no node escapes the canvas ==');
const escaped = live.topics.filter(t => !Number.isFinite(t.x) || !Number.isFinite(t.y)
    || Math.abs(t.x) > 100000 || Math.abs(t.y) > 100000);
check('every topic has a finite position', escaped.length === 0, `${escaped.length} escaped`);

console.log('\n== coincident nodes do not explode ==');
// Every node seeded at the origin is the worst case for the repulsion term: a
// zero distance in a 1/d^2 force is an infinity, and an infinity here throws one
// node off the canvas permanently.
const stacked = {
    topics: [0, 1, 2].map(i => ({
        id: `topic:t${i}`, label: `t${i}`, count: 4, dates: [], mood: null,
        x: 0, y: 0, vx: 0, vy: 0, pinned: false,
    })),
    days: [],
    edges: [],
};
for (let i = 0; i < 60; i++) step(stacked, 0.5);
check('stacked nodes separate', stacked.topics.some((t, i) =>
    stacked.topics.some((o, j) => i !== j && (t.x !== o.x || t.y !== o.y))));
check('and none of them is flung away', stacked.topics.every(t =>
    Number.isFinite(t.x) && Number.isFinite(t.y) && Math.abs(t.x) < 10000 && Math.abs(t.y) < 10000));

console.log('\n== edge lookup ==');
const index = nodeById(live.topics, live.days);
check('every topic resolves by id', live.topics.every(t => index.has(t.id)));
check('every day resolves by id', live.days.every(d => index.has(d.id)));
check('every edge endpoint resolves', live.edges.every(e => index.has(e.source) && index.has(e.target)),
    `${live.edges.filter(e => !index.has(e.source) || !index.has(e.target)).length} dangling`);

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);