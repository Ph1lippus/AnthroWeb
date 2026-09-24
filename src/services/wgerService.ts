// wger exercise database integration (https://wger.de/api/v2/).
// Public, CORS-enabled REST API. Exercise names are cached locally so the
// picker keeps working offline and to avoid hammering the API on each keystroke.

interface WgerExerciseResult {
    id: number;
    name: string;
    name_original: string;
    category?: { id: number; name: string };
    muscles?: Array<{ id: number; name: string }>;
    equipment?: Array<{ id: number; name: string }>;
}

interface WgerResponse {
    count: number;
    results: WgerExerciseResult[];
}

const WGER_ENDPOINT = 'https://wger.de/api/v2/exercise/';
const CACHE_KEY = 'wger-exercise-cache';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const MAX_CACHE = 800;

interface CacheEntry {
    name: string;
    timestamp: number;
}

const readCache = (): CacheEntry[] => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as CacheEntry[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeCache = (entries: CacheEntry[]) => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(0, MAX_CACHE)));
    } catch {
        // Storage full or unavailable (private mode) — cache is a nicety only.
    }
};

// Search the wger exercise database. Always resolves; on any failure it falls
// back to the locally cached names (or an empty list).
export const searchWgerExercises = async (query: string, limit = 8): Promise<string[]> => {
    const trimmed = query.trim();
    const cache = readCache();
    const cachedNames = cache.filter(e => e.name.toLowerCase().startsWith(trimmed.toLowerCase()))
        .map(e => e.name)
        .slice(0, limit);

    if (!trimmed) return cachedNames.slice(0, limit);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const params = new URLSearchParams({
            language: '2', // English
            limit: String(limit),
            search: trimmed,
        });
        const res = await fetch(`${WGER_ENDPOINT}?${params.toString()}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return cachedNames;

        const data = (await res.json()) as WgerResponse;
        const results = (data.results || []).map(r => r.name).filter(Boolean);

        // Merge fresh results into the personal exercise cache.
        const now = Date.now();
        const fresh = results.map(name => ({ name, timestamp: now }));
        const merged = fresh.concat(cache.filter(c => now - c.timestamp < CACHE_TTL_MS));
        writeCache(merged);

        if (results.length > 0) return results;
        return cachedNames;
    } catch {
        return cachedNames;
    }
};

export const getCachedExerciseNames = (): string[] => {
    const now = Date.now();
    const fresh = readCache().filter(e => now - e.timestamp < CACHE_TTL_MS);
    writeCache(fresh);
    return fresh.map(e => e.name).sort((a, b) => a.localeCompare(b));
};

// Merge the user's own logged exercise names into the local cache so the
// picker autocompletes from personal history too.
export const rememberLocalExercises = (names: string[]) => {
    const now = Date.now();
    const cache = readCache().filter(e => now - e.timestamp < CACHE_TTL_MS);
    const existing = new Set(cache.map(e => e.name));
    const additions = names
        .filter(name => name && !existing.has(name))
        .map(name => ({ name, timestamp: now }));
    if (additions.length > 0) writeCache(additions.concat(cache));
};