import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { DailyLog } from '../../services/dailyLogService';
import { moodTone, MOOD_TONE_COLOR } from '../../utils/moodSeries';
import {
    buildGraph, step, nodeById, topicRadius,
    DAY_R, VIEW, TICKS, MIN_MOTION,
} from './graph';
import type { BuiltGraph } from './graph';

interface TopicNetworkProps {
    logs: DailyLog[];
    /** Days to plot. The caller's range control owns this. */
    maxDays: number;
    minTopicCount: number;
    selected: string | null;
    onSelect: (id: string | null) => void;
}

const moodColorOrNull = (mood: number | null): string => {
    const tone = moodTone(mood);
    return tone ? MOOD_TONE_COLOR[tone] : 'var(--chart-axis)';
};

/**
 * The network, drawn by hand into an SVG.
 *
 * No graph library, for three reasons that all came from working around one
 * before: the node colour has to come from this app's mood ramp and not from a
 * library's default palette; the tooltips have to come from the app's own
 * `data-tip` delegation so a node's tooltip looks like every other tooltip; and
 * the layout has to stop when it settles rather than keep animating, because this
 * graph is read rather than watched.
 *
 * The simulation runs inside one `requestAnimationFrame` loop and is torn down
 * with the component. Not an effect per node and not an interval -- a background
 * tab throttles both to about a tick a second, which turns a 320-tick settle into
 * a five-minute one.
 */
