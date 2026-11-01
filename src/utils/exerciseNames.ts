export const titleCaseExerciseName = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/\b([a-z])/g, letter => letter.toUpperCase());

export const exerciseNameKey = (value: string): string =>
    titleCaseExerciseName(value).replace(/[^a-z0-9]+/gi, '');

export const rankExerciseMatches = <T extends { name: string; aliases?: string[] | null }>(
    exercises: T[],
    query: string,
    limit = 10,
): T[] => {
    const needle = exerciseNameKey(query);
    if (!needle) return [];

    return exercises
        .map(item => {
            const name = exerciseNameKey(item.name);
            const aliases = (item.aliases ?? []).map(exerciseNameKey);
            const score = name === needle
                ? 0
                : name.startsWith(needle) || aliases.some(alias => alias.startsWith(needle))
                  ? 1
                  : name.includes(needle)
                    ? 2
                    : 99;
            return { item, score };
        })
        .filter(row => row.score < 99)
        .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
        .slice(0, limit)
        .map(row => row.item);
};
