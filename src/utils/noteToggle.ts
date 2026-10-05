/**
 * The toggle block: its node, the two ways it opens, and the two keys that leave it.
 *
 * Split out of `noteEditorExtensions` so it can be exercised on its own. That file
 * reaches the block menu through a React renderer, and the suggestion plugin needs
 * the DOM -- so anything the keys got wrong was only reachable by clicking through
 * the running app. Forward Delete did nothing at all inside a label that way, for a
 * long time, because nothing could put the caret there until the label stopped being
 * `user-select: none`.
 *
 * Nothing here imports anything from `Components`, which is what makes that possible.
 */
import { Extension } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ResolvedPos } from '@tiptap/pm/model';
import Details from '@tiptap/extension-details';

/**
 * How deep the toggle containing the caret sits, or -1 when the caret is not in one.
 *
 * Read off the resolved position rather than tested with `isActive('details')`: the
 * caret can be in the label or in the body, and these helpers care which.
 */
const detailsDepthOf = ($from: ResolvedPos): number => {
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type.name === 'details') return depth;
    }
    return -1;
};

/**
 * Whether the block holding the caret is the first one in the toggle's body.
 *
 * Compared as nodes rather than by index. `ResolvedPos.index` reports the index of
 * the node at a depth, and reading it at the caret's own depth to ask "which child
 * of the body am I" came back with the first index for every paragraph in the body
 * -- so the second line looked like the first and Backspace lifted the wrong block.
 * Asking the body for its first child and testing the two nodes against each other
 * says what it means.
 */
const firstBlockIs = ($from: ResolvedPos, detailsDepth: number): boolean => {
    const body = $from.node(detailsDepth + 1);
    if (body.childCount === 0) return false;
    return body.child(0).eq($from.node($from.depth));
};

/** The same question about the other end of the body. */
const lastBlockIs = ($from: ResolvedPos, detailsDepth: number): boolean => {
    const body = $from.node(detailsDepth + 1);
    if (body.childCount === 0) return false;
    return body.child(body.childCount - 1).eq($from.node($from.depth));
};

/* ------------------------------------------------------------------ *
 * Toggles
 * ------------------------------------------------------------------ */

/**
 * Details gains one attribute: the heading level its summary should be drawn at.
 *
 * Notion has two controls here -- a toggle list and a toggle heading -- that
 * differ only in how the summary is styled. One node with a level attribute says
 * that in the schema, rather than registering three near-identical node types to
 * say it three times. A null level is a plain toggle; 1-3 renders the summary
 * like a heading of that size.
 */
export const ToggleDetails = Details.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            toggleLevel: {
                default: null,
                parseHTML: element => {
                    const raw = element.getAttribute('data-toggle-level');
                    if (!raw) return null;
                    const level = Number(raw);
                    return Number.isFinite(level) && level >= 1 && level <= 3 ? level : null;
                },
                renderHTML: attributes => {
                    const level = attributes.toggleLevel as number | null;
                    return level === null ? {} : { 'data-toggle-level': String(level) };
                },
            },
        };
    },
});

/* ------------------------------------------------------------------ *
 * Opening a toggle with its chevron
 * ------------------------------------------------------------------ */