const TopicNetwork: React.FC<TopicNetworkProps> = ({
    logs, maxDays, minTopicCount, selected, onSelect,
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const [positions, setPositions] = useState<BuiltGraph | null>(null);

    /**
     * Zoom and pan live in a ref and reach the DOM through the SVG's own
     * transform, never through state. They change on every wheel tick, and
     * pushing that through React would re-render every node a hundred times a
     * second for a change that is one attribute.
     */
    const viewRef = useRef({ scale: 1, x: 0, y: 0 });
    const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
    const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

    const graph = useMemo(
        () => buildGraph(logs, { maxDays, minTopicCount }),
        [logs, maxDays, minTopicCount],
    );

    useEffect(() => {
        // The simulation works on its own copy. `step` mutates the nodes it is
        // given -- that is how positions are written, and copying inside `step`
        // itself made every tick a silent no-op -- so the copy has to happen here,
        // against the memoised `graph`, which must stay pure for React.
        const mutable: BuiltGraph = {
            topics: graph.topics.map(t => ({ ...t })),
            days: graph.days.map(d => ({ ...d })),
            edges: graph.edges,
        };

        const publish = () => {
            setPositions({
                topics: mutable.topics,
                days: mutable.days,
                edges: mutable.edges,
            });
        };

        // Resolved once per run rather than per frame: `matchMedia` in a loop is a
        // layout read on every tick for an answer that cannot change mid-settle.
        const reduceMotion = typeof window !== 'undefined'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (reduceMotion) {
            // Settle it off-screen in one go and draw the result. The layout is a
            // means of ordering the bubbles, not an animation anyone asked for.
            for (let i = 0; i < TICKS; i++) step(mutable, 1 - i / TICKS);
            publish();
            return;
        }

        let tick = 0;
        const run = () => {
            const motion = step(mutable, 1 - tick / TICKS);
            tick++;
            // Published every fourth tick. Sixty publishes a second is more than
            // the eye can track in a settling layout and each one re-renders every
            // node, so the whole run costs a couple of seconds of frames rather
            // than a couple of hundred of them.
            if (tick % 4 === 0 || motion < MIN_MOTION || tick >= TICKS) publish();
            if (motion < MIN_MOTION || tick >= TICKS) {
                frameRef.current = null;
                return;
            }
            frameRef.current = requestAnimationFrame(run);
        };
        publish();
        frameRef.current = requestAnimationFrame(run);

        // Cancels the previous run, so changing the range never leaves two loops
        // animating the same nodes.
        return () => {
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        };
    }, [graph]);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const onWheel = (event: WheelEvent) => {
            // Non-passive, because the browser's own page zoom has to be prevented
            // for this to zoom the graph rather than scroll the page.
            event.preventDefault();
            const view = viewRef.current;
            view.scale = Math.min(6, Math.max(0.3, view.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
            svg.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`);
        };
        svg.addEventListener('wheel', onWheel, { passive: false });
        return () => svg.removeEventListener('wheel', onWheel);
    }, []);

    /** Pointer position in the simulation's own coordinates. */
    const toLocal = useCallback((event: React.PointerEvent) => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const rect = svg.getBoundingClientRect();
        const view = viewRef.current;
        // Without inverting the current transform a drag lands wherever the
        // pointer happens to be over the unzoomed drawing.
        return {
            x: ((event.clientX - rect.left) / rect.width * VIEW - view.x) / view.scale,
            y: ((event.clientY - rect.top) / rect.height * VIEW - view.y) / view.scale,
        };
    }, []);

    const onNodePointerDown = (id: string) => (event: React.PointerEvent) => {
        event.stopPropagation();
        const point = toLocal(event);
        const node = positions?.topics.find(t => t.id === id) ?? positions?.days.find(d => d.id === id);
        if (!node) return;
        dragRef.current = { id, dx: node.x - point.x, dy: node.y - point.y };
    };

    const onSurfacePointerDown = (event: React.PointerEvent) => {
        panRef.current = {
            x: event.clientX, y: event.clientY,
            vx: viewRef.current.x, vy: viewRef.current.y,
        };
    };

    const onPointerMove = (event: React.PointerEvent) => {
        const svg = svgRef.current;
        if (!svg) return;

        const drag = dragRef.current;
        if (drag && positions) {
            const point = toLocal(event);
            const x = point.x + drag.dx;
            const y = point.y + drag.dy;
            setPositions(prev => prev && {
                ...prev,
                topics: prev.topics.map(t => t.id === drag.id ? { ...t, x, y, pinned: true } : t),
                days: prev.days.map(d => d.id === drag.id ? { ...d, x, y, pinned: true } : d),
            });
            return;
        }

        const pan = panRef.current;
        if (!pan) return;
        const rect = svg.getBoundingClientRect();
        const view = viewRef.current;
        view.x = pan.vx + (event.clientX - pan.x) / rect.width * VIEW;
        view.y = pan.vy + (event.clientY - pan.y) / rect.height * VIEW;
        svg.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`);
    };

    const onPointerUp = () => {
        // A node that was dragged stays where it was put, because unpinning it
        // would send it drifting back into the layout on the next tick -- a
        // surprising thing to have happen to something just positioned.
        dragRef.current = null;
        panRef.current = null;
    };

    // A click on the background clears the selection. The graph is the filter's
    // context, so clicking it means "stop filtering".
    const clearIfBackground = (event: React.MouseEvent) => {
        if (event.target === event.currentTarget) onSelect(null);
    };

    const isDimmed = useCallback((id: string): boolean => {
        if (!selected || selected === id) return false;
        // Dimmed rather than hidden: a topic's position in the network is itself
        // information, and removing its neighbours would destroy the context that
        // makes it worth looking at.
        return !positions?.edges.some(e =>
            (e.source === selected && e.target === id) || (e.target === selected && e.source === id));
    }, [selected, positions]);

    // Resolved once per render rather than per edge: scanning both node arrays for
    // every edge would be O(edges x nodes), which is exactly the quadratic that
    // turns a smooth settle into a stutter.
    const lookup = useMemo(
        () => positions ? nodeById(positions.topics, positions.days) : null,
        [positions],
    );

    if (!positions || !lookup) {
        return <div className="mind-network-empty">Laying out the graph...</div>;
    }

    if (positions.topics.length === 0) {
        return (
            <div className="mind-network-empty">
                No topics repeated in this range. A topic needs at least {minTopicCount}{' '}
                entries to become a bubble -- link one on the journal page and it
                will appear here.
            </div>
        );
    }

    return (
        <div className="mind-network">
            <svg
                ref={svgRef}
                className="mind-network__svg"
                viewBox={`0 0 ${VIEW} ${VIEW}`}
                preserveAspectRatio="xMidYMid meet"
                onPointerDown={onSurfacePointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onClick={clearIfBackground}
                role="img"
                aria-label={`Topic network: ${positions.topics.length} topics across ${positions.days.length} days`}
            >
                <g>
                    {/* Edges first, so nodes and their labels draw over them. */}
                    {positions.edges.map((edge, i) => {
                        const a = lookup.get(edge.source);
                        const b = lookup.get(edge.target);
                        if (!a || !b) return null;
                        const tone = moodTone(edge.mood);
                        const lit = !selected || edge.source === selected || edge.target === selected;
                        return (
                            <line
                                key={`${edge.source}-${edge.target}-${i}`}
                                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                                stroke={tone ? MOOD_TONE_COLOR[tone] : 'var(--chart-axis)'}
                                strokeWidth={edge.kind === 'topic' ? 1.1 : 0.6}
                                strokeOpacity={lit ? (edge.kind === 'topic' ? 0.5 : 0.18) : 0.04}
                            />
                        );
                    })}

                    {positions.days.map(day => (
                        <circle
                            key={day.id}
                            cx={day.x} cy={day.y} r={DAY_R}
                            fill={moodColorOrNull(day.mood)}
                            fillOpacity={isDimmed(day.id) ? 0.15 : 0.9}
                        />
                    ))}

                    {positions.topics.map(topic => {
                        const tone = moodTone(topic.mood);
                        const radius = topicRadius(topic.count);
                        return (
                            <g
                                key={topic.id}
                                className="mind-network__topic"
                                opacity={isDimmed(topic.id) ? 0.22 : 1}
                                onPointerDown={onNodePointerDown(topic.id)}
                                onClick={event => {
                                    event.stopPropagation();
                                    onSelect(selected === topic.id ? null : topic.id);
                                }}
                                style={{ cursor: 'grab' }}
                                data-tip={
                                    `${topic.label} — ${topic.count} ${topic.count === 1 ? 'entry' : 'entries'}`
                                    + (topic.mood !== null
                                        ? ` · avg ${Math.round(topic.mood * 10) / 10}/10`
                                        : ' · not rated')
                                }
                            >
                                <circle
                                    cx={topic.x} cy={topic.y} r={radius}
                                    fill={tone ? MOOD_TONE_COLOR[tone] : 'var(--chart-axis)'}
                                    fillOpacity={0.22}
                                    stroke={tone ? MOOD_TONE_COLOR[tone] : 'var(--chart-axis)'}
                                    strokeWidth={selected === topic.id ? 2.5 : 1.2}
                                    strokeOpacity={0.9}
                                />
                                <text
                                    x={topic.x} y={topic.y}
                                    textAnchor="middle" dominantBaseline="central"
                                    className="mind-network__label"
                                    // Inside the bubble where it fits, just outside
                                    // where it does not, so an infrequent topic still
                                    // carries its name instead of being a dot with a
                                    // label hidden underneath it.
                                    fontSize={radius > 15 ? Math.min(11, radius / 2.4) : 10}
                                    dy={radius > 15 ? 0 : -(radius + 6)}
                                >
                                    {topic.label.length > 14 ? `${topic.label.slice(0, 13)}…` : topic.label}
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>

            <div className="mind-network__legend">
                {(['low', 'mid', 'high'] as const).map(tone => (
                    <span key={tone} className="mind-network__legend-item">
                        <span className="mind-network__swatch" style={{ background: MOOD_TONE_COLOR[tone] }} />
                        {tone === 'low' ? '1–4' : tone === 'mid' ? '5–6' : '7–10'}
                    </span>
                ))}
                <span className="mind-network__legend-note">
                    bubble size = how often the topic recurs
                </span>
            </div>
        </div>
    );
};

export default TopicNetwork;