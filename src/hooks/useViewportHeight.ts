import { useEffect, useState } from 'react';

/**
 * Height of the visible viewport, kept current.
 *
 * `visualViewport` where it exists, because it reports the area actually visible
 * once the on-screen keyboard and the mobile URL bar are taken out of it --
 * `innerHeight` keeps reporting the full layout viewport, which on a phone makes
 * a dialog taller than the space there is for it. This is what lets the enlarged
 * chart re-fit when the device is rotated or the keyboard opens, rather than
 * staying at whatever height it happened to be when it was opened.
 */
export const useViewportHeight = (): number => {
    const read = () =>
        typeof window === 'undefined'
            ? 0
            : (window.visualViewport?.height ?? window.innerHeight);

    const [height, setHeight] = useState(read);

    useEffect(() => {
        const onResize = () => setHeight(read());
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        // visualViewport fires its own pair of events for pinch-zoom and for the
        // keyboard, neither of which is a window resize.
        const viewport = window.visualViewport;
        viewport?.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
            viewport?.removeEventListener('resize', onResize);
        };
    }, []);

    return height;
};