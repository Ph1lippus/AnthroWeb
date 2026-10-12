import { useEffect, useRef } from 'react';

/**
 * Holds the screen awake while something is running.
 *
 * A timer that lets the display sleep has failed at the one job only a timer
 * has: being readable from across a room. The Screen Wake Lock API does this,
 * but it has a behaviour that makes it useless on its own.
 *
 * The lock is released by the browser whenever the page becomes hidden, and it
 * is not re-granted on its own when the page comes back. So a lock requested
 * once at the start of a run is silently gone after the first time the user
 * switches tabs -- which during a twenty-five minute focus block is most of the
 * run. The `visibilitychange` listener below is what re-acquires it, and that
 * re-acquisition only succeeds if the page has a user activation, which is why
 * the first request is deliberately made from a click.
 *
 * This is also the whole reason an exact Android alarm is out of reach for now.
 * `SCHEDULE_EXACT_ALARM` and a foreground service are what would keep a chime
 * ringing with the app closed; neither is granted to this build. So the honest
 * scope is: awake while the app is in front of you, quiet when it is not.
 */

interface WakeLockSentinelLike {
    released: boolean;
    release: () => Promise<void>;
    addEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockLike {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

function wakeLock(): WakeLockLike | null {
    if (typeof navigator === 'undefined') return null;
    const candidate = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
    return candidate ?? null;
}

/**
 * Keep the screen on for as long as `active` is true.
 *
 * Returns nothing. A caller cannot act on whether the lock was granted anyway --
 * every reason it can fail (an engine without the API, a document without a user
 * activation, a battery-saver refusal) resolves to "the screen may dim", which is
 * a graceful degradation and not an error worth surfacing.
 */
export function useWakeLock(active: boolean): void {
    const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

    useEffect(() => {
        const lock = wakeLock();
        if (!lock) return;

        let cancelled = false;

        const request = () => {
            if (cancelled) return;
            lock.request('screen')
                .then(sentinel => {
                    if (cancelled) {
                        // The effect was cleaned up while the promise was in
                        // flight. Nobody holds this lock, so it has to go back.
                        void sentinel.release().catch(() => {});
                        return;
                    }
                    sentinelRef.current = sentinel;
                })
                .catch(() => {
                    // Denied, or no user activation. Nothing to do: the timer
                    // keeps running, the screen just dims.
                });
        };

        const onVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            // Re-request only when there is genuinely nothing held. Re-requesting
            // over a live lock resolves as a no-op in most engines and throws in
            // some, and neither is worth the branching.
            if (sentinelRef.current && !sentinelRef.current.released) return;
            request();
        };

        if (active) {
            request();
            document.addEventListener('visibilitychange', onVisibility);
        }

        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisibility);
            const sentinel = sentinelRef.current;
            sentinelRef.current = null;
            if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
        };
    }, [active]);
}