/**
 * The caret goes into the body when the chevron opens a toggle.
 *
 * The label itself is left alone. It used to open and close the toggle on a click
 * anywhere along it, which meant it could not be selected or edited like any other
 * line and had to be styled as a control -- a pointer cursor and a hover tint --
 * to explain itself. That read as the label being a different sort of thing from
 * the text under it. The chevron is the control, so the chevron is what this
 * watches.
 *
 * Opening puts the caret in the body. Clicking the arrow is a request to go in, and
 * a caret left outside the toggle -- sometimes on another line entirely -- left the
 * reader looking at an open toggle with the cursor nowhere near the text that had
 * just been revealed. Closing leaves the selection alone, because the body is
 * hidden and a selection inside it would be a selection in a subtree that is not
 * being rendered.
 *
 * Reading the open state off the node rather than the document, and writing only a
 * selection, is what lets this return false and leave the toggle itself to the node
 * view: opening rewrites an attribute and moves no positions, so the caret can be
 * placed in the same tick whatever order the two handlers happen to run in.
 *
 * The offset arithmetic is the same one a toggle is built with below, so the two
 * agree by construction rather than by two sets of numbers happening to match.
 *
 * It is deferred to the next frame, and that is not tidiness. The chevron is a real
 * button with the extension's own click listener on it, and that listener finishes
 * by putting the selection back where it was before the click -- which is precisely
 * the caret-outside-the-toggle behaviour this exists to fix. Setting the selection
 * during the click therefore loses the race to it, deterministically. Waiting until
 * the click has finished moving the caret is the only ordering that is reliable
 * without taking the toggle over, and taking it over cannot work here: the button
 * has already toggled by the time any editor handler runs.
 */
export const ToggleChevronCaret = Extension.create({
    name: 'toggleChevronCaret',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                props: {
                    /**
                     * Positions come from ProseMirror rather than from measuring the
                     * DOM. The obvious alternative -- `posAtDOM` on the node view's
                     * wrapper -- is a guess about which element the view registered,
                     * and a node view that answered slightly differently would put the
                     * caret in the wrong place instead of failing loudly.
                     */
                    handleClickOn: (view, _pos, node, nodePos, event) => {
                        // Only the chevron. The label is not this handler's business:
                        // a click there is a click on text, and the caret goes where
                        // ProseMirror puts it like anywhere else.
                        const target = event.target;
                        if (!(target instanceof Element)) return false;
                        if (!target.closest('.note-toggle > button')) return false;

                        // The chevron is a sibling of the label rather than inside it,
                        // so which node the click reports depends on where the browser
                        // put it. Both are accepted rather than guessing one.
                        let detailsPos: number;
                        if (node.type.name === 'details') detailsPos = nodePos;
                        else if (node.type.name === 'detailsSummary') detailsPos = nodePos - 1;
                        else return false;

                        const details = view.state.doc.nodeAt(detailsPos);
                        if (!details || details.type.name !== 'details') return false;
                        // Closing, so leave the selection alone: the body is about to
                        // stop being rendered, and a selection inside it would be a
                        // selection in a subtree nobody can see.
                        if (details.attrs.open) return false;

                        const sizeAtClick = view.state.doc.content.size;
                        const editorView = view;

                        window.requestAnimationFrame(() => {
                            if (editorView.isDestroyed) return;
                            // The frame was spent, so the position it was captured at
                            // may no longer mean the same thing. Only a toggle should
                            // have happened in between, and that moves no positions --
                            // anything else and the caret is left alone.
                            if (editorView.state.doc.content.size !== sizeAtClick) return;
                            const current = editorView.state.doc.nodeAt(detailsPos);
                            if (!current || current.type.name !== 'details') return;

                            // Inside <details> (+1), past the summary (+nodeSize), inside
                            // the body (+1), and inside its first paragraph (+1).
                            const caret = detailsPos + 1 + current.child(0).nodeSize + 2;
                            editorView.dispatch(
                                editorView.state.tr.setSelection(
                                    TextSelection.near(editorView.state.doc.resolve(caret)),
                                ),
                            );
                        });

                        // False: the node view owns the toggling.
                        return false;
                    },
                },
            }),
        ];
    },
});

/* ------------------------------------------------------------------ *
 * Leaving a toggle
 * ------------------------------------------------------------------ */

