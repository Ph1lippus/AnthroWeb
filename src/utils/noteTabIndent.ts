import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';

/**
 * Tab indents a line.
 *
 * The help sheet has always advertised `Tab` as "Indent, or next table cell", and
 * two of those three were true. Lists nest and tables move between cells, because
 * `ListItem` and `tableEditing` both bind the key themselves. Plain text did not:
 * nothing claimed it, so the browser's default applied and focus left the editor.
 * Inside a code block it was worse than nothing -- `@tiptap/extension-code-block`
 * binds Tab and then throws the event away:
 *
 *     Tab: ({ editor }) => {
 *         if (!this.options.enableTabIndentation) return false;   // the default
 *
 * so it returned false and focus left. That one is fixed by a flag on the
 * extension rather than by anything here.
 *
 * --- the part that is not a feature ---
 *
 * Tab is how a keyboard user gets out of an editor, so a Tab that always indents
 * is a keyboard trap: there is no Tab key left that means "next control". So
 * Escape arms an escape and the following Tab gives focus back to the browser --
 * the pattern CodeMirror and VS Code both use, and the reason a text editor can
 * indent with Tab and still be escapable.
 *
 * The arm is deliberately short-lived. Anything that moves the caret or changes
 * the document clears it, so Escape-then-Tab has to be two keystrokes in a row:
 * dismiss a menu, then Tab out, rather than a state that quietly follows you
 * around the page.
 */

/** Spaces in one indent. Four, to match a code fence's worth of indentation. */
export const TAB_SIZE = 4;

const INDENT = ' '.repeat(TAB_SIZE);

/** Holds whether an Escape has asked the next Tab to hand focus back. */
const escapeKey = new PluginKey<boolean>('tabIndentEscape');

interface Line {
    /** Just inside the block, where its text starts. */
    from: number;
    /** End of the block's text. Outdent reads within this, never past it. */
    to: number;
}

/**
 * The lines a selection touches, as blocks to edit at.
 *
 * A collapsed selection is one line at the caret -- `nodesBetween` over an empty
 * range visits exactly the block the point is in. A real one is every block it
 * overlaps, including the ones it only partly covers, since indenting half a line
 * is still indenting that line.
 */
export const selectedLines = (state: EditorState): Line[] => {
    const { from, to } = state.selection;
    const lines: Line[] = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isTextblock) return;
        const start = pos + 1;
        // A block entirely after the selection is not touched by it.
        if (to < start) return;
        lines.push({ from: start, to: start + node.content.size });
    });
    return lines;
};

/**
 * Insert one indent at `at`.
 *
 * `tr.insertText` is the obvious call and it is the wrong one: it routes through
 * `replaceRangeWith`, which is allowed to *expand* the range it is given to cover
 * whole blocks. Indenting a selection of "ne" across a paragraph boundary then
 * replaced that text instead of indenting around it, so pressing Tab in the middle
 * of a word deleted the rest of the word.
 *
 * `replaceWith` at an empty range is an insertion and nothing else, which is what
 * was wanted.
 */
const insertIndent = (tr: Transaction, state: EditorState, at: number): void => {
    tr.replaceWith(at, at, state.schema.text(INDENT));
};

/**
 * Indent every selected line.
 *
 * Inserted back to front so that each insertion leaves the positions of the lines
 * before it untouched, rather than having to map every offset through the
 * transaction as it goes.
 */
export const indentLines = (state: EditorState): Transaction | null => {
    const lines = selectedLines(state);
    if (!lines.length) return null;
    const tr = state.tr;
    for (const line of [...lines].reverse()) insertIndent(tr, state, line.from);
    return tr;
};

/**
 * Remove up to one indent's worth of spaces from the start of every selected line.
 *
 * Counts what is actually there rather than assuming a full indent, so a line
 * indented by hand still comes back a step at a time instead of refusing to move.
 * A line with no leading spaces is left alone -- which is what makes Shift-Tab a
 * no-op on an unindented line rather than eating a space from the text.
 */
export const outdentLines = (state: EditorState): Transaction | null => {
    const lines = selectedLines(state);
    const cuts: Array<{ from: number; to: number }> = [];
    for (const line of lines) {
        const end = Math.min(line.from + TAB_SIZE, line.to);
        const text = state.doc.textBetween(line.from, end, ' ', ' ');
        const spaces = text.length - text.trimStart().length;
        if (spaces > 0) cuts.push({ from: line.from, to: line.from + spaces });
    }
    if (!cuts.length) return null;
    const tr = state.tr;
    for (const cut of [...cuts].reverse()) tr.delete(cut.from, cut.to);
    return tr;
};

/**
 * Whether Tab already means something else here, and so belongs to that.
 *
 * Checked rather than assumed from plugin order. Extension keymaps run before
 * this plugin, but `tableEditing` is itself a plugin from `@tiptap/pm/tables`,
 * and whether it is registered before or after this one is an accident of the
 * order the extensions appear in the list. Asking is the only reliable version:
 * Tab in a table cell moves cells, and in a list it nests the item, and quietly
 * turning either of those into an indent would be worse than leaving Tab alone.
 */
const isSomebodyElsesTab = (state: EditorState): boolean => {
    const { $from } = state.selection;
    if ($from.parent.type.name === 'codeBlock') return true;
    for (let depth = $from.depth; depth >= 0; depth--) {
        const name = $from.node(depth).type.name;
        if (name === 'listItem' || name === 'taskItem') return true;
        if (name === 'table' || name === 'tableRow' || name === 'tableCell' || name === 'tableHeader') {
            return true;
        }
    }
    return false;
};

export const TabIndent = Extension.create({
    name: 'tabIndent',

    addProseMirrorPlugins() {
        return [
            new Plugin<boolean>({
                key: escapeKey,
                state: {
                    init: () => false,
                    apply: (tr, armed) => {
                        const next = tr.getMeta(escapeKey);
                        if (next !== undefined) return next;
                        // Typing or moving the caret spends the escape. Otherwise
                        // dismissing a menu with Escape would leave the next Tab
                        // meaning "leave the editor" long after anyone expected it.
                        if (tr.docChanged || tr.selectionSet) return false;
                        return armed;
                    },
                },
                props: {
                    handleKeyDown: (view, event) => {
                        if (event.key === 'Escape') {
                            // Not consumed: Escape still closes whatever else is open.
                            view.dispatch(view.state.tr.setMeta(escapeKey, true));
                            return false;
                        }
                        if (event.key !== 'Tab') return false;

                        if (escapeKey.getState(view.state)) {
                            // Back to the browser, which moves focus. `false` is the
                            // whole mechanism: ProseMirror treats it as "not handled".
                            view.dispatch(view.state.tr.setMeta(escapeKey, false));
                            return false;
                        }
                        if (isSomebodyElsesTab(view.state)) return false;

                        const tr = event.shiftKey ? outdentLines(view.state) : indentLines(view.state);
                        if (!tr) return false;
                        view.dispatch(tr.scrollIntoView());
                        return true;
                    },
                },
            }),
        ];
    },
});

export default TabIndent;
