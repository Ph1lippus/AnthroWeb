import { Selection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';

/**
 * Whole-block operations for the block menu: duplicate, delete, move.
 *
 * These are separate from the type conversions in `noteEditorExtensions` because
 * they are not menu entries on their own -- each one needs to know *which*
 * blocks it is being asked about, which is what `resolveBlockTarget` works out
 * once when the menu opens and then hands to every action.
 */

/** A block-aligned range of the document, plus how many blocks it covers. */
export interface BlockTarget {
    /** Position immediately before the first targeted block. */
    from: number;
    /** Position immediately after the last targeted block. */
    to: number;
    /** Top-level blocks covered. Always at least 1. */
    blocks: number;
}

/**
 * The whole-block range overlapping a position range.
 *
 * Block-aligned on both ends, because every action here is destructive in a way
 * that a text position is not: deleting from a selection that starts inside the
 * first line and ends inside the third would remove the words and leave two
 * empty paragraphs behind, rather than removing three paragraphs.
 */
const topLevelRange = (
    doc: ProseMirrorNode,
    from: number,
    to: number,
): BlockTarget | null => {
    let start = -1;
    let end = -1;
    let blocks = 0;
    doc.forEach((node, offset) => {
        const nodeStart = offset;
        const nodeEnd = offset + node.nodeSize;
        if (nodeStart < to && nodeEnd > from) {
            if (start === -1) start = nodeStart;
            end = nodeEnd;
            blocks += 1;
        }
    });
    if (start === -1) return null;
    return { from: start, to: end, blocks };
};

/**
 * What the block menu should act on.
 *
 * A selection spanning more than one block is the target in its own right,
 * because turning thirty selected lines into to-dos in one action is the whole
 * reason the old multi-block toolbar existed. That power has to survive the
 * toolbar being taken out of the document flow, so it moves here instead.
 *
 * Otherwise the target is the single block the menu was opened on: the block
 * under the handle, or the caret's own block when it was opened with "/".
 * Passing `-1` (what the drag handle reports when it has nothing under it)
 * falls back to the caret.
 */
export const resolveBlockTarget = (editor: Editor, handlePos: number): BlockTarget | null => {
    if (editor.isDestroyed) return null;

    const { state } = editor;
    const { from, to, empty } = state.selection;

    if (!empty && to > from) {
        const range = topLevelRange(state.doc, from, to);
        if (range && range.blocks > 1) return range;
    }

    const fallback = empty ? from : to;
    const pos = handlePos >= 0 ? handlePos : fallback;
    return topLevelRange(state.doc, pos, pos + 1);
};

/**
 * Dispatches a transform and puts the caret back in the editor afterwards.
 *
 * The block handle is a real button, so clicking it can take DOM focus off the
 * editor. ProseMirror keeps `state.selection` either way, but the on-screen caret
 * and the keyboard both depend on the editor holding focus, and a block that has
 * just been duplicated with no visible caret reads as a failed click.
 */
const commit = (editor: Editor, tr: Transaction): void => {
    tr.scrollIntoView();
    editor.view.dispatch(tr);
    if (!editor.view.hasFocus()) editor.view.focus();
};

/** Copies the targeted blocks, putting the caret at the top of the copy. */
export const duplicateBlocks = (editor: Editor, target: BlockTarget): void => {
    if (editor.isDestroyed) return;

    const { state } = editor;
    // Block-aligned, so the slice has no open edges and its content is a plain
    // list of whole blocks.
    const content = state.doc.slice(target.from, target.to).content;

    const tr = state.tr.insert(target.to, content);
    // +1 steps inside the copied block, where the caret can live.
    tr.setSelection(Selection.near(tr.doc.resolve(target.to + 1), -1));
    commit(editor, tr);
};

/**
 * Removes the targeted blocks and leaves the caret where they were.
 *
 * `trailingNode` is switched off in the extension set, so removing the last
 * block in the document can leave nothing at all. That needs an explicit
 * paragraph: an editor with no block to put a caret in is not a document.
 */
export const deleteBlocks = (editor: Editor, target: BlockTarget): void => {
    if (editor.isDestroyed) return;

    const { state } = editor;
    const tr = state.tr.delete(target.from, target.to);

    if (tr.doc.childCount === 0) {
        tr.insert(0, state.schema.nodes.paragraph.create());
        tr.setSelection(Selection.near(tr.doc.resolve(1), 1));
    } else {
        // Bias forwards so the caret lands after the seam, which is where the
        // text the user is looking at now is.
        tr.setSelection(Selection.near(tr.doc.resolve(Math.min(target.from, tr.doc.content.size)), 1));
    }

    commit(editor, tr);
};

/**
 * Where a child of the parent at `depth` begins.
 *
 * ProseMirror has no "start position of child N" helper, because the answer
 * depends on the sizes of every sibling before it rather than on the position
 * alone.
 */
const childStart = ($pos: ResolvedPos, depth: number, index: number): number => {
    const parent = $pos.node(depth);
    let pos = $pos.start(depth);
    for (let i = 0; i < index; i++) pos += parent.child(i).nodeSize;
    return pos;
};

/**
 * Swaps the targeted blocks with their neighbour.
 *
 * Built from an explicit delete and insert rather than a single move step:
 * prosemirror-transform has no `Transform.move`, and once the block has been
 * taken out the two directions land in places that are not mirror images.
 */
export const moveBlocks = (
    editor: Editor,
    target: BlockTarget,
    direction: -1 | 1,
): void => {
    if (editor.isDestroyed) return;

    const { state } = editor;
    const size = target.to - target.from;
    const content = state.doc.slice(target.from, target.to).content;

    const $from = state.doc.resolve(target.from);
    const depth = $from.depth;
    const index = $from.index(depth);
    const siblingIndex = index + direction;
    // Nothing to swap with at either end of the parent.
    if (siblingIndex < 0 || siblingIndex >= $from.node(depth).childCount) return;

    // Both landings are worked out against the document as it stands now, then
    // adjusted for the delete that is about to happen. Positions before the
    // removed block do not move; positions after it come back by its own size.
    const landing =
        direction === -1
            ? childStart($from, depth, siblingIndex)
            : childStart($from, depth, siblingIndex + 1) - size;

    const tr = state.tr.delete(target.from, target.to);
    tr.insert(landing, content);
    tr.setSelection(Selection.near(tr.doc.resolve(landing + 1), -1));
    commit(editor, tr);
};

/**
 * Adds, edits or removes a link across the selection.
 *
 * An empty answer removes the link rather than stranding the user inside one
 * they can no longer reach, and Escape leaves it exactly as it was.
 */
export const setLinkOnSelection = (editor: Editor): void => {
    if (editor.isDestroyed) return;

    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previous ?? 'https://');
    if (url === null) return;

    if (url.trim() === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
};