/**
 * Backspace and Delete at the edges of a toggle's label.
 *
 * Backspace at the very start of a label takes the toggle off. This is what makes
 * a toggle reversible from the keyboard: the label used to be a dead end, because
 * Backspace at its start cannot merge into the block above -- a <details> cannot be
 * joined to the paragraph before it -- so the keystroke did nothing at all and the
 * only ways out were the "/" menu or the block grip.
 *
 * It is also what makes "delete all the way up" work. Unwrapping leaves a plain
 * paragraph holding the summary, with the caret back at its start, so every
 * Backspace after the first is an ordinary merge into the line above -- held down,
 * it eats the note upward one line at a time and stops at the top.
 *
 * The conditions are deliberately narrow. Offset 0 only, so Backspace one character
 * from the start still deletes that character the way it does everywhere else, and
 * an empty selection only, so Backspace over a selection still deletes the
 * selection. Everything not claimed falls through to ProseMirror's own
 * `joinBackward`, which is what performs the merges above.
 *
 * Delete is the mirror of it, and its own half used to be missing outright.
 *
 * `priority` puts this ahead of the keymaps ListItem and TaskItem register,
 * matching ExitEmptyListItem below.
 */
export const LiftToggleOnBackspace = Extension.create({
    name: 'liftToggleOnBackspace',
    priority: 200,

    addKeyboardShortcuts() {
        return {
            Backspace: () => {
                const { editor } = this;
                if (editor.isDestroyed) return false;

                const { state } = editor;
                const { selection } = state;
                if (!selection.empty) return false;

                const { $from } = selection;

                if ($from.parent.type.name === 'detailsSummary') {
                    if ($from.parentOffset !== 0) return false;
                    return editor
                        .chain()
                        .focus()
                        .command(({ tr, state: commandState, dispatch }) => {
                            if (dispatch === undefined) return true;
                            return unwrapDetails(commandState, tr);
                        })
                        .run();
                }

                // The first line of the body, which is where a toggle used to be a
                // dead end: nothing above it could be joined with, so the keystroke
                // did nothing at all. It removes the line instead, and takes the
                // toggle with it if that was the only one -- see `deleteInDetails`
                // for why lifting it out was the wrong answer.
                const depth = detailsDepthOf($from);
                if (depth === -1) return false;
                if ($from.parentOffset !== 0) return false;
                if (!firstBlockIs($from, depth)) return false;

                const range = bodyBlockRange($from);
                if (!range) return false;

                return editor
                    .chain()
                    .focus()
                    .command(({ tr, state: commandState, dispatch }) => {
                        if (dispatch === undefined) return true;
                        return deleteInDetails(commandState, tr, range.from, range.to);
                    })
                    .run();
            },

            /**
             * Forward delete, which did nothing at all inside a label.
             *
             * Backspace has always worked here and forward delete has never done
             * anything: `deleteSelection` refused every position in the summary, so
             * neither the character after the caret nor the line itself could be
             * removed, and the toggle stayed. The summary is `isolating`, and
             * whatever the selection helper does with an isolating block ends in a
             * no-op that still reports itself as handled -- so the keystroke looked
             * swallowed rather than refused.
             *
             * Both halves are therefore done here instead of being left to the
             * default: the character after the caret is deleted while there is one,
             * and at the end of the label -- where there is nothing left to delete
             * and the body cannot be joined onto it -- the toggle comes off, which
             * is the same place Backspace at the start of it lands.
             *
             * And at the far end of the body it lifts the last line out below the
             * toggle, closing the same dead end Backspace closes at the near end.
             */
            Delete: () => {
                const { editor } = this;
                if (editor.isDestroyed) return false;

                const { selection } = editor.state;
                if (!selection.empty) return false;

                const { $from } = selection;

                // The far end of the body, for the same reason Backspace handles the
                // near end: there is nothing below the last line to join with. It
                // used to lift the line out below the toggle, which moved a line
                // rather than deleting one -- the same mistake Backspace was making
                // at the other end, mirrored.
                const depth = detailsDepthOf($from);
                if (depth !== -1 && $from.depth === depth + 2) {
                    if ($from.parentOffset < $from.parent.content.size) return false;
                    if (!lastBlockIs($from, depth)) return false;
                    const range = bodyBlockRange($from);
                    if (!range) return false;
                    return editor
                        .chain()
                        .focus()
                        .command(({ tr, state: commandState, dispatch }) => {
                            if (dispatch === undefined) return true;
                            return deleteInDetails(commandState, tr, range.from, range.to);
                        })
                        .run();
                }

                if ($from.parent.type.name !== 'detailsSummary') return false;

                return editor
                    .chain()
                    .focus()
                    .command(({ tr, state: commandState, dispatch }) => {
                        if (dispatch === undefined) return true;
                        if ($from.parentOffset >= $from.parent.content.size) {
                            return unwrapDetails(commandState, tr);
                        }
                        // One code unit forward, and never past the end of the label. `childAfter`
                        // is the wrong tool here: it answers with the whole child
                        // node, and in an unstyled textblock the label is a single
                        // text node -- so its length walked the delete straight
                        // through the end of the summary and into the body.
                        const start = $from.start();
                        const limit = start + $from.parent.content.size;
                        let to = Math.min($from.pos + 1, limit);
                        // A character outside the basic plane is two code units, and
                        // taking only one of them leaves half a surrogate behind.
                        const ahead = $from.parent.textBetween(
                            $from.pos - start,
                            to - start,
                        );
                        if (/[\uDC00-\uDFFF]/.test(ahead)) to = Math.min(to + 1, limit);
                        if (to <= $from.pos) return true;
                        tr.delete($from.pos, to);
                        return true;
                    })
                    .run();
            },
        };
    },
});

