import type { Note } from '../services/noteService';

export interface NoteTreeRow {
    note: Note;
    /** 0 for a top-level page, 1 for its children, and so on. Drives indent. */
    depth: number;
    /**
     * How many pages hang directly off this one.
     *
     * Drives the twisty: a row with none of them is a leaf, and a leaf's twisty
     * is a target the size of a thumb that does nothing when pressed, so the
     * twisty is only drawn for a row this is greater than zero on.
     */
    childCount: number;
}

/**
 * A page's position as a number.
 *
 * `notes_position` is a `numeric`, because a drag stores the midpoint of two
 * positions and an integer column rounds a half onto one of its neighbours --
 * see migration 0012. Postgres has no single numeric type that is always a JS
 * number: drivers and PostgREST are free to hand a `numeric` back as a string,
 * and at least one of them does.
 *
 * Which is not cosmetic here. The midpoint is computed as `(low + high) / 2`, and
 * on two strings that is `"0.51.5" / 2` -- NaN. Every drop in the rail would then
 * write null, the sort would tie, and the page would land somewhere arbitrary
 * while the drag indicator had shown the move as accepted. Coerced once, here,
 * so no caller has to remember.
 */
export const positionOf = (note: Note): number => {
    const raw = note.notes_position;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    const parsed = Number(raw ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

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

    // Pinned first at every level, then the order the user arranged, then newest
    // page. The position tie-break is what carries rows written before
    // `notes_position` existed: they all sit at its default, and falling through
    // to the date keeps them in the order the list has always shown them.
    const compare = (aId: string, bId: string) => {
        const a = rows.get(aId)!.note;
        const b = rows.get(bId)!.note;
        if (a.is_pinned !== b.is_pinned) return Number(b.is_pinned) - Number(a.is_pinned);
        const byPosition = positionOf(a) - positionOf(b);
        if (byPosition !== 0) return byPosition;
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
            out.push({
                note: rows.get(id)!.note,
                depth,
                childCount: rows.get(id)!.children.length,
            });
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
        out.push({ note: rows.get(id)!.note, depth: 0, childCount: 0 });
    }

    return out;
};

/**
 * Whether a row is drawn folded.
 *
 * Branches start folded, so what the caller holds is the set of branches that
 * were *opened*. Storing the folded ones instead cannot express the default: a
 * branch nobody had touched would be in neither list and so would have no state,
 * and would come back open.
 *
 * The rail's chevron and the tree's row filtering both call this. They have to
 * agree: a branch the tree had folded behind a chevron drawn as open is a control
 * that says its children are showing while they are hidden.
 */
export const isFolded = (row: NoteTreeRow, unfolded: ReadonlySet<string>): boolean =>
    row.childCount > 0 && !unfolded.has(row.note.id ?? '');

/**
 * The rows to draw, with everything under a folded branch taken out.
 *
 * Rows arrive parent-first and contiguous, so this is one pass with a
 * depth-indexed note of which rows are folded -- every entry above a row's own
 * depth describes one of its ancestors by the time that row is reached.
 *
 * Filtering here rather than in the rail means the rail never holds a row it is
 * not drawing, and a folded branch costs one Set lookup per row rather than a
 * walk back up the tree.
 */
export const visibleRows = (
    rows: NoteTreeRow[],
    unfolded: ReadonlySet<string>,
): NoteTreeRow[] => {
    // No short-circuit for an empty set. It used to mean "nothing is folded" and
    // return everything; it now means "nothing has been opened", which is every
    // branch folded, so taking the early exit would draw the whole tree.
    const foldedAt: boolean[] = [];
    const out: NoteTreeRow[] = [];

    for (const row of rows) {
        // Truncate first: rows deeper than this one are stale, and a row's own
        // depth is about to be rewritten.
        foldedAt.length = row.depth + 1;

        let hidden = false;
        for (let depth = 0; depth < row.depth; depth++) {
            if (foldedAt[depth]) {
                hidden = true;
                break;
            }
        }
        if (hidden) continue;

        foldedAt[row.depth] = isFolded(row, unfolded);
        out.push(row);
    }

    return out;
};

/**
 * Every id in the subtree rooted at `rootId`, `rootId` included.
 *
 * A drag has to be able to ask whether the row it is hovering is inside the
 * branch being dragged -- dropping a page into its own descendant would detach
 * the whole branch from the list, and every page between them would end up
 * parented to a page that is itself parented to them.
 *
 * Returns an empty set for an unknown id, which reads as "nothing is in the way"
 * rather than as a reason to block the drop.
 */
export const subtreeIds = (rows: NoteTreeRow[], rootId: string): Set<string> => {
    const out = new Set<string>();
    const start = rows.findIndex(row => row.note.id === rootId);
    if (start === -1) return out;

    const base = rows[start].depth;
    for (let i = start; i < rows.length; i++) {
        if (i > start && rows[i].depth <= base) break;
        out.add(rows[i].note.id ?? '');
    }
    return out;
};

/** Where a row sits in the flattened order, or -1 if it is not in it. */
export const rowIndex = (rows: NoteTreeRow[], id: string): number =>
    rows.findIndex(row => row.note.id === id);

/**
 * The row before this one at the same depth under the same parent.
 *
 * Null when the row is the first of its branch. Rows between the two are this
 * row's own descendants, which is why the scan skips past them rather than
 * stopping at the nearest row above.
 */
export const previousSibling = (rows: NoteTreeRow[], index: number): NoteTreeRow | null => {
    if (index <= 0 || index >= rows.length) return null;
    const depth = rows[index].depth;
    for (let i = index - 1; i >= 0; i--) {
        if (rows[i].depth === depth) return rows[i];
        // Shallower than the row means its parent's run has started, so this is
        // the first child and there is no previous sibling.
        if (rows[i].depth < depth) return null;
    }
    return null;
};

/** The row after this one at the same depth under the same parent. Null at the
 *  end of the branch. */
export const nextSibling = (rows: NoteTreeRow[], index: number): NoteTreeRow | null => {
    if (index < 0 || index >= rows.length) return null;
    const depth = rows[index].depth;
    for (let i = index + 1; i < rows.length; i++) {
        if (rows[i].depth === depth) return rows[i];
        if (rows[i].depth < depth) return null;
    }
    return null;
};

/**
 * How a drop lands on a row.
 *
 * `before` and `after` mean "beside that row, sharing its parent"; `into` means
 * "a child of that row". Three values because that is genuinely all a pointer
 * position over a row can say, and collapsing it to two would mean guessing
 * whether a drop near the top edge meant "before" or "make it a child".
 */
export type DropMode = 'before' | 'after' | 'into';

/** Where a page ends up: under this parent, at this position among its children. */
export interface Placement {
    parentId: string | null;
    position: number;
}

/** A position between two pages, or past both ends of the list. */
const between = (prev?: NoteTreeRow, next?: NoteTreeRow): number => {
    const low = prev ? positionOf(prev.note) : null;
    const high = next ? positionOf(next.note) : null;
    if (low === null && high === null) return 0;
    if (low === null) return high! - 1;
    if (high === null) return low + 1;
    return (low + high) / 2;
};

/**
 * Where `dragId` lands when dropped on `targetId`.
 *
 * A single new position rather than a renumbered list. Positions are read as
 * fractions -- the midpoint of the two it is dropped between -- so one drag is
 * one row written rather than a rewrite of every sibling, and a drag is never
 * rejected because the ordering could not be made consistent.
 *
 * The dragged page is left out of its own sibling group before the midpoint is
 * taken, which is what makes a reorder *within* one group work: without that,
 * moving a page one place down would compute a position relative to itself.
 *
 * Null means the drop cannot be resolved -- an unknown id, or a target inside
 * the dragged page's own branch, which would make a cycle.
 */
export const dropPlacement = (
    rows: NoteTreeRow[],
    dragId: string,
    targetId: string,
    mode: DropMode,
): Placement | null => {
    const index = rowIndex(rows, targetId);
    if (index === -1) return null;
    // A page cannot be moved into itself or into anything below it.
    if (subtreeIds(rows, dragId).has(targetId)) return null;

    const target = rows[index];

    if (mode === 'into') {
        // The last of the target's own children, which is the run of rows one
        // level deeper directly after it.
        let last = -1;
        for (let i = index + 1; i < rows.length && rows[i].depth > target.depth; i++) {
            if (rows[i].depth === target.depth + 1) last = i;
        }
        return {
            parentId: targetId,
            position: last === -1 ? 0 : positionOf(rows[last].note) + 1,
        };
    }

    const parentId = target.note.notes_parent_id ?? null;

    // Every row sharing the target's depth and parent, which is the group the
    // position is expressed in.
    //
    // Filtered over the whole list rather than by walking outwards from the
    // target. The two look equivalent and are not: a target's immediate
    // neighbours are often its own siblings' *children*, so an outward walk stops
    // on the first of those and finds a group of one -- which then places every
    // drop relative to the page it was dropped on instead of relative to the
    // pages around it.
    const group: NoteTreeRow[] = [];
    for (const row of rows) {
        if (row.depth !== target.depth) continue;
        if ((row.note.notes_parent_id ?? null) !== parentId) continue;
        if (row.note.id === dragId) continue;
        group.push(row);
    }

    const at = group.findIndex(row => row.note.id === targetId);
    if (at === -1) return null;

    return {
        parentId,
        position:
            mode === 'before'
                ? between(group[at - 1], group[at])
                : between(group[at], group[at + 1]),
    };
};

/** Where a page goes when it is promoted out of its parent to the top level:
 *  past every other root page. */
export const promotePlacement = (rows: NoteTreeRow[], id: string): Placement | null => {
    if (rowIndex(rows, id) === -1) return null;

    let last = -1;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].depth === 0) last = i;
    }
    return {
        parentId: null,
        position: last === -1 ? 0 : positionOf(rows[last].note) + 1,
    };
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
