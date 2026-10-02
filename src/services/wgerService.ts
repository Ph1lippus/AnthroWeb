// The wger exercise database (https://wger.de/api/v2/).
//
// wger is the largest free, openly licensed exercise library there is: ~900
// exercises with muscle groups, equipment and categories, all CC-BY-SA.
//
// Two integration points, deliberately separate:
//
//   fetchWgerExercises()  one call for the whole catalogue, used once to sync
//                         the user's `exercises` table. 900+ rows is a single
//                         request, not a paged crawl.
//   searchExercises()     name lookup for the editor's combobox. Reads the
//                         user's own library first -- it is already local and
//                         already filtered to what they use -- and falls back
//                         to wger when the library has not been synced yet, so
//                         the picker still works on a first-ever visit.
//
// The endpoint that returns names is /exerciseinfo/, not /exercise/. The latter
// now returns ids only, with the name tucked away in a `translations` array;
// reading `result.name` from it yields undefined for every row, which the old
// code silently filtered away, leaving the autocomplete permanently empty.

import type { ActivityType } from '../utils/workoutSets';

const WGER_API = 'https://wger.de/api/v2';
const ENGLISH = 2;

export interface WgerExercise {
    wger_id: number;
    name: string;
    category?: string;
    equipment?: string;
    muscles?: string[];
    aliases?: string[];
}

// Fetch with a timeout, so a hanging request cannot wedge the editor. wger is
// a free community server and it does occasionally stall.
const getJSON = async <T>(url: string, signal: AbortSignal): Promise<T | null> => {
    try {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal,
        });
        if (!response.ok) return null;
        return (await response.json()) as T;
    } catch {
        return null;
    }
};

interface WgerTranslation {
    name?: string;
    language?: number;
    aliases?: string[];
}

interface WgerInfo {
    id: number;
    category?: { name?: string };
    equipment?: Array<{ name?: string }>;
    muscles?: Array<{ name_en?: string; name?: string }>;
    translations?: WgerTranslation[];
}

/** The English name, plus any aliases, for one exercise. */
const englishNames = (info: WgerInfo): { name: string; aliases: string[] } => {
    const translation = info.translations?.find(t => t.language === ENGLISH)
        ?? info.translations?.find(t => t.language === undefined);
    const name = translation?.name?.trim();
    if (!name) return { name: '', aliases: [] };
    const aliases = (translation?.aliases ?? [])
        .map(alias => (typeof alias === 'string' ? alias : String(alias)).trim())
        .filter(Boolean);
    return { name, aliases };
};

/**
 * The whole catalogue in one request.
 *
 * wger paginates at whatever `limit` you ask for up to the full count, so this
 * asks for a thousand and takes everything in a single round-trip rather than
 * 90 sequential page fetches.
 */
export const fetchWgerExercises = async (signal?: AbortSignal): Promise<WgerExercise[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const external = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;

    try {
        const data = await getJSON<{ results?: WgerInfo[] }>(
            `${WGER_API}/exerciseinfo/?language=${ENGLISH}&limit=1000`,
            external,
        );
        if (!data?.results) return [];

        const exercises: WgerExercise[] = [];
        const seen = new Set<string>();

        for (const info of data.results) {
            const { name, aliases } = englishNames(info);
            if (!name) continue;
            const key = name.toLowerCase();
            // wger legitimately carries near-duplicate entries; collapsing on
            // the lowercase name keeps "Bench Press" from appearing twice in a
            // picker because wger has both a bar and a dumbbell variant.
            if (seen.has(key)) continue;
            seen.add(key);

            exercises.push({
                wger_id: info.id,
                name,
                category: info.category?.name ?? undefined,
                equipment: info.equipment?.[0]?.name ?? undefined,
                muscles: info.muscles?.map(m => m.name_en ?? m.name).filter((name): name is string => !!name),
                aliases,
            });
        }
        return exercises;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Prefix-match over an already-fetched list.
 *
 * Exact and prefix matches first, then substring, because typing "bench"
 * should rank "Bench Press" above "Incline Bench Press".
 */
export const rankMatches = (
    exercises: Array<{ name: string; aliases?: string[] | null }>,
    query: string,
    limit = 10,
): Array<{ name: string; aliases?: string[] | null }> => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const scored: Array<{ item: { name: string; aliases?: string[] | null }; score: number }> = [];

    for (const item of exercises) {
        const name = item.name.toLowerCase();
        let score = -1;
        if (name === needle) score = 0;
        else if (name.startsWith(needle)) score = 1;
        else if (item.aliases?.some(alias => alias.toLowerCase().startsWith(needle))) score = 1;
        else if (name.includes(needle)) score = 2;
        else if (item.aliases?.some(alias => alias.toLowerCase().includes(needle))) score = 3;
        if (score >= 0) scored.push({ item, score });
    }

    return scored
        .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
        .slice(0, limit)
        .map(entry => entry.item);
};

/** Categories present in a library, for grouping a picker. */
export const categoriesOf = (exercises: Array<{ category?: string | null }>): string[] =>
    [...new Set(exercises.map(row => row.category).filter(Boolean))] as string[];

/**
 * Which of wger's muscle lists an activity belongs to.
 *
 * wger has no cardio category -- running and swimming are not in its 900
 * strength entries -- so cardio is recognised by name rather than by metadata.
 * Everything unrecognised stays 'strength', which is the safe default: the
 * editor shows sets/reps/weight and the user can still change it.
 */
const CARDIO_PATTERN = /\b(run|running|swim|swimming|cycle|cycling|bike|biking|row|rowing|walk|walking|hike|hiking|elliptical|ski|skate|skating|jump|rope|climb|paddle|kayak|stairs|stair|jump rope|burpee)\b/i;
const MOBILITY_PATTERN = /\b(stretch|stretching|mobility|foam roll|foam roll|warm ?up|cool ?down|yoga|flexib)\b/i;

export const inferActivityType = (name: string): ActivityType => {
    if (CARDIO_PATTERN.test(name)) return 'cardio';
    if (MOBILITY_PATTERN.test(name)) return 'mobility';
    return 'strength';
};