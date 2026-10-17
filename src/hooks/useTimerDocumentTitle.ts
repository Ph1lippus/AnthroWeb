import { useEffect, useRef } from 'react';
import { useTimer } from './useTimerEngine';
import { formatClock } from '../utils/timerMath';

/**
 * Puts the running timer's remaining time in the tab title.
 *
 * The point is not decoration. A timer is usually running in a tab that is not
 * the tab being looked at -- that is the entire reason this page is more than a
 * box with digits in it -- and the tab strip is the one part of the browser
 * always visible. Without this, the only way to check the time is to leave
 * whatever you were doing.
 *
 * Restores the previous title rather than hard-coding the page's own. The page
 * mounts `Title` too, and the two write the same property; the engine's version
 * wins while it runs, and on cleanup it hands back to whatever was there, which
 * `Title` has already re-established by then. Writing a fixed string instead
 * would leave the title wrong for whatever page is opened next.
 *
 * Written only when the label actually changes. The engine repaints on every
 * animation frame so the clock's hundredths can resolve, and this effect re-runs
 * on each of those -- but the title carries whole seconds, so sixty-odd writes a
 * second all say the same thing. Assigning `document.title` is not free even when
 * the value is identical: it invalidates the tab strip's text and re-lays it out.
 */
export function useTimerDocumentTitle(): void {
    const { running, mode, remaining, elapsed, phase } = useTimer();

    const label = mode === 'countdown'
        ? formatClock(remaining)
        : mode === 'stopwatch'
            ? formatClock(elapsed)
            // The phase letter rather than its name, for the same reason the
            // nav badge uses one: a tab title is about forty pixels wide.
            : formatClock(phase?.remainingMs ?? 0);

    const shown = useRef<string | null>(null);
    useEffect(() => {
        if (!running) {
            shown.current = null;
            return;
        }
        const next = `${label} · Timer`;
        if (shown.current === next) return;
        shown.current = next;
        document.title = next;
    }, [running, label]);

    // Restoring is separate from the write above, because the cleanup below runs
    // on every label change -- and restoring on each of those would fight the
    // write that is about to happen.
    useEffect(() => {
        if (!running) return;
        const previous = document.title;
        return () => {
            if (shown.current !== null) document.title = previous;
        };
    }, [running]);
}