/* ------------------------------------------------------------------ *
 * Leaving an empty list item
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Turning a toggle back into plain blocks
 * ------------------------------------------------------------------ */

/**
 * Turns the toggle around the caret back into plain blocks.
 *
 * The summary becomes a paragraph carrying its own text, and the body's blocks
 * are kept after it, so unwrapping never loses what was written on either side
 * of the fold. Only the wrapper goes.
 *
 * The empty paragraphs dropped from the body are not content: `detailsContent`
 * is `block+`, so a toggle nobody ever typed into still holds one, and lifting
 * it out would leave a blank line under the restored sentence on every pass.
 *
 * Writes through `tr` and reports whether there was anything to unwrap. False
 * means the caret was not inside a toggle at all, which is the caller's signal
 * to leave the keystroke alone.
 *
 * Takes the state and the transaction rather than the editor so the "/" menu's
 * unwrap and Backspace's unwrap cannot drift apart -- both go through here.
 */
export const unwrapDetails = (state: EditorState, tr: Transaction): boolean => {
    const { $from } = state.selection;
    const depth = detailsDepthOf($from);
    if (depth === -1) return false;

    const details = $from.node(depth);
    const from = $from.before(depth);
    const summary = details.child(0);
    const body = details.child(1);

    const kept: PMNode[] = [];
    body.forEach(child => {
        if (!(child.isTextblock && child.content.size === 0)) kept.push(child);
    });

    const paragraph = state.schema.nodes.paragraph.create(null, summary.content);
    tr.replaceWith(from, from + details.nodeSize, [paragraph, ...kept]);
    // Back at the start of the summary, which is where Backspace was pressed.
    tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1), -1));
    return true;
};

/**
 * Lifts the caret's block out of the toggle, leaving the toggle itself in place.
 *
 * The dead end this exists to close: the first line inside a toggle's body had no
 * way out. A `<details>` is `isolating` and its summary holds inline content while
 * the body holds blocks, so Backspace at the start of the body's first paragraph
 * had nothing it could legally join with. Deeper in the body every Backspace merged
 * into the line above, so the way in worked and the way out did not -- you could
 * merge upward until you reached the first body line, and then you were stuck, with
 * no way to remove the toggle from inside it either.
 *
 * Lifting rather than unwrapping, and so the opposite of what Backspace at the start
 * of the *label* does. Unwrapping there is right because the label is the toggle's
 * title and the sentence below it is the content; unwrapping from the body's first
 * line would throw away the toggle's structure and its other content on the strength
 * of a keystroke aimed at one line. Lifting is what `liftListItem` does for the same
 * reason: the block leaves its container and the container survives.
 *
 * `side` is `-1` to lift the first block of the body out above the toggle, and `1` for
 * the last block out below it -- the mirror, which closes the same dead end at the
 * other end of the body.
 *
 * False means there was nothing to lift, which is the caller's signal to leave the
 * keystroke alone.
 */
