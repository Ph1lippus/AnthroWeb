import React from 'react';
import { useTimer } from '../../hooks/useTimerEngine';

/**
 * The running timer's remaining time, for the nav rail and the mobile bar.
 *
 * Returns null when nothing is running, and the caller renders it absolutely
 * inside the nav item's existing box -- so a timer starting or stopping shifts
 * nothing in either bar. That is the whole reason it is a separate component
 * rather than markup inside SidebarNav: both bars have their own item
 * structure, and duplicating a `<span>` in each would be two places for the
 * formatting to drift.
 *
 * Kept deliberately terse. It sits in a 60px-wide icon rail, so anything longer
 * would have to be truncated into something unreadable -- which is why the
 * interval mode shows a single letter for the phase rather than its name.
 */
const TimerBadge: React.FC = () => {
    const { mode, running, remaining, elapsed, phase } = useTimer();
    if (!running) return null;

    const pad = (n: number) => String(n).padStart(2, '0');
    const asClock = (ms: number) => {
        // Ceiling, not rounding. A badge showing "0:00" while a minute of
        // countdown is still left reads as "finished", and every judgement of
        // "how long have I got" is wrong by up to a second.
        const total = Math.ceil(ms / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    };

    if (mode === 'stopwatch') return <span className="timer-nav-badge">{asClock(elapsed)}</span>;

    if (mode === 'interval') {
        // W/R/L rather than "focus": three letters fit the rail, and which letter
        // means what is already written on the page itself.
        const letter = !phase ? 'W' : phase.kind === 'work' ? 'W' : phase.kind === 'long' ? 'L' : 'R';
        const seconds = phase ? Math.ceil(phase.remainingMs / 1000) : 0;
        return <span className="timer-nav-badge">{letter}{seconds}</span>;
    }

    return <span className="timer-nav-badge">{asClock(remaining)}</span>;
};

export default TimerBadge;