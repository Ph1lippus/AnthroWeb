import { Selection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';
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
    /** Sibling blocks covered, at the level the target was resolved in. */
    blocks: number;
}

/** Where a container's children begin, and the container itself. */
interface Container {
    node: ProseMirrorNode;
    /** Position of this container's first child. */
    start: number;
}

/**
 * The block container a position's block lives in.
 *
 * The document is one. A toggle's body is the other, and it is here because the
 * answer used to be the document whatever the position was -- so a menu opened on
 * a line *inside* a toggle aimed at the whole toggle. Delete then took the label
 * and every other line with it, which is nothing like what the reader pointed at,
 * and the caret was left on the block above.
 *
 * A toggle's *label* resolves to the document, so the toggle as a whole is what
 * the menu offers when the caret is on the label. Only the body descends, and only
 * one level: a toggle inside a toggle finds its own body on the first pass.
 *
 * Lists are left alone. A list item is not a block the menu acts on here, so the
 * list stays the unit, exactly as it was.
 */
const containerAt = (doc: ProseMirrorNode, pos: number): Container => {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type.name !== 'details') continue;
        // What decides it is the half the position is in, not how deep it is. A
        // position at the very start of the body's first block resolves *into*
        // the body rather than into that block -- ProseMirror has no preference
        // about a boundary between two nodes, and takes the shallower one -- so
        // depth alone reads the body's first line as the label and hands back
        // the whole toggle for it.
        const bodyDepth = depth + 1;
        if ($pos.node(bodyDepth).type.name !== 'detailsContent') break;
        return { node: $pos.node(bodyDepth), start: $pos.before(bodyDepth) + 1 };
    }
    return { node: doc, start: 0 };
};

/**
 * The whole-block range overlapping a position range, inside `pos`'s container.
 *
 * Block-aligned on both ends, because every action here is destructive in a way
 * that a text position is not: deleting from a selection that starts inside the
 * first line and ends inside the third would remove the words and leave two
 * empty paragraphs behind, rather than removing three paragraphs.
 *
 * Clamped to the container, so a range is never reported as covering blocks that
 * belong to a different level than the one it starts in.
 */
const rangeInContainer = (
    doc: ProseMirrorNode,
    pos: number,
    from: number,
    to: number,
): BlockTarget | null => {
    const container = containerAt(doc, pos);
    const limit = container.start + container.node.content.size;
    const lo = Math.max(from, container.start);
    const hi = Math.min(to, limit);

    let start = -1;
    let end = -1;
    let blocks = 0;
    container.node.forEach((node, offset) => {
        const nodeStart = container.start + offset;
        const nodeEnd = nodeStart + node.nodeSize;
        if (nodeStart < hi && nodeEnd > lo) {
            if (start === -1) start = nodeStart;
            end = nodeEnd;
            blocks += 1;
        }
    });
    if (start === -1) return null;
    return { from: start, to: end, blocks };
};

/**
 * Where the caret should land once a range has been removed.
 *
 * Forward when there is something after the deletion to go into, backward when
 * there is not. The backward case is not cosmetic: deleting the last line inside
 * a toggle leaves the caret at the end of the body, where a forward search steps
 * straight out of the toggle and leaves it looking like the toggle was the thing
 * that got deleted.
 */
