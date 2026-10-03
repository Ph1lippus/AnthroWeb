// The wger exercise database (https://wger.de/api/v2/).
//
// wger is the largest free, openly licensed exercise library there is, all
// CC-BY-SA. It is fetched once into the user's own `exercises` table, and from
// then on the picker searches that local copy -- `rankMatches` is a synchronous
// filter over an array, so every keystroke re-ranks with no request to cancel.
//
// Which endpoint matters, and it is not the one the docs point at. `/exercise/`
// returns ids with the name buried in a `translations` array, so reading a name
// off a row yields `''`. `/exerciseinfo/` is the one that carries names, and it
// is the only one used here. Both report `count: 916` for English.
//
// Three pages at a page size of 400, about two and a half seconds.
//
// Failures throw rather than resolving to an empty list, so the picker can tell
// "broken" from "empty" and say which.

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
//
// This throws rather than returning null on failure. It used to swallow every
// error into `null`, which made a network failure, a bad status and an empty
// result indistinguishable -- and since the picker could not tell them apart
// either, a broken fetch reported itself as "the library is empty", which sent
// the diagnosis in completely the wrong direction.
const getJSON = async <T>(url: string, signal: AbortSignal): Promise<T> => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`wger returned ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
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
 * The whole catalogue, paged.
 *
 * Only `/exerciseinfo/`. `/exercise/` is the endpoint wger's docs point at and it
 * is the wrong one here: it returns ids with the name buried in a `translations`
 * array, so reading a name off a row yields nothing. This used to call it first
 * and fall back, but the fallback could never run -- `/exercise/` hands back a
 * few thousand perfectly well-formed rows, so the "did we get anything" check
 * passed on rows that then all got filtered out for having no name. The library
 * came back empty and the dropdown said it was still fetching.
 *
 * So there is one endpoint here, and it is the one that carries names.
 *
 * It paginates at 20 by default and accepts a `limit`, so this asks for a page
 * at a time and follows `next` until it runs out. Following the cursor rather
 * than guessing offsets is what makes a clamped `limit` harmless: wger decides
 * the page size, the loop still walks the whole catalogue.
 *
 * The cap keeps a community server from being hammered and bounds the insert.
 */
const PAGE_SIZE = 400;
/* Six pages is a couple of thousand rows, which covers the lifts anyone actually
   searches for. The catalogue keeps going past that, but every extra page is
   another sequential round trip before the dropdown becomes usable, and the tail
   is gymnastics and calisthenics variants nobody types. */
const MAX_PAGES = 6;

const fetchFromExerciseInfo = async (external: AbortSignal): Promise<WgerInfo[]> => {
    const collected: WgerInfo[] = [];
    let url: string | null = `${WGER_API}/exerciseinfo/?language=${ENGLISH}&limit=${PAGE_SIZE}`;

    for (let page = 0; page < MAX_PAGES && url; page++) {
        const data: { results?: WgerInfo[]; next?: string | null } | null =
            await getJSON<{ results?: WgerInfo[]; next?: string | null }>(url, external);
        const results = data?.results;
        if (!results?.length) break;
        collected.push(...results);
        url = data?.next ?? null;
    }

    return collected;
};

const toExercise = (info: WgerInfo): WgerExercise => {
    const { name, aliases } = englishNames(info);
    return {
        wger_id: info.id,
        name,
        category: info.category?.name ?? undefined,
        equipment: info.equipment?.[0]?.name ?? undefined,
        muscles: info.muscles?.map(m => m.name_en ?? m.name).filter((n): n is string => !!n),
        aliases,
    };
};

/** Collapses wger's near-duplicates so "Bench Press" is one row, not two. */
const dedupe = (infos: WgerInfo[]): WgerExercise[] => {
    const exercises: WgerExercise[] = [];
    const seen = new Set<string>();
    for (const info of infos) {
        const exercise = toExercise(info);
        if (!exercise.name) continue;
        const key = exercise.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        exercises.push(exercise);
    }
    return exercises;
};

/** Throws on anything that went wrong. An empty catalogue is not a valid answer,
 *  so it is raised as one -- a caller that catches this can say which. */
export const fetchWgerExercises = async (signal?: AbortSignal): Promise<WgerExercise[]> => {
    const controller = new AbortController();
    // Generous, because this is the one slow thing that happens on a first visit
    // and it only ever runs once. At 30s a merely slow wger was aborted into
    // returning nothing, which is indistinguishable from having no library.
    const timer = setTimeout(() => controller.abort(), 60000);
    const external = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;

    try {
        const exercises = dedupe(await fetchFromExerciseInfo(external));
        if (!exercises.length) {
            throw new Error('wger returned rows but none with an English name.');
        }
        return exercises;
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error('Timed out reaching wger.de after 60s.', { cause: error });
        }
        if (error instanceof Error) throw error;
        throw new Error(String(error), { cause: error });
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