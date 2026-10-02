import { useEffect, useState } from 'react';

/**
 * Track a CSS media query.
 *
 * Subscribes rather than polling, and cleans up on unmount. The initial value is
 * read synchronously from `matchMedia` so the first render is already correct --
 * reading it in an effect would mean one paint with the wrong layout, which is
 * exactly the reflow this hook exists to avoid.
 *
 * Safari only gained `addEventListener` on MediaQueryList in 14, so the legacy
 * `addListener` path is kept. Below that the query still resolves correctly, it
 * just stops updating on viewport changes.
 */
export const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = useState(() =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia(query).matches
            : false,
    );

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;

        const list = window.matchMedia(query);
        const onChange = (event: MediaQueryListEvent | MediaQueryList) => {
            setMatches(event.matches);
        };

        // Re-read on subscribe: the viewport can change between the initial
        // render and this effect running, which is a real gap on a device
        // rotation landing during first paint.
        onChange(list);

        if (typeof list.addEventListener === 'function') {
            list.addEventListener('change', onChange);
            return () => list.removeEventListener('change', onChange);
        }
        list.addListener(onChange);
        return () => list.removeListener(onChange);
    }, [query]);

    return matches;
};

/** The single breakpoint the app lays out at. Matches the CSS in index.css. */
export const MOBILE_QUERY = '(max-width: 768px)';

/** True on phone-width viewports. */
export const useIsMobile = (): boolean => useMediaQuery(MOBILE_QUERY);