/**
 * Removes a block from a toggle's body, and the toggle with it if that was the last.
 *
 * The single answer to "delete this line inside a toggle", shared by the two keys
 * that can arrive at the edges of a body and by the block menu's Delete, because
 * they were three different behaviours and every one of them was wrong in a way a
 * reader would describe as the delete having done something else:
 *
 *   Backspace at the start of the body's first line lifted the line *out above*
 *     the toggle. The line and the caret went somewhere else entirely, and nothing
 *     was deleted.
 *   Delete at the end of the body's last line lifted it out *below*, the same
 *     mistake mirrored.
 *   The block menu's Delete removed the whole toggle, label and every other line.
 *
 * Lifting was chosen to avoid unwrapping, which really does throw away the rest of
 * the body -- but the menu already deleted the line alone, and a keystroke that
 * moves a line instead of removing it is not what a delete key is for. An emptied
 * body is not representable (`detailsContent` is `block+`), so removing the last
 * line removes the toggle, which is also what the reader meant by it: a toggle with
 * nothing in it is not a note.
 *
 * `from` and `to` must be block-aligned inside the body, and the caret must be in
 * that body -- both callers already know the block they mean. False means the range
 * is not inside a toggle body at all, which is the caller's signal to do nothing.
 */
export const deleteInDetails = (
    state: EditorState,
    tr: Transaction,
    from: number,
    to: number,
): boolean => {
    const $from = state.doc.resolve(from);
    if ($from.depth < 2) return false;
    if ($from.node($from.depth - 1).type.name !== 'details') return false;
    if ($from.node($from.depth).type.name !== 'detailsContent') return false;

    const detailsDepth = $from.depth - 1;
    const details = $from.node(detailsDepth);
    const body = $from.node($from.depth);
    const detailsStart = $from.before(detailsDepth);

    // The body had nothing else in it, so the toggle goes rather than being left
    // holding a blank paragraph its schema would have to invent.
    const emptied = body.content.size === to - from;
    const at = emptied ? detailsStart : from;

    if (emptied) tr.delete(detailsStart, detailsStart + details.nodeSize);
    else tr.delete(from, to);

    // The caret goes to the nearest position that is still inside the body, and only
    // steps outside it when the body has nothing left -- which, given the emptied
    // case above took the whole toggle, means it cannot happen here.
    //
    // Asking for the nearest position in the body rather than for "the one after
    // the seam" is what keeps the caret inside the toggle. `Selection.near` with a
    // forward bias walks straight past the end of a `detailsContent`, out of the
    // `details` node it belongs to and into the next block in the document, because
    // that is genuinely nearer than anything inside a body that is now empty. So the
    // forward result is taken only when it lands at the same depth or shallower --
    // that is, still within the toggle.
    const seam = Math.min(at, tr.doc.content.size);
    const $seam = tr.doc.resolve(seam);
    const forward = TextSelection.near($seam, 1);
    const inside = forward.$from.depth >= $seam.depth;
    tr.setSelection(inside ? forward : TextSelection.near($seam, -1));
    return true;
};

/**
 * The range of the block the caret is in, when the caret is in a toggle's body.
 *
 * Null when it is not -- on the label, in a nested list, at the top level -- so the
 * callers can leave the keystroke alone.
 */
const bodyBlockRange = ($from: ResolvedPos): { from: number; to: number } | null => {
    const depth = detailsDepthOf($from);
    if (depth === -1) return null;
    // Only a block that is a direct child of the body. A list inside the body is
    // the list's own business, as it is for Backspace everywhere else.
    if ($from.depth !== depth + 2) return null;
    // `before` of the block's own depth, not of the body's. The body's own depth
    // plus one only lands on the first block, so a range built from it deletes the
    // wrong line whenever the caret is on a later one.
    const start = $from.before($from.depth);
    return { from: start, to: start + $from.node($from.depth).nodeSize };
};