const caretAfterDelete = (doc: ProseMirrorNode, from: number): Selection => {
    const at = Math.min(from, doc.content.size);
    const $at = doc.resolve(at);
    return Selection.near($at, at === $at.end() ? -1 : 1);
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
 *
 * Inside a toggle the level is the body, not the document, so the menu offers the
 * line rather than the whole toggle. A grip on a toggle is still the toggle's grip
 * -- it is drawn beside the toggle, one per toggle, whatever line the pointer is
 * over -- so the caret breaks the tie and says which line inside it was meant.
 */
export const resolveBlockTarget = (editor: Editor, handlePos: number): BlockTarget | null => {
    if (editor.isDestroyed) return null;

    const { state } = editor;
    const { from, to, empty } = state.selection;

    if (!empty && to > from) {
        const range = rangeInContainer(state.doc, from, from, to);
        if (range && range.blocks > 1) return range;
    }

    const fallback = empty ? from : to;
    const pos = handlePos >= 0 && !caretNarrowsHandle(state.doc, handlePos, from) ? handlePos : fallback;
    return rangeInContainer(state.doc, pos, pos, pos + 1);
};

/**
 * Whether the caret picks the line rather than the whole toggle the grip is on.
 *
 * The grip reports the top-level block, so on a toggle it reports the toggle. But
 * the grip is also the only affordance that targets a block, and clicking it on a
 * line inside a toggle and then pressing Delete was removing the label and every
 * other line with it -- the caret was somewhere else entirely, and where it landed
 * read as the deletion having done something else. When the caret is inside the
 * very toggle the grip is on, it is the finer of the two answers and is the one
 * meant.
 */
const caretNarrowsHandle = (doc: ProseMirrorNode, handlePos: number, caret: number): boolean => {
    const node = doc.nodeAt(handlePos);
    if (!node || node.type.name !== 'details') return false;
    const end = handlePos + node.nodeSize;
    return caret > handlePos && caret < end;
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

/**
 * Runs something against the target range rather than the reader's own selection,
 * then puts the selection back where it was.
 *
 * The block menu resolves one target range when it opens and every action works on
 * it. The mark commands are the awkward ones: `toggleMark`, `unsetLink` and
 * `extendMarkRange` all read `state.selection`, which is the caret's position and
 * has nothing to do with the block whose grip was clicked. Selecting the target for
 * the duration of the command is the smallest way to make them agree with every
 * other action in the same menu.
 *
 * Without it, marking from the handle put a *pending* mark on the caret's own block
 * -- so the line under the pointer did not change and the button looked broken
 * rather than mis-aimed.
 *
 * The selection is restored afterwards because leaving a whole block selected is
 * not what the reader asked for; they pointed at one line. Toggling a mark does not
 * change the document's length, so the remembered positions are still valid.
 */
export const overTarget = (editor: Editor, target: BlockTarget, run: () => void): void => {
    const previous = { from: editor.state.selection.from, to: editor.state.selection.to };
    editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).run();
    try {
        run();
    } finally {
        editor.chain().setTextSelection(previous).run();
    }
};

/**
 * Whether a mark covers the target range.
 *
 * `editor.isActive` answers the same question about the selection, so it would light
 * a button up because of whichever block the caret happens to be sitting in -- which
 * is the one underneath the open menu, and never the one the menu is about.
 */
export const isMarkedOver = (editor: Editor, target: BlockTarget, markName: string): boolean => {
    const type = editor.schema.marks[markName];
    if (!type) return false;
    return editor.state.doc.rangeHasMark(target.from, target.to, type);
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
 *
 * A toggle's body is `block+`, so it cannot be left empty either. Deleting the
 * last line inside one therefore takes the toggle with it rather than trying to
 * leave a body with nothing in it, which is what the reader meant by "delete
 * this line" anyway once the line was the only one there.
 */
export const deleteBlocks = (editor: Editor, target: BlockTarget): void => {
    if (editor.isDestroyed) return;

    const { state } = editor;
    // Resolved on the document as it stands, since afterwards there is no body
    // left to ask about.
    const doomed = emptiedDetailsRange(state.doc, target) ?? target;

    const tr = state.tr.delete(doomed.from, doomed.to);

    if (tr.doc.childCount === 0) {
        tr.insert(0, state.schema.nodes.paragraph.create());
        tr.setSelection(Selection.near(tr.doc.resolve(1), 1));
    } else {
        tr.setSelection(caretAfterDelete(tr.doc, doomed.from));
    }

    commit(editor, tr);
};

/**
 * The whole toggle, when deleting `target` would leave its body empty.
 *
 * Null when the target is not the entire body -- deleting one of three lines
 * leaves two, and the toggle stays.
 */
const emptiedDetailsRange = (
    doc: ProseMirrorNode,
    target: BlockTarget,
): { from: number; to: number } | null => {
    const $from = doc.resolve(target.from);
    // `detailsContent` sits one level below the `details` node, so the toggle
    // starts one level above the body and ends at that body's end.
    if ($from.depth < 2) return null;
    if ($from.node($from.depth - 1).type.name !== 'details') return null;
    if ($from.node($from.depth).type.name !== 'detailsContent') return null;
    // Only when the body had nothing else in it. A single block is the whole
    // body; anything else leaves siblings behind.
    if ($from.node($from.depth).content.size !== target.to - target.from) return null;

    const depth = $from.depth - 1;
    const from = $from.before(depth);
    return { from, to: from + $from.node(depth).nodeSize };
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
 *
 * At either end of a toggle's body there is no sibling to swap with, and the
 * block lifts out of the toggle instead -- the same place the keyboard puts it,
 * so Move up on the first line inside a toggle and Backspace there agree. A
 * to-do list keeps its own answer to the same question and is left to it.
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

    if (siblingIndex < 0 || siblingIndex >= $from.node(depth).childCount) {
        liftOutOfDetails(editor, target, direction);
        return;
    }

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
 * Takes a block out of a toggle, above it or below, when there is no sibling
 * left to swap with inside it.
 *
 * Textblocks only. A list or a table has its own rules about leaving its
 * container, and the keyboard already leaves those to it -- Backspace at the start
 * of a list inside a body is the list's keystroke, not the toggle's -- so a menu
 * that moved one wholesale would be doing something no key does.
 *
 * False when the block should not move: not in a toggle body, at the end of one
 * with nothing of its own kind to move, or a block that keeps to itself. The
 * caller's signal to do nothing.
 */
const liftOutOfDetails = (
    editor: Editor,
    target: BlockTarget,
    direction: -1 | 1,
): boolean => {
    const { state } = editor;
    const $from = state.doc.resolve(target.from);
    if ($from.depth < 2) return false;
    if ($from.node($from.depth - 1).type.name !== 'details') return false;
    if ($from.node($from.depth).type.name !== 'detailsContent') return false;
    // The block being moved, not the body it sits in: `nodeAt` rather than the
    // resolved parent, because a position at the start of a block resolves into
    // the body.
    if (!state.doc.nodeAt(target.from)?.isTextblock) return false;

    const depth = $from.depth - 1;
    const details = $from.node(depth);
    const detailsStart = $from.before(depth);
    const bodyStart = $from.before($from.depth) + 1;
    const content = state.doc.slice(target.from, target.to).content;

    // The toggle closes around the blocks that are staying. `detailsContent` is
    // `block+`, so an emptied body needs the blank paragraph a toggle nobody
    // typed into holds anyway.
    const staying: ProseMirrorNode[] = [];
    $from.node($from.depth).forEach((child, offset) => {
        const from = bodyStart + offset;
        if (from >= target.to || from + child.nodeSize <= target.from) staying.push(child);
    });
    if (staying.length === 0) staying.push(state.schema.nodes.paragraph.create());

    const trimmed = details.copy(
        Fragment.from([details.child(0), $from.node($from.depth).copy(Fragment.from(staying))]),
    );

    // `replaceWith` takes an array of nodes, not of fragments: `Fragment.fromArray`
    // sums `nodeSize` on each entry and a Fragment has none, so nesting one in the
    // array silently produces a document with the wrong length in it.
    const moved: ProseMirrorNode[] = [];
    content.forEach(child => moved.push(child));

    const tr = state.tr.replaceWith(
        detailsStart,
        detailsStart + details.nodeSize,
        direction === -1 ? [...moved, trimmed] : [trimmed, ...moved],
    );
    // The start of the block that moved: before the toggle when it went up, past
    // the toggle's new size when it went down.
    const at = direction === -1 ? detailsStart : detailsStart + trimmed.nodeSize;
    tr.setSelection(Selection.near(tr.doc.resolve(at + 1), -1));
    commit(editor, tr);
    return true;
};

/**
 * Adds, edits or removes a link across the target range.
 *
 * An empty answer removes the link rather than stranding the user inside one
 * they can no longer reach, and Escape leaves it exactly as it was.
 *
 * Scoped to `target` for the same reason the marks are: `extendMarkRange` works
 * from the selection, so from the block handle it would have edited a link on
 * whatever the caret was sitting in rather than on the block that was pointed at.
 * The prompt is read first, while the selection is still the reader's own, so
 * cancelling it cannot leave a selection moved on the way out.
 */
export const setLinkOnSelection = (editor: Editor, target: BlockTarget): void => {
    if (editor.isDestroyed) return;

    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previous ?? 'https://');
    if (url === null) return;

    if (url.trim() === '') {
        overTarget(editor, target, () => {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
        });
        return;
    }
    overTarget(editor, target, () => {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
    });
};
