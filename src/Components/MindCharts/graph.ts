import type { DailyLog } from '../../services/dailyLogService';
import { meanMood } from '../../utils/moodSeries';

/**
 * Turning daily logs into a topic graph.
 *
 * Separate from the component that draws it, for two reasons. The layout is the
 * part most worth testing and it needs no DOM to run, and `react-refresh` cannot
 * hot-reload a module that exports both a component and a pile of functions -- so
 * keeping them apart is what lets this file's changes reach the browser without a
 * full reload.
 *
 * A topic is the thing that recurs. It becomes a node, and how often it recurs is
 * what sizes it -- that was the point of the graph: a subject mentioned twice and
 * one mentioned thirty times should not look equally important.
 *
 * A day is a satellite. It carries no size of its own, only a colour, and that
 * colour is the day's average mood. Which is the second thing worth seeing: which
 * days a topic turned up on, and whether the days it recurred on were good ones.
 */

export interface TopicNode {
    id: string;
    label: string;
    /** How many entries linked this topic. Drives the radius. */
    count: number;
    /** Dates that linked it, for the tooltip and for co-occurrence. */
    dates: string[];
    /** Mean mood across those dates, or null if none of them was rated. */
    mood: number | null;
    x: number;
    y: number;
    vx: number;
    vy: number;
    pinned: boolean;
}

export interface DayNode {
    id: string;
    date: string;
    mood: number | null;
    x: number;
    y: number;
    vx: number;
    vy: number;
    pinned: boolean;
}

export interface GraphEdge {
    source: string;
    target: string;
    /** 'topic' for day-to-topic links, 'co' for topics seen on the same day. */
    kind: 'topic' | 'co';
    /** Mood of the day on a 'topic' edge; mean of the pair on a 'co' edge. */
    mood: number | null;
}

export interface BuiltGraph {
    topics: TopicNode[];
    days: DayNode[];
    edges: GraphEdge[];
}

export const TOPIC_MIN_R = 6;
export const TOPIC_MAX_R = 34;
export const DAY_R = 4.5;

/**
 * Radius from a topic's frequency.
 *
 * Square-root rather than linear: area is what the eye reads as size, so a linear
 * radius makes the difference between 3 and 30 mentions look far larger than it is
 * and squashes every infrequent topic into an unreadable dot. The floor and
 * ceiling keep a once-mentioned topic visible and a runaway topic from swallowing
 * the graph.
 */
export const topicRadius = (count: number): number => {
    if (count <= 0) return TOPIC_MIN_R;
    const scaled = Math.sqrt(count) * 5;
    return Math.min(TOPIC_MAX_R, Math.max(TOPIC_MIN_R, scaled));
};

/** Co-occurrence edges are drawn per topic, and this is the ceiling on each. */
const MAX_NEIGHBOURS = 8;

/**
 * How many links two topics may share before their co-occurrence edge is dropped.
 *
 * Zero, deliberately. Every pairing that ever happened on the same day is a real
 * observation, but a subject present on twenty days has a hundred and eighty of
 * them and one bubble's worth of edges would black out the canvas around it. The
 * simulation would not stop drawing them; it would just draw the same thing
 * several times.
 */
const CO_LINK_CAP = 24;

/**
 * Turns daily logs into the graph's nodes and edges.
 *
 * Pure, so the caller can memoise it and the simulation can mutate its own copy of
 * the result without touching what React is holding.
 *
 * Two limits, both about the graph staying readable rather than about the data:
 * the days taken are the most recent N, and a topic has to appear at least twice
 * to get a bubble. A month of entries with every topic mentioned once is one
 * enormous scatter of singletons, which is not a graph.
 */
