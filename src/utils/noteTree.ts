import type { Note } from '../services/noteService';

export interface NoteTreeRow {
    note: Note;
    /** 0 for a top-level page, 1 for its children, and so on. Drives indent. */
    depth: number;
}

/**
 * Flattens the page list into the order the rail draws: each parent followed
 * immediately by its children, with the depth recorded for indentation.
 *
 * Built by linking rows rather than recursing from roots, so a cycle -- which the
 * database's self-parent check prevents but a hand-edited row could still produce
 * -- cannot hang the page. Any note whose parent is missing from the list (a
 * trashed parent, or one hidden by the search) is treated as a root, so a page
 * never disappears from the sidebar because its parent went missing.
 */
export const buildNoteTree = (notes: Note[]): NoteTreeRow[] => {
    const rows = new Map<string, { note: Note; children: string[] }>();
    for (const note of notes) {
        if (note.id) rows.set(note.id, { note, children: [] });
    }

    const roots: string[] = [];
    for (const note of notes) {
        const id = note.id ?? '';
        const row = rows.get(id);
        if (!row) continue;

        const parentId = note.notes_parent_id ?? null;
        const parent = parentId && parentId !== id ? rows.get(parentId) : undefined;
        if (parent) {
            parent.children.push(id);
        } else {
            roots.push(id);
        }
    }

    // Pinned first at every level, then newest page.
    const compare = (aId: string, bId: string) => {
        const a = rows.get(aId)!.note;
        const b = rows.get(bId)!.note;
        if (a.is_pinned !== b.is_pinned) return Number(b.is_pinned) - Number(a.is_pinned);
        return (
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        );
    };

    const out: NoteTreeRow[] = [];
    // A `seen` set guards against a cycle that a link-based walk would otherwise
    // follow forever.
    const seen = new Set<string>();
    const walk = (ids: string[], depth: number) => {
        const ordered = [...ids].sort(compare);
        for (const id of ordered) {
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({ note: rows.get(id)!.note, depth });
            walk(rows.get(id)!.children, depth + 1);
        }
    };
    walk(roots, 0);

    // Anything the walk never reached sits in a cycle, because a cycle has no
    // root to enter from. Without this sweep every page in the cycle disappears
    // from the sidebar at once -- and a two-page cycle is reachable through the
    // API, since the database only refuses a page being its own parent, not a
    // longer loop. Promoting them to the top level shows them again.
    for (const id of rows.keys()) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ note: rows.get(id)!.note, depth: 0 });
    }

    return out;
};

/** The chain from a page up to its root, nearest first. Backs the breadcrumbs. */
export const noteAncestors = (notes: Note[], note: Note): Note[] => {
    const chain: Note[] = [];
    const byId = new Map(notes.map(entry => [entry.id ?? '', entry]));
    const seen = new Set<string>([note.id ?? '']);

    let current = note.notes_parent_id ?? null;
    while (current && !seen.has(current)) {
        const parent = byId.get(current);
        if (!parent) break;
        seen.add(current);
        chain.push(parent);
        current = parent.notes_parent_id ?? null;
    }
    return chain;
};

/**
 * Every distinct tag in use, sorted, for the tag filter.
 *
 * Deduped case-insensitively, keeping the spelling first seen: the pane refuses to
 * add "Exam" to a page that already has "exam", but rows written by hand or by an
 * older build can still hold both, and two chips differing only in case is a
 * filter that appears to do nothing.
 */
export const allTags = (notes: Note[]): string[] => {
    const byLower = new Map<string, string>();
    for (const note of notes) {
        for (const tag of note.notes_tags ?? []) {
            const trimmed = tag.trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            if (!byLower.has(key)) byLower.set(key, trimmed);
        }
    }
    return [...byLower.values()].sort((a, b) => a.localeCompare(b));
};
