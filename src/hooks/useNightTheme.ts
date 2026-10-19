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

export type ThemeOverride = 'auto' | 'day' | 'night';

const STORAGE_KEY = 'nightThemeOverride';
const EXPIRY_KEY = 'nightThemeOverrideExpiry';

export const isNightHour = (hour: number): boolean =>
    hour >= NIGHT_START || hour < NIGHT_END;

/** The next 09:00/18:00 boundary after `now`, at which an override expires. */
export const nextThemeBoundary = (now: Date = new Date()): Date => {
    const candidates = [NIGHT_END, NIGHT_START]
        .map(hour => {
            const t = new Date(now);
            t.setHours(hour, 0, 0, 0);
            return t;
        })
        .filter(t => t.getTime() > now.getTime())
        .sort((a, b) => a.getTime() - b.getTime());
    if (candidates.length) return candidates[0];
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(NIGHT_END, 0, 0, 0);
    return t;
};

export const getNightThemeOverride = (): ThemeOverride => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw !== 'day' && raw !== 'night') return 'auto';
        const expiry = Number(window.localStorage.getItem(EXPIRY_KEY));
        if (!expiry || Date.now() >= expiry) {
            window.localStorage.removeItem(STORAGE_KEY);
            window.localStorage.removeItem(EXPIRY_KEY);
            return 'auto';
        }
        return raw;
    } catch {
        return 'auto';
    }
};

export const setNightThemeOverride = (mode: ThemeOverride): void => {
    try {
        if (mode === 'auto') {
            window.localStorage.removeItem(STORAGE_KEY);
            window.localStorage.removeItem(EXPIRY_KEY);
        } else {
            window.localStorage.setItem(STORAGE_KEY, mode);
            window.localStorage.setItem(EXPIRY_KEY, String(nextThemeBoundary().getTime()));
        }
    } catch {
        // Storage may be unavailable; the in-memory state still updates.
    }
    window.dispatchEvent(new CustomEvent('nightThemeOverrideChange'));
};

const computeIsNight = (override: ThemeOverride = getNightThemeOverride()): boolean => {
    if (override === 'day') return false;
    if (override === 'night') return true;
    return isNightHour(new Date().getHours());
};

export const useNightTheme = (): boolean => {
    const [override, setOverride] = useState<ThemeOverride>(() => getNightThemeOverride());

    useEffect(() => {
        const sync = () => setOverride(getNightThemeOverride());
        window.addEventListener('nightThemeOverrideChange', sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener('nightThemeOverrideChange', sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    useEffect(() => {
        const apply = (night: boolean) => {
            document.documentElement.classList.toggle('night', night);
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) {
                meta.setAttribute('content', night ? '#1a0f12' : '#000000');
            }
        };

        const next = computeIsNight(override);
        apply(next);

        const tick = () => {
            const nextOverride = getNightThemeOverride();
            setOverride(nextOverride);
            apply(computeIsNight(nextOverride));
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
    }, [override]);

    return computeIsNight(override);
};
