import React from 'react';

interface TimerDisplayProps {
    /** Already formatted, e.g. "24:59" or "1:01:01". */
    text: string;
    /**
     * 0..1 around the ring, or null to draw the track only.
     *
     * Null for the stopwatch, which has no end and therefore no honest arc --
     * a stopwatch ring that fills toward nothing is decoration pretending to be
     * a measurement. It gets the sweep instead.
     */
    fraction: number | null;
    /** Running, so the sweep is shown. */
    running: boolean;
    /** Paused or idle: the digits step back. */
    dimmed: boolean;
    /** Expired: red and pulsing. */
    done: boolean;
    /** Under the digits. Hidden when there is nothing to say. */
    phase?: string;
    phaseTone?: 'work' | 'rest' | 'long';
    /** Second line, e.g. "Round 2 of 4". */
    round?: string;
}

/**
 * The countdown ring and its digits.
 *
 * Responsive now: the wrapper carries the size in CSS, and the SVG scales
 * through its viewBox, so the component no longer hard-codes a pixel width.
 * Sixty tick marks (major every five) turn the ring into an actual clock face
 * rather than a bare progress track; the arc and the sweep behave as before.
 */
const TimerDisplay: React.FC<TimerDisplayProps> = ({
    text, fraction, running, dimmed, done, phase, phaseTone, round,
}) => {
    const size = 260;
    const stroke = 12;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;

    // A null fraction means "no end to measure against", which is drawn as an
    // empty track rather than as a full circle -- a full ring on a stopwatch
    // reads as "finished".
    const clamped = fraction === null ? 0 : Math.max(0, Math.min(1, fraction));
    const offset = circumference * (1 - clamped);

    const digitsClass = [
        'timer-digits',
        dimmed ? 'timer-digits--stopped' : '',
        done ? 'timer-digits--done' : '',
    ].filter(Boolean).join(' ');

    // Sixty ticks around the face. Major ticks every five seconds/minutes are
    // longer, which is what makes the dial scannable at a glance.
    const ticks = Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
        const outer = radius + stroke / 2 + 2;
        const inner = outer - (major ? 10 : 5);
        const x1 = size / 2 + Math.cos(angle) * inner;
        const y1 = size / 2 + Math.sin(angle) * inner;
        const x2 = size / 2 + Math.cos(angle) * outer;
        const y2 = size / 2 + Math.sin(angle) * outer;
        return { i, major, x1, y1, x2, y2 };
    });

    return (
        <div
            className="timer-display"
            // The digits are the live value, so the whole ring is the live region.
            // Polite rather than assertive: it updates five times a second, and an
            // assertive region doing that would talk over everything else on the
            // page.
            role="timer"
            aria-live="polite"
            aria-atomic="true"
        >
            <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
                {/* Tick marks. Drawn first so the ring sits on top of them. */}
                <g className="timer-ticks">
                    {ticks.map(tick => (
                        <line
                            key={tick.i}
                            x1={tick.x1} y1={tick.y1}
                            x2={tick.x2} y2={tick.y2}
                            stroke={tick.major ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'}
                            strokeWidth={tick.major ? 1.5 : 1}
                            strokeLinecap="round"
                        />
                    ))}
                </g>

                {/* Track. `rgba(255,255,255,0.08)` rather than a token: there is
                    no neutral token in this stylesheet and inventing one for a
                    single rule would be inconsistent with every other page. */}
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={stroke}
                />

                {fraction !== null && (
                    <circle
                        cx={size / 2} cy={size / 2} r={radius}
                        fill="none"
                        stroke={done ? '#ff5a60' : 'var(--color-primary)'}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                        style={{
                            // Shorter than a full repaint interval. A transition
                            // longer than the gap between ticks would make the arc
                            // lag behind the digits, which are not transitioned.
                            transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s ease',
                        }}
                    />
                )}

                {/* The sweep. Only while running, and only when there is no arc --
                    on a countdown the arc is already the motion, and two moving
                    elements at once reads as noise. */}
                {running && fraction === null && (
                    <circle
                        className="timer-sweep"
                        cx={size / 2} cy={size / 2} r={radius}
                        fill="none"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        strokeLinecap="round"
                        // One eighth of the circumference, so it is a moving tick
                        // around the edge rather than a second full ring.
                        strokeDasharray={`${circumference * 0.08} ${circumference * 0.92}`}
                        strokeDashoffset={circumference * 0.25}
                        opacity={0.5}
                    />
                )}
            </svg>

            <div className="timer-display__inner">
                <span
                    className={digitsClass}
                >
                    {text}
                </span>

                {phase && (
                    <span className={`timer-phase${phaseTone ? ` timer-phase--${phaseTone}` : ''}`}>
                        {phase}
                    </span>
                )}
                {round && <span className="timer-round">{round}</span>}
            </div>
        </div>
    );
};

export default TimerDisplay;