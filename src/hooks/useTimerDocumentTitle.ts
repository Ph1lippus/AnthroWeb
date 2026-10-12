import { useEffect } from 'react';
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
 */
export function useTimerDocumentTitle(): void {
    const { running, mode, remaining, elapsed, phase } = useTimer();

    useEffect(() => {
        if (!running) return;
        const previous = document.title;

        const label = mode === 'countdown'
            ? formatClock(remaining)
            : mode === 'stopwatch'
                ? formatClock(elapsed)
                // The phase letter rather than its name, for the same reason the
                // nav badge uses one: a tab title is about forty pixels wide.
                : formatClock(phase?.remainingMs ?? 0);

        document.title = `${label} · Timer`;
        return () => {
            document.title = previous;
        };
    }, [running, mode, remaining, elapsed, phase]);
}