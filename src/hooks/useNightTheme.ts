import { useEffect, useState } from 'react';

/**
 * Time-based night theme.
 *
 * Between 18:00 and 09:00 local time the app switches its accent from the
 * daytime green to a softer "ember" red and layers a red gradient over the
 * existing background. The base surface stays the same graphite, so the app
 * still reads as one product -- it just warms up at night.
 *
 * Purely presentational: it only toggles a class on <html> and updates the
 * theme-color meta. All colour changes live in CSS variables keyed off that
 * class, so no component has to know about it.
 */
const NIGHT_START = 18; // 6pm
const NIGHT_END = 9;    // 9am

export const isNightHour = (hour: number): boolean =>
    hour >= NIGHT_START || hour < NIGHT_END;

const computeIsNight = (): boolean => isNightHour(new Date().getHours());

export const useNightTheme = (): boolean => {
    const [isNight, setIsNight] = useState<boolean>(() => computeIsNight());

    useEffect(() => {
        const apply = (night: boolean) => {
            document.documentElement.classList.toggle('night', night);
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) {
                meta.setAttribute('content', night ? '#1a0f12' : '#000000');
            }
        };

        apply(isNight);

        const tick = () => {
            const next = computeIsNight();
            setIsNight(prev => (prev === next ? prev : next));
        };

        const interval = window.setInterval(tick, 60_000);
        const onVisibility = () => {
            if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [isNight]);

    return isNight;
};