export const buildGraph = (
    logs: readonly DailyLog[],
    opts: { maxDays: number; minTopicCount: number },
): BuiltGraph => {
    // Newest first, then capped: the cap is on what is *drawn*, so it has to take
    // the most recent days rather than the first ones in whatever order the query
    // returned.
    const dated = [...logs]
        .filter(l => typeof l.log_date === 'string')
        .sort((a, b) => (a.log_date < b.log_date ? 1 : -1))
        .slice(0, opts.maxDays);

    const byTopic = new Map<string, { dates: string[]; moods: number[] }>();
    const dayMood = new Map<string, number>();

    for (const log of dated) {
        const mood = meanMood(log);
        if (mood !== null) dayMood.set(log.log_date, mood);
        // Case-folded: "Gym" and "gym" typed a week apart are one subject, and two
        // half-size bubbles would be a worse answer than one.
        const seen = new Set<string>();
        for (const raw of log.journal_links ?? []) {
            const label = raw.trim();
            if (!label) continue;
            const key = label.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const entry = byTopic.get(key) ?? { dates: [], moods: [] };
            entry.dates.push(log.log_date);
            if (mood !== null) entry.moods.push(mood);
            byTopic.set(key, entry);
        }
    }

    const topics: TopicNode[] = [];
    for (const [key, entry] of byTopic) {
        if (entry.dates.length < opts.minTopicCount) continue;
        topics.push({
            // The id is the folded label, so a link and a co-occurrence edge both
            // resolve to the same node without a second lookup table.
            id: `topic:${key}`,
            // The folded spelling for now. The original casing is restored below,
            // once every entry has had its say on how this was written.
            label: key,
            count: entry.dates.length,
            dates: entry.dates,
            mood: entry.moods.length
                ? entry.moods.reduce((s, v) => s + v, 0) / entry.moods.length
                : null,
            x: 0, y: 0, vx: 0, vy: 0, pinned: false,
        });
    }

    // A topic's display name is the first spelling the user typed for it. Sorting
    // by frequency first means the most prominent bubble is the one whose
    // original casing survives when a name was typed inconsistently.
    topics.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const displayLabel = new Map<string, string>();
    for (const topic of topics) {
        const key = topic.id.slice('topic:'.length);
        for (const log of dated) {
            for (const raw of log.journal_links ?? []) {
                if (raw.trim().toLowerCase() !== key) continue;
                displayLabel.set(key, raw.trim());
            }
        }
        topic.label = displayLabel.get(key) ?? topic.label;
    }

    // Seeded on a golden-angle spiral rather than at random, so the same week of
    // entries always draws the same picture and there is no reshuffle between
    // renders or between visits.
    topics.forEach((topic, i) => {
        const angle = i * 2.399963;
        const radius = 40 + Math.sqrt(i + 1) * 55;
        topic.x = Math.cos(angle) * radius;
        topic.y = Math.sin(angle) * radius;
    });

    const days: DayNode[] = dated.map((log, i) => ({
        id: `day:${log.log_date}`,
        date: log.log_date,
        mood: dayMood.get(log.log_date) ?? null,
        // Days ring the topics rather than sitting among them: they are the
        // evidence for the topics, and drawing them in the same field as the thing
        // being measured makes the bubbles hard to size by eye.
        x: Math.cos((i / Math.max(1, dated.length)) * Math.PI * 2) * 260,
        y: Math.sin((i / Math.max(1, dated.length)) * Math.PI * 2) * 260,
        vx: 0, vy: 0, pinned: false,
    }));

    const edges: GraphEdge[] = [];
    const dateToDay = new Map(days.map(d => [d.date, d]));

    for (const topic of topics) {
        for (const date of topic.dates) {
            const day = dateToDay.get(date);
            if (!day) continue;
            edges.push({ source: topic.id, target: day.id, kind: 'topic', mood: day.mood });
        }
    }

    // Topics that appeared on the same day are drawn to each other. This is the
    // part that turns a scatter of separate subjects into a network: it is what
    // shows which concerns actually travel together.
    const topicsById = new Map(topics.map(t => [t.id, t]));
    const drawn = new Set<string>();
    for (const topic of topics) {
        const neighbours = new Set<string>();
        for (const date of topic.dates) {
            for (const other of topics) {
                if (other.id === topic.id) continue;
                if (!other.dates.includes(date)) continue;
                neighbours.add(other.id);
                if (neighbours.size >= MAX_NEIGHBOURS) break;
            }
            if (neighbours.size >= MAX_NEIGHBOURS) break;
        }
        let coLinks = 0;
        for (const otherId of neighbours) {
            if (coLinks >= CO_LINK_CAP) break;
            const other = topicsById.get(otherId);
            if (!other) continue;
            // One edge per pair. Sorting the two ids into the key means the pair is
            // skipped the second time round regardless of which topic reaches it.
            const pairKey = topic.id < other.id
                ? `${topic.id}|${other.id}`
                : `${other.id}|${topic.id}`;
            if (drawn.has(pairKey)) continue;
            drawn.add(pairKey);
            const shared = topic.dates.filter(d => other.dates.includes(d));
            const moods = shared
                .map(d => dayMood.get(d))
                .filter((m): m is number => m !== undefined);
            edges.push({
                source: topic.id,
                target: other.id,
                kind: 'co',
                mood: moods.length ? moods.reduce((s, v) => s + v, 0) / moods.length : null,
            });
            coLinks++;
        }
    }

    return { topics, days, edges };
};

// ---- the simulation -------------------------------------------------------

/**
 * A node plus its mass, held as a parallel array rather than as a field.
 *
 * Mass is derived from the node on every tick and is not part of what gets drawn
 * or stored, so it has no business in the exported node types. Keeping it beside
 * them rather than on them is what lets `step` work on the real objects.
 */
type Body = TopicNode | DayNode;

/** Repulsion between two bodies, spread apart at close range. */
const REPULSION = 900;
/** Rest length of a day-topic spring and of a co-occurrence spring. */
const REST_TOPIC = 70;
const REST_CO = 150;
/**
 * Spring stiffness. A day-topic link pulls an order of magnitude harder than a
 * co-occurrence link, which is a real but looser relationship -- at equal strength
 * the co-occurrence webs pull the day-topic structure flat.
 */
