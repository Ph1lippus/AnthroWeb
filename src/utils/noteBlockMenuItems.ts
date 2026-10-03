import type { Editor } from '@tiptap/core';
import type { SlashCommand, SlashIconName } from './noteEditorExtensions';
import type { BlockTarget } from './noteBlockActions';
import { deleteBlocks, duplicateBlocks, moveBlocks, setLinkOnSelection } from './noteBlockActions';

/**
 * The items the block menu is built from, other than the type conversions.
 *
 * They live apart from the component because every one of them is a closure over
 * the editor and the resolved target range: the menu resolves its target once
 * when it opens and hands the same range to each of these, so they cannot be
 * module-level constants the way `SLASH_COMMANDS` is. Rebuilding them per open
 * costs a dozen object literals and buys a menu whose Duplicate and Delete
 * cannot act on a stale range.
 */

/** One button in the formatting strip above the command list. */
export interface FormatAction {
    id: string;
    label: string;
    icon: SlashIconName;
    run: () => void;
    /** Drawn in its active state when the selection already carries the mark. */
    active?: boolean;
}

/**
 * The inline marks, for a selection rather than a block.
 *
 * These sit in a strip above the command list instead of in rows of their own,
 * because they read as one row of formatting buttons -- which is exactly what
 * they were in the toolbar this replaced, and the point of replacing it was
 * where that toolbar appeared, not what it looked like.
 *
 * Offered on a collapsed caret too, which is what they do in every other editor:
 * ProseMirror keeps the mark as a pending one, so the text typed next comes out
 * bold. Hiding them there was an attempt to avoid buttons that appear to do
 * nothing, and it worked backwards -- a menu opened from the block handle showed
 * no formatting at all, so the buttons looked absent rather than deferred.
 */
export const buildFormatActions = (editor: Editor): FormatAction[] => {
    // Every inline mark in the set is a plain mark, so one command covers all of
    // them. The per-mark shortcuts the old toolbar advertised (toggleCode,
    // toggleSubscript, ...) are all this same call with a different name, and
    // going through the name keeps the list to one line each.
    const mark = (id: string, label: string, icon: SlashIconName, markName: string): FormatAction => ({
        id,
        label,
        icon,
        active: editor.isActive(markName),
        run: () => editor.chain().focus().toggleMark(markName).run(),
    });

    const actions: FormatAction[] = [
        mark('bold', 'Bold (Ctrl+B)', 'Bold', 'bold'),
        mark('italic', 'Italic (Ctrl+I)', 'Italic', 'italic'),
        mark('underline', 'Underline (Ctrl+U)', 'Underline', 'underline'),
        mark('strike', 'Strikethrough (Ctrl+Shift+X)', 'Strikethrough', 'strike'),
        mark('highlight', 'Highlight', 'Highlighter', 'highlight'),
        mark('code', 'Inline code (Ctrl+E)', 'Code', 'code'),
        mark('subscript', 'Subscript', 'Subscript', 'subscript'),
        mark('superscript', 'Superscript', 'Superscript', 'superscript'),
    ];

    actions.push({
        id: 'link',
        label: editor.isActive('link') ? 'Edit link' : 'Link',
        icon: 'Link',
        active: editor.isActive('link'),
        run: () => setLinkOnSelection(editor),
    });
    // Only drawn while the selection is already a link, so the second button is
    // the one that undoes what the first did.
    if (editor.isActive('link')) {
        actions.push({
            id: 'unlink',
            label: 'Remove link',
            icon: 'LinkOff',
            run: () => editor.chain().focus().extendMarkRange('link').unsetLink().run(),
        });
    }

    return actions;
};

/** Duplicate, move and delete, all bound to the range the menu was opened on. */
export const buildActionCommands = (editor: Editor, target: BlockTarget): SlashCommand[] => {
    const plural = target.blocks > 1;
    return [
        {
            id: 'duplicate',
            title: 'Duplicate',
            hint: plural ? `Copy ${target.blocks} blocks` : 'Copy this block below',
            icon: 'Copy',
            group: 'Actions',
            keywords: ['duplicate', 'copy', 'clone', 'repeat'],
            run: () => duplicateBlocks(editor, target),
        },
        {
            id: 'move-up',
            title: 'Move up',
            hint: 'Swap with the block above',
            icon: 'ArrowUp',
            group: 'Actions',
            keywords: ['move', 'up', 'raise', 'earlier'],
            run: () => moveBlocks(editor, target, -1),
        },
        {
            id: 'move-down',
            title: 'Move down',
            hint: 'Swap with the block below',
            icon: 'ArrowDown',
            group: 'Actions',
            keywords: ['move', 'down', 'lower', 'later'],
            run: () => moveBlocks(editor, target, 1),
        },
        {
            id: 'delete',
            title: 'Delete',
            hint: plural ? `Remove ${target.blocks} blocks` : 'Remove this block',
            icon: 'Trash',
            group: 'Actions',
            keywords: ['delete', 'remove', 'erase', 'bin'],
            run: () => deleteBlocks(editor, target),
        },
    ];
};

/**
 * Row and column controls, only while the caret is inside a table.
 *
 * These used to live in a toolbar pinned above the document. The caret only ever
 * being in one table at a time makes them a property of that block rather than of
 * the page, so they belong beside the other block actions.
 */
export const buildTableCommands = (editor: Editor): SlashCommand[] => [
    {
        id: 'row-after',
        title: 'Row below',
        hint: 'Add a row under this one',
        icon: 'Rows',
        group: 'Table',
        keywords: ['row', 'table', 'add', 'insert'],
        run: () => editor.chain().focus().addRowAfter().run(),
    },
    {
        id: 'column-after',
        title: 'Column right',
        hint: 'Add a column after this one',
        icon: 'Columns',
        group: 'Table',
        keywords: ['column', 'table', 'add', 'insert'],
        run: () => editor.chain().focus().addColumnAfter().run(),
    },
    {
        id: 'header-row',
        title: 'Header row',
        hint: 'Turn this row into headings',
        icon: 'Table',
        group: 'Table',
        keywords: ['header', 'heading', 'table', 'th'],
        isActive: () => editor.isActive('tableHeader'),
        run: () => editor.chain().focus().toggleHeaderRow().run(),
    },
    {
        id: 'delete-row',
        title: 'Delete row',
        hint: 'Remove this row',
        icon: 'Trash',
        group: 'Table',
        keywords: ['delete', 'row', 'table', 'remove'],
        run: () => editor.chain().focus().deleteRow().run(),
    },
    {
        id: 'delete-column',
        title: 'Delete column',
        hint: 'Remove this column',
        icon: 'Trash',
        group: 'Table',
        keywords: ['delete', 'column', 'table', 'remove'],
        run: () => editor.chain().focus().deleteColumn().run(),
    },
];
