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
 * The arc is the same technique `.score-ring` uses -- an SVG circle whose
 * `stroke-dashoffset` is the length of the remaining arc -- rather than a
 * conic-gradient. The reason to keep using it is that the dash offset is a real
 * length the browser interpolates, so the arc animates smoothly between two
 * values instead of stepping once per render. On a ring that repaints five times
 * a second, that is the difference between moving and strobing.
 *
 * `rotate(-90)` puts the start at twelve o'clock, because a countdown that
 * begins at three o'clock reads as an arbitrary amount done.
 */
const TimerDisplay: React.FC<TimerDisplayProps> = ({
    text, fraction, running, dimmed, done, phase, phaseTone, round,
}) => {
    const size = 260;
    const stroke = 10;
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

    return (
        <div
            className="timer-display"
            style={{ width: size, height: size }}
            // The digits are the live value, so the whole ring is the live region.
            // Polite rather than assertive: it updates five times a second, and an
            // assertive region doing that would talk over everything else on the
            // page.
            role="timer"
            aria-live="polite"
            aria-atomic="true"
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
                    // The font-size is set here rather than in CSS so the digits
                    // scale with the ring, which means the ring can be resized for
                    // a phone without a matching media query on the type.
                    style={{ fontSize: `${size * 0.2}px` }}
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