const STIFFNESS_TOPIC = 0.055;
const STIFFNESS_CO = 0.012;
/** Pull toward the origin, and the per-tick damping that makes it settle. */
const CENTRING = 0.012;
const DAMPING = 0.82;

/**
 * One force-directed tick over the graph.
 *
 * Three forces, the smallest set that produces a readable layout:
 *
 *  - repulsion between every pair, which is what pushes unconnected bubbles apart;
 *  - a spring along every edge, which is what pulls connected ones together;
 *  - a pull toward the origin, so nothing drifts off the canvas.
 *
 * Written as plain loops over typed arrays of positions rather than as a physics
 * library. It is about forty lines, it owns its own iteration budget, and it stops
 * when the layout settles -- none of which a general-purpose library gives up
 * cheaply, and all three matter more than its flexibility here.
 *
 * Velocity is damped rather than zeroed, so the graph eases to rest instead of
 * stopping dead, and `alpha` falls each tick so it does stop.
 */
export const step = (graph: BuiltGraph, alpha: number): number => {
    const { topics, days, edges } = graph;

    // One array of bodies, so repulsion is a single pass rather than a
    // topic-vs-topic plus a topic-vs-day special case.
    //
    // These are the *same objects* as the graph's nodes, not copies. The
    // integration below writes `x`/`y`/`vx`/`vy` back through them, and that write
    // is the entire output of this function: the caller publishes
    // `graph.topics` afterwards. Spreading them into fresh objects -- which an
    // earlier version of this did, to "keep the simulation from mutating what
    // React is holding" -- makes the whole tick a no-op, because the forces are
    // computed correctly onto throwaway copies and then discarded. Nothing would
    // crash and nothing would move.
    //
    // Mutating in place is safe because the caller runs this against its own copy:
    // `TopicNetwork` spreads `buildGraph`'s output before the first tick, so the
    // memoised graph stays pure.
    const bodies: Body[] = [...topics, ...days];
    // Heavier topics resist being shoved around, so a heavily-linked bubble holds
    // its place while the small ones rearrange themselves around it. Days are
    // lighter and end up as a loose ring in the gaps.
    const masses: number[] = [
        ...topics.map(t => 1 + topicRadius(t.count) / 12),
        ...days.map(() => 0.7),
    ];
    // Keyed from the two source arrays in the same order they were flattened into
    // `bodies`. Index arithmetic here would silently mistarget every edge.
    const index = new Map<string, Body>();
    topics.forEach((t, i) => index.set(t.id, bodies[i]));
    days.forEach((d, i) => index.set(d.id, bodies[topics.length + i]));

    // Repulsion. O(n^2) over the node count, which is why the caller caps it -- at
    // a few hundred nodes this is a fraction of a millisecond, and past that the
    // graph would be unreadable anyway.
    for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i], b = bodies[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let distSq = dx * dx + dy * dy;
            if (distSq < 0.01) {
                // Coincident nodes: nudged apart deterministically rather than
                // divided by zero, which would fling one of them off the canvas.
                dx = (i % 7) - 3;
                dy = (j % 7) - 3;
                distSq = dx * dx + dy * dy || 1;
            }
            const dist = Math.sqrt(distSq);
            const force = (REPULSION * alpha) / (distSq * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx / masses[i];
            a.vy += fy / masses[i];
            b.vx -= fx / masses[j];
            b.vy -= fy / masses[j];
        }
    }

    for (const edge of edges) {
        const a = index.get(edge.source);
        const b = index.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const rest = edge.kind === 'topic' ? REST_TOPIC : REST_CO;
        const strength = edge.kind === 'topic' ? STIFFNESS_TOPIC : STIFFNESS_CO;
        const force = (dist - rest) * strength * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
    }

    let motion = 0;
    for (const body of bodies) {
        if (body.pinned) { body.vx = 0; body.vy = 0; continue; }
        body.vx -= body.x * CENTRING * alpha;
        body.vy -= body.y * CENTRING * alpha;
        body.vx *= DAMPING;
        body.vy *= DAMPING;
        const speed = Math.abs(body.vx) + Math.abs(body.vy);
        if (speed > motion) motion = speed;
        body.x += body.vx;
        body.y += body.vy;
    }
    return motion;
};

/** The simulation's own coordinate space, and the viewBox it draws into. */
export const VIEW = 900;
export const TICKS = 320;
/** Below this the layout is at rest and the loop can stop. */
export const MIN_MOTION = 0.4;

/** Nodes by id, for resolving an edge's two endpoints without a scan. */
export const nodeById = (
    topics: TopicNode[],
    days: DayNode[],
): Map<string, { x: number; y: number }> => {
    const map = new Map<string, { x: number; y: number }>();
    for (const t of topics) map.set(t.id, t);
    for (const d of days) map.set(d.id, d);
    return map;
};