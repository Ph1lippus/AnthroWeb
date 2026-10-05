import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import CharacterCount from '@tiptap/extension-character-count';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import { DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Focus } from '@tiptap/extensions/focus';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import TableOfContents from '@tiptap/extension-table-of-contents';
import type { TableOfContentData } from '@tiptap/extension-table-of-contents';
import { TableKit } from '@tiptap/extension-table';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Suggestion from '@tiptap/suggestion';
import type {
    SuggestionKeyDownProps,
    SuggestionOptions,
    SuggestionProps,
} from '@tiptap/suggestion';
import type { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import BlockMenu from '../Components/Notes/BlockMenu';
import type { BlockMenuRef } from '../Components/Notes/BlockMenu';
import Callout from './noteCallout';
import type { CalloutType } from './noteCallout';
import {
    LiftToggleOnBackspace,
    ToggleChevronCaret,
    ToggleDetails,
    unwrapDetails,
} from './noteToggle';
import { TabIndent, TAB_SIZE } from './noteTabIndent';

import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';

// One shared highlighter, built from an explicit language list rather than
// lowlight's `common` bundle. `common` is 37 grammars; the picker only ever
// offers the 17 below, so the other 20 were weight nobody could reach. An empty
// grammar for `plaintext` matters: lowlight throws on an unknown language, and a
// code block with no language set is emitted as `plaintext`.
const lowlight = createLowlight();
lowlight.register({
    bash,
    csharp,
    css,
    diff,
    go,
    java,
    javascript,
    json,
    kotlin,
    php,
    python,
    ruby,
    rust,
    sql,
    swift,
    typescript,
    xml,
});
// An empty grammar, which is what "plaintext" means: recognised as a language so
// highlighting does not throw, but matching nothing. lowlight's Language type
// requires `contains`, so it cannot be a bare {}.
lowlight.register('plaintext', () => ({ contains: [] }));
lowlight.registerAlias({ html: 'xml', text: 'plaintext', txt: 'plaintext' });

/* ------------------------------------------------------------------ *
 * Leaving an empty list item
 * ------------------------------------------------------------------ */

/**
 * Enter on an empty to-do drops out of the list instead of adding another box.
 *
 * Without this, a to-do list is a one-way door: pressing Enter on a blank
 * checkbox produces another blank checkbox, so there is no keyboard route from
 * the end of a list back to a plain paragraph. The only ways out are clicking
 * below the list or pressing Backspace, and both feel like workarounds for a
 * menu decision that should have been one keystroke.
 *
 * Two cases, because one command cannot do both. When the empty item is the only
 * one in its list, `liftListItem` strips the list and the item's own content
 * becomes the paragraph -- which is the correct result and needs no help. When
 * the list has siblings, lifting would splice every remaining item into this one
 * (that is what prosemirror-schema-list's liftOutOfList does), so the item is
 * deleted and a paragraph is opened immediately after the list instead.
 *
 * The extension's `priority` puts its keymap ahead of the one ListItem and
 * TaskItem register for Enter. Returning false for anything but a collapsed caret
 * in a blank item is what lets every other Enter fall through untouched.
 */
const ExitEmptyListItem = Extension.create({
    name: 'exitEmptyListItem',
    // Above ListItem/TaskItem, which sit at the default 100.
    priority: 200,

    addKeyboardShortcuts() {
        return {
            Enter: () => {
                const { editor } = this;
                if (editor.isDestroyed) return false;

                const { state } = editor;
                const { selection } = state;
                if (!selection.empty) return false;

                const { $from } = selection;
                // Depth of the nearest list item above the caret, and its node
                // name. Read off the resolved position rather than tested with
                // isActive, because TaskItem is a distinct node with its own name
                // and isActive cannot ask for one generically.
                let itemDepth = -1;
                let itemName = '';
                for (let depth = $from.depth; depth > 0; depth--) {
                    const name = $from.node(depth).type.name;
                    if (name === 'listItem' || name === 'taskItem') {
                        itemDepth = depth;
                        itemName = name;
                        break;
                    }
                }
                if (itemDepth === -1) return false;

                const item = $from.node(itemDepth);
                // An item holding a nested list has non-empty textContent but no
                // text of its own, and Enter there should still split normally
                // rather than swallow the whole subtree.
                if (item.textContent.trim().length > 0) return false;

                const listDepth = itemDepth - 1;
                const list = $from.node(listDepth);
                const isOnlyItem = list.childCount === 1;

                if (isOnlyItem) {
                    return editor.chain().focus().liftListItem(itemName).run();
                }

                const itemFrom = $from.before(itemDepth);
                const itemTo = $from.after(itemDepth);
                const listTo = $from.after(listDepth);

                const paragraph = state.schema.nodes.paragraph;
                // If the list's own parent has no room for a sibling paragraph
                // the insertion below would be a silent no-op, so hand back to
                // the default Enter rather than appearing to do nothing.
                const parentDepth = listDepth - 1;
                const parent = $from.node(parentDepth);
                const indexAfterList = $from.index(parentDepth) + 1;
                if (
                    !paragraph ||
                    !parent.canReplace(indexAfterList, indexAfterList, Fragment.from(paragraph.create()))
                ) {
                    return false;
                }

                const tr = state.tr.delete(itemFrom, itemTo);
                // Where the list now ends. Mapped through the delete so the
                // paragraph lands after it rather than inside the gap.
                const insertPos = tr.mapping.map(listTo, -1);
                tr.insert(insertPos, paragraph.create());
                tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
                tr.scrollIntoView();
                editor.view.dispatch(tr);
                return true;
            },
        };
    },
});

/* ------------------------------------------------------------------ *
 * Keys for menus that do not hold focus
 * ------------------------------------------------------------------ */

/** Narrowest window the block menu's two panels are worth drawing side by side. */
const SPLIT_MIN_WIDTH = 560;

/**
 * Whether the block menu has room for two panels at once.
 *
 * The menu draws its block types beside itself where it can. Below this width --
 * a phone -- there is no room, and the block types stand in for the menu instead
 * of joining it.
 *
 * Lives here rather than in the menu component because the editor positions the
 * popup and has to reach the same conclusion: a caller that measured a second
 * panel which is not on screen would clamp the first one to the wrong height.
 */
export const canSplitSubmenu = (): boolean => window.innerWidth >= SPLIT_MIN_WIDTH;

/** A menu's answer to a keystroke: true when it consumed it. */
export type BlockMenuKeyHandler = (event: KeyboardEvent) => boolean;

const blockMenuKeys = new PluginKey<BlockMenuKeyHandler | null>('noteBlockMenuKeys');

/**
 * Hands navigation keys to whichever menu is currently open.
 *
 * The menu opened from the drag handle or the header button can take DOM focus
 * for its own search box, so its keys arrive directly. The menu opened by
 * selecting text cannot: focus has to stay in the document, or the selection
 * disappears and Ctrl+B stops being bold. That menu is therefore a foreign body
 * to ProseMirror, and the only way it can see an arrow key is if the editor
 * forwards it.
 *
 * Installing through a transaction rather than a module-level variable keeps the
 * handler out of plugin state that any other transaction could reset, and makes
 * the teardown path identical to the setup path -- clearing it is just another
 * dispatch.
 */
const BlockMenuKeys = Extension.create({
    name: 'blockMenuKeys',
    // Ahead of everything else, including the arrow-key handling the table
    // extensions register: a menu that is open should see navigation first.
    priority: 300,

    addProseMirrorPlugins() {
        return [
            new Plugin<BlockMenuKeyHandler | null>({
                key: blockMenuKeys,
                state: {
                    init: () => null,
                    apply: (tr, current) => {
                        const next = tr.getMeta(blockMenuKeys);
                        // `undefined` means this transaction is not ours and the
                        // installed handler stands. An explicit `null` is how it is
                        // removed -- `?? current` would treat the two as the same
                        // and leave a dead handler swallowing arrow keys forever.
                        return next === undefined ? current : next;
                    },
                },
                props: {
                    handleKeyDown: (view, event) =>
                        blockMenuKeys.getState(view.state)?.(event) ?? false,
                },
            }),
        ];
    },
});

/** Let `handler` see keys first, or pass `null` to stop it seeing them. */
export const setBlockMenuKeyHandler = (
    editor: Editor,
    handler: BlockMenuKeyHandler | null,
): void => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(blockMenuKeys, handler));
};

/* ------------------------------------------------------------------ *
 * The "/" command catalogue
 * ------------------------------------------------------------------ */

/**
 * Every icon the menus can draw, as a name rather than a component.
 *
 * The union spans both what "/" offers and what the block handle adds -- inline
 * marks, duplicate, delete, move, and the table controls -- so both menus share
 * one type and, more usefully, one icon map: a row that renders in the slash
 * menu renders identically in the block menu, and neither needs a fallback for
 * an icon the other knows about.
 */
export type SlashIconName =
    // Block types
    | 'Type'
    | 'Heading1'
    | 'Heading2'
    | 'Heading3'
| 'Heading'
    | 'ChevronRight'
    | 'Quote'
    | 'Info'
    | 'Minus'
    | 'List'
    | 'ListOrdered'
    | 'CheckSquare'
    | 'Table'
    | 'Code'
    | 'Sigma'
    | 'Image'
    // Inline marks
    | 'Bold'
    | 'Italic'
    | 'Underline'
    | 'Strikethrough'
    | 'Highlighter'
    | 'Subscript'
    | 'Superscript'
    | 'Link'
    | 'LinkOff'
    // Whole-block actions
    | 'Copy'
    | 'Trash'
    | 'ArrowUp'
    | 'ArrowDown'
    // Table controls
    | 'Rows'
    | 'Columns';
export type SlashGroup = 'Basic' | 'Lists' | 'Insert' | 'Media' | 'Actions' | 'Table';

export interface SlashCommand {
    /** Stable across renames, so it can key the favourites list. */
    id: string;
    title: string;
    /**
     * What the command does, in a few words.
     *
     * Deliberately not drawn anywhere. Every row used to carry this under its
     * title, which made each row twice as tall and meant the list of block types
     * needed a scrollbar on an ordinary laptop -- and reading sixteen sentences to
     * find "To-do" is slower than reading sixteen titles. It stays here as the
     * catalogue's own documentation: the commands live in one table, this is the
     * only place a reader has to look to find out what any of them is for.
     */
    hint: string;
    icon: SlashIconName;
    group: SlashGroup;
    keywords: string[];
    run: (editor: Editor) => void;
    /** Marks a block that is currently switched on. */
    isActive?: (editor: Editor) => boolean;
}

/**
 * Wraps the current block in a toggle, or unwraps it when the same toggle is
 * already active. `level` of null gives a plain toggle; 1-3 styles the summary
 * as a heading, which is Notion's toggle heading.
 *
 * The block's own text becomes the toggle's summary. That is what every editor
 * does, and it is also the only version that does not look like data loss:
 * turning "my important sentence" into a toggle has to leave "my important
 * sentence" visible, and pressing the menu item again has to bring it back.
 *
 * The toggle is created open, with the caret in its body rather than after its
 * title, which is what Notion does. Converting a line is a decision to write
 * *under* that line, so leaving the caret in the title means the next keystroke
 * edits the heading instead of answering it -- and a collapsed body is a second
 * click the reader did not ask for.
 */
const runToggle =
    (level: number | null) =>
    (editor: Editor): void => {
        // Already in exactly this toggle: a second press should close it rather
        // than build a nested one.
        if (editor.isActive('details')) {
            const current = (editor.getAttributes('details').toggleLevel ?? null) as number | null;
            if (current !== level) {
                editor
                    .chain()
                    .focus()
                    .updateAttributes('details', { toggleLevel: level })
                    .run();
                return;
            }
            // Unwrapping by hand rather than with unsetDetails, which replaces the
            // toggle with the summary's text *followed by everything in the body*.
            // A toggle that was never opened still has an empty paragraph in its
            // body, so every round trip through the menu left a blank line under
            // the restored sentence. Through the shared helper, so the menu and
            // Backspace cannot drift apart.
            editor
                .chain()
                .focus()
                .command(({ tr, state, dispatch }) => {
                    if (dispatch === undefined) return true;
                    return unwrapDetails(state, tr);
                })
                .run();
            return;
        }

        // A toggle is a top-level block: <details> is not permitted inside a list
        // item, so converting from inside one has to lift the item out first or
        // the browser re-parses the result and shows an empty bullet beside an
        // empty toggle. Reading the node name off the resolved position rather
        // than testing isActive('listItem') matters here -- TaskItem is a separate
        // node with its own name, so asking for 'listItem' inside a task list
        // lifts nothing and the invalid nesting happens inside a checkbox.
        const { $from } = editor.state.selection;
        let listItemType: string | null = null;
        for (let depth = $from.depth; depth > 0; depth--) {
            const name = $from.node(depth).type.name;
            if (name === 'listItem' || name === 'taskItem') {
                listItemType = name;
                break;
            }
        }

        editor
            .chain()
            .focus()
            // Chained rather than run on its own so ProseMirror maps the selection
            // through the lift and the toggle lands where the caret is.
            .liftListItem(listItemType ?? 'listItem')
            .command(({ tr, state, dispatch }) => {
                if (dispatch === undefined) return true;
                const { $from: afterLift } = state.selection;
                const range = afterLift.blockRange();
                if (!range) return false;

                // Only the block's inline content becomes the summary. The
                // surrounding block node is dropped: a paragraph cannot contain a
                // summary, and a <details> is its own block.
                const block = state.doc.slice(range.start, range.end).content.firstChild;
                const summaryContent = block && block.isTextblock ? block.content : Fragment.empty;

                // Built as named nodes so the caret can be placed from their own
                // sizes below, rather than from arithmetic that has to be kept in
                // step with the schema by hand.
                const { details, detailsSummary, detailsContent, paragraph } = state.schema.nodes;
                const summary = detailsSummary.create(null, summaryContent);
                // detailsContent is `block+`, so it cannot be left empty.
                const body = detailsContent.create(null, paragraph.create());

                tr.replaceWith(
                    range.start,
                    range.end,
                    // `open` so the body is already showing: the node view reads it
                    // on mount and unfolds, which is the only way the extension has
                    // of being open. It is also persisted, so a toggle saved shut
                    // still comes back shut.
                    details.create({ toggleLevel: level, open: true }, [summary, body]),
                );

                // Into the body, ready to type. Walking the nodes rather than
                // counting offsets: step inside <details>, past the summary, inside
                // the body, and inside its first paragraph.
                const caret = range.start + 1 + summary.nodeSize + 2;
                tr.setSelection(TextSelection.near(tr.doc.resolve(caret)));
                return true;
            })
            .run();
    };

/** Toggles a callout of the given type, so a second press unwraps it. */
const runCallout =
    (type: CalloutType) =>
    (editor: Editor): void => {
        editor.chain().focus().toggleCallout({ type }).run();
    };

/** Inserts a table, asking for a size first so nobody ends up with a 10x10. */
const runTable = (editor: Editor): void => {
    const answer = window.prompt('Table size, e.g. 3x4 (rows x columns)', '3x3');
    if (answer === null) return;

    const match = answer.trim().match(/^(\d{1,2})\s*[xX,]\s*(\d{1,2})$/);
    // A malformed answer falls back to a sensible default rather than refusing,
    // because the menu item should never dead-end.
    const rows = match ? Math.min(20, Math.max(1, Number(match[1]))) : 3;
    const cols = match ? Math.min(12, Math.max(1, Number(match[2]))) : 3;

    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
};

export const SLASH_COMMANDS: SlashCommand[] = [
    // ---- Basic
    {
        id: 'text',
        title: 'Text',
        hint: 'Plain paragraph',
        icon: 'Type',
        group: 'Basic',
        keywords: ['text', 'paragraph', 'p', 'body'],
        run: editor => editor.chain().focus().setParagraph().run(),
    },
    {
        id: 'h1',
        title: 'Heading 1',
        hint: 'Large section heading',
        icon: 'Heading1',
        group: 'Basic',
        keywords: ['h1', 'heading', 'title', 'big'],
        run: editor => editor.chain().focus().setHeading({ level: 1 }).run(),
    },
    {
        id: 'h2',
        title: 'Heading 2',
        hint: 'Medium section heading',
        icon: 'Heading2',
        group: 'Basic',
        keywords: ['h2', 'heading', 'subtitle'],
        run: editor => editor.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
        id: 'h3',
        title: 'Heading 3',
        hint: 'Small section heading',
        icon: 'Heading3',
        group: 'Basic',
        keywords: ['h3', 'heading', 'subheading'],
        run: editor => editor.chain().focus().setHeading({ level: 3 }).run(),
    },
    {
        id: 'toggle',
        title: 'Toggle list',
        hint: 'Collapsible content',
        icon: 'ChevronRight',
        group: 'Basic',
        keywords: ['toggle', 'collapse', 'fold', 'details', 'disclosure', 'close', 'hide'],
        run: runToggle(null),
        isActive: editor => editor.isActive('details'),
    },
    {
        id: 'toggle-heading',
        title: 'Toggle heading',
        hint: 'Collapsible heading',
        icon: 'Heading',
        group: 'Basic',
        keywords: ['toggle', 'heading', 'collapse', 'fold', 'section'],
        run: runToggle(2),
        isActive: editor =>
            editor.isActive('details') &&
            (editor.getAttributes('details').toggleLevel ?? null) !== null,
    },
    {
        id: 'callout-info',
        title: 'Callout: Info',
        hint: 'A tinted note block',
        icon: 'Info',
        group: 'Basic',
        keywords: ['callout', 'info', 'note', 'blue', 'admonition'],
        run: runCallout('info'),
    },
    {
        id: 'callout-tip',
        title: 'Callout: Tip',
        hint: 'Something worth remembering',
        icon: 'Info',
        group: 'Basic',
        keywords: ['callout', 'tip', 'hint', 'success', 'green', 'admonition'],
        run: runCallout('tip'),
    },
    {
        id: 'callout-warning',
        title: 'Callout: Warning',
        hint: 'Caution, read this',
        icon: 'Info',
        group: 'Basic',
        keywords: ['callout', 'warning', 'caution', 'amber', 'yellow', 'admonition'],
        run: runCallout('warning'),
    },
    {
        id: 'callout-danger',
        title: 'Callout: Danger',
        hint: 'Something that will break',
        icon: 'Info',
        group: 'Basic',
        keywords: ['callout', 'danger', 'error', 'red', 'stop', 'admonition'],
        run: runCallout('danger'),
    },
    {
        id: 'quote',
        title: 'Quote',
        hint: 'Set text apart',
        icon: 'Quote',
        group: 'Basic',
        keywords: ['quote', 'blockquote', 'cite'],
        run: editor => editor.chain().focus().toggleBlockquote().run(),
    },
    {
        id: 'divider',
        title: 'Divider',
        hint: 'Horizontal rule',
        icon: 'Minus',
        group: 'Basic',
        keywords: ['divider', 'rule', 'separator', 'hr', 'line'],
        run: editor => editor.chain().focus().setHorizontalRule().run(),
    },

    // ---- Lists
    {
        id: 'bullet',
        title: 'Bulleted list',
        hint: 'Unordered list',
        icon: 'List',
        group: 'Lists',
        keywords: ['list', 'bullet', 'ul', 'unordered'],
        run: editor => editor.chain().focus().toggleBulletList().run(),
    },
    {
        id: 'ordered',
        title: 'Numbered list',
        hint: 'Ordered list',
        icon: 'ListOrdered',
        group: 'Lists',
        keywords: ['list', 'number', 'ol', 'ordered'],
        run: editor => editor.chain().focus().toggleOrderedList().run(),
    },
    {
        id: 'todo',
        title: 'To-do',
        hint: 'Track something with a checkbox',
        icon: 'CheckSquare',
        group: 'Lists',
        keywords: ['todo', 'task', 'checkbox', 'check', 'done'],
        run: editor => editor.chain().focus().toggleTaskList().run(),
    },

    // ---- Insert
    {
        id: 'table',
        title: 'Table',
        hint: 'Grid with a header row',
        icon: 'Table',
        group: 'Insert',
        keywords: ['table', 'grid', 'spreadsheet', 'rows', 'columns'],
        run: runTable,
        isActive: editor => editor.isActive('table'),
    },
    {
        id: 'code',
        title: 'Code block',
        hint: 'Syntax highlighted',
        icon: 'Code',
        group: 'Insert',
        keywords: ['code', 'snippet', 'pre', 'monospace'],
        run: editor => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
        id: 'inline-math',
        title: 'Inline maths',
        hint: 'LaTeX in the sentence',
        icon: 'Sigma',
        group: 'Insert',
        keywords: ['math', 'maths', 'latex', 'formula', 'equation', 'sigma', 'katex'],
        run: editor => {
            const expression = window.prompt('LaTeX expression', 'x^2');
            if (!expression) return;
            editor
                .chain()
                .focus()
                .insertInlineMath({ latex: expression })
                .run();
        },
    },
    {
        id: 'block-math',
        title: 'Maths block',
        hint: 'LaTeX on its own line',
        icon: 'Sigma',
        group: 'Insert',
        keywords: ['math', 'maths', 'latex', 'formula', 'equation', 'display', 'katex'],
        run: editor => {
            const expression = window.prompt('LaTeX expression', '\\int_0^1 x^2 dx');
            if (!expression) return;
            editor
                .chain()
                .focus()
                .insertBlockMath({ latex: expression })
                .run();
        },
    },

    // ---- Media
    {
        id: 'image',
        title: 'Image',
        hint: 'Embed from a URL',
        icon: 'Image',
        group: 'Media',
        keywords: ['image', 'picture', 'photo', 'img'],
        // Notion prompts inline rather than in the menu; window.prompt keeps this
        // dependency-free and matches how the previous editor inserted images.
        run: editor => {
            const url = window.prompt('Image URL');
            if (url) editor.chain().focus().setImage({ src: url }).run();
        },
    },
];

export const SLASH_GROUP_ORDER: SlashGroup[] = [
    'Basic',
    'Lists',
    'Insert',
    'Media',
    'Actions',
    'Table',
];

const filterCommands = ({ query }: { query: string }) => {
    const q = query.toLowerCase().trim();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
        cmd => cmd.title.toLowerCase().includes(q) || cmd.keywords.some(k => k.includes(q)),
    );
};

/* ------------------------------------------------------------------ *
 * Favourites
 * ------------------------------------------------------------------ */

const FAVOURITES_KEY = 'notes:slashFavourites';

const readFavourites = (): string[] => {
    try {
        const raw = window.localStorage.getItem(FAVOURITES_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : [];
    } catch {
        // Corrupt or unavailable storage must not break the menu.
        return [];
    }
};

export const writeFavourites = (ids: string[]) => {
    try {
        window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(ids));
    } catch {
        // Private browsing or a full quota: the menu still works, it just forgets.
    }
};

export { readFavourites };

/**
 * The commands that turn the block they are applied to into another kind.
 *
 * The block handle menu offers exactly these, because that menu is opened
 * against a block that already exists. The rest of the catalogue inserts new
 * content -- a table, an image, some LaTeX -- and each prompts for input, so they
 * belong to "/" and its empty query rather than to a menu that is already
 * pointed at a block. Converting to a code block stays; it is a conversion, not
 * an insertion, despite sharing a group with the things that are not.
 */
const CONVERSION_ONLY = new Set(['inline-math', 'block-math', 'image', 'table']);

export const blockConversions = (): SlashCommand[] =>
    SLASH_COMMANDS.filter(command => !CONVERSION_ONLY.has(command.id));

/* ------------------------------------------------------------------ *
 * The "/" suggestion plugin
 * ------------------------------------------------------------------ */

/**
 * The "/" command menu.
 *
 * `props.mount` is TipTap's own Floating UI integration: it appends the element
 * to document.body, anchors it to the caret, and keeps it positioned through
 * scroll, resize and layout shifts. That is why there is no tippy.js here.
 */
/**
 * Keeps a selection from being destroyed by typing "/".
 *
 * ProseMirror's default for typed text over a selection is to replace it, which
 * means selecting fifty lines and pressing "/" deletes all fifty and opens the
 * menu on an empty document -- the exact opposite of what someone selecting a
 * block of lines in order to convert it intends.
 *
 * So a "/" typed over a selection moves to the end of that selection and inserts
 * there, leaving the text intact and the selection collapsed after the slash.
 * The menu then opens normally, so converting the block below still works.
 */
const PreserveSelectionOnSlash = Extension.create({
    name: 'preserveSelectionOnSlash',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                props: {
                    handleTextInput: (view, from, to, text) => {
                        if (text !== '/' || from === to) return false;

                        const { state, dispatch } = view;
                        const tr = state.tr.insertText('/', to, to);
                        tr.setSelection(TextSelection.create(tr.doc, to + 1));
                        dispatch(tr.scrollIntoView());
                        return true;
                    },
                },
            }),
        ];
    },
});

/**
 * Whether the "/" menu is on screen right now.
 *
 * A plain exported object rather than a hook or context, because the "/" menu is
 * mounted by TipTap's suggestion plugin from inside `addOptions`, so there is no
 * component tree to thread state through, and because it is read from a selection
 * handler in the editor component that must find out without scheduling a render
 * of its own.
 *
 * Set by the menu itself on mount and unmount -- see BlockMenu -- rather than by
 * the plugin's onStart and onExit. Those are the same two moments in normal
 * operation, but onExit is not called if the editor is torn down with the menu
 * open, and a flag stuck at true would silently stop the selection menu from ever
 * opening again.
 */
export const slashMenuOpen = { current: false };

export const SlashCommandExtension = Extension.create({
    name: 'slashCommand',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                startOfLine: false,
                allowSpaces: false,
                // A bare "/" inside a URL or a path must not open the menu, so the
                // trigger is only accepted at the start of a block or after
                // whitespace.
                allowedPrefixes: [' '],
                command: ({
                    editor,
                    range,
                    props,
                }: {
                    editor: Editor;
                    range: { from: number; to: number };
                    props: SlashCommand;
                }) => {
                    // Replace the whole "/query" run, then run the command.
                    editor.chain().focus().deleteRange(range).run();
                    props.run(editor);

                    // Put the caret at the start of the block that was just made.
                    // Without this the selection is left wherever the conversion
                    // happened to leave it, and typing continues somewhere other
                    // than the new item -- which reads as "it made a new line
                    // instead of letting me type in front of it".
                    const { $from } = editor.state.selection;
                    if ($from.parent.isTextblock) {
                        editor.chain().focus().setTextSelection($from.start()).run();
                    }
                },
                items: ({ query }: { query: string }) => filterCommands({ query }),
                render: () => {
                    let component: ReactRenderer<BlockMenuRef, SuggestionProps<SlashCommand>> | null =
                        null;
                    let unmount: (() => void) | null = null;

                    return {
                        onStart: (props: SuggestionProps<SlashCommand>) => {
                            component = new ReactRenderer<BlockMenuRef, SuggestionProps<SlashCommand>>(
                                BlockMenu,
                                { props, editor: props.editor },
                            );
                            unmount = props.mount(component.element);
                        },
                        onUpdate: (props: SuggestionProps<SlashCommand>) => {
                            component?.updateProps(props);
                        },
                        onKeyDown: (props: SuggestionKeyDownProps) => {
                            if (props.event.key === 'Escape') {
                                unmount?.();
                                return true;
                            }
                            // Forward verbatim: the menu needs the real range and
                            // view to decide whether it consumed the keystroke.
                            return component?.ref?.onKeyDown(props) ?? false;
                        },
                        onExit: () => {
                            unmount?.();
                            component?.destroy();
                            component = null;
                            unmount = null;
                        },
                    };
                },
            } as Partial<SuggestionOptions<SlashCommand>>,
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion<SlashCommand>({
                editor: this.editor,
                ...this.options.suggestion,
            }),
        ];
    },
});

/* ------------------------------------------------------------------ *
 * Extension set
 * ------------------------------------------------------------------ */

export interface NoteEditorExtensionsOptions {
    placeholder: string;
    /**
     * Called with the page outline every time the headings change. Handing the
     * callback down rather than reading storage from a component is what keeps
     * the outline in React state, and therefore re-renderable.
     */
    onTocUpdate?: (items: TableOfContentData) => void;
}

/**
 * The full extension set for a note.
 *
 * StarterKit v3 already bundles link, underline, strike, the list family and
 * undo/redo, so those are configured through its options rather than added as
 * separate extensions.
 */
export const buildNoteExtensions = ({
    placeholder,
    onTocUpdate,
}: NoteEditorExtensionsOptions) => [
    StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Replaced by CodeBlockLowlight below. Both register a `codeBlock` node, so
        // StarterKit's has to be switched off or the schema collides.
        codeBlock: false,
        // Reopen the link editor when clicking an existing link, and treat bare
        // URLs typed into the page as links the way Notion does.
        link: {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            HTMLAttributes: { class: 'note-link' },
        },
        dropcursor: { color: 'var(--color-primary)', width: 2 },
        // Off deliberately. TrailingNode guarantees a paragraph after the last
        // block, so inserting a to-do as the final block left an empty line under
        // it and the caret appeared to be somewhere else entirely.
        trailingNode: false,
    }),
    CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
        HTMLAttributes: { class: 'note-code-block' },
        // Off by default, and the extension's Tab handler opens with
        // `if (!this.options.enableTabIndentation) return false` -- so Tab inside a
        // code block was bound to nothing and the browser took the keystroke, which
        // moved focus out of the editor. A code block is the one place indentation
        // is unambiguously what a Tab means, and this is also what switches on the
        // matching Shift-Tab outdent. See `noteTabIndent.ts` for the plain-text case.
        enableTabIndentation: true,
        tabSize: TAB_SIZE,
    }),
    Placeholder.configure({
        placeholder,
        // Only the block holding the caret is dimmed, so a half-written note does
        // not look like an empty one.
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
        includeChildren: false,
    }),
    TaskList,
    TaskItem.configure({
        // Deliberately not `nested: true`. That option widens a to-do's content
        // from `paragraph+` to `paragraph block*`, and splitListItem respects it:
        // Enter at the end of a to-do then adds a second paragraph *inside the
        // same checkbox* instead of a new checkbox. The result is that a to-do
        // list cannot be left from the keyboard at all -- every Enter lands
        // inside the last row, which is exactly the "I can't write after a to-do"
        // dead end.
        //
        // With `paragraph+`, Enter makes a fresh checkbox and ExitEmptyListItem
        // handles the blank one. The cost is that Tab no longer nests a to-do
        // inside another to-do, which is the right trade: nested checkboxes read
        // as a broken list far more often than as structure.
        nested: false,
    }),
    Callout,
    InlineMath,
    BlockMath,
    TableKit.configure({
        table: {
            resizable: true,
            // Without this a table inside a 740px column overflows the page and
            // the scroll container rather than fitting it.
            allowTableNodeSelection: true,
            HTMLAttributes: { class: 'note-table' },
        },
    }),
    ToggleDetails.configure({
        // Keeps the open/closed state in the saved document, so a section folded
        // away stays folded when the page is reopened.
        persist: true,
        openClassName: 'is-open',
        HTMLAttributes: { class: 'note-toggle' },
    }),
    DetailsSummary.configure({ HTMLAttributes: { class: 'note-toggle-summary' } }),
    DetailsContent.configure({ HTMLAttributes: { class: 'note-toggle-content' } }),
    // The chevron opens a toggle and puts the caret in the body. The label stays
    // ordinary text, so it is not touched here.
    ToggleChevronCaret,
    Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: 'note-image' },
    }),
    Highlight.configure({ multicolor: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    Subscript,
    Superscript,
    Typography,
    CharacterCount,
    PreserveSelectionOnSlash,
    // Ahead of ListItem and TaskItem in the keymap, so Enter on a blank to-do
    // leaves the list. See the extension for why that is not just liftListItem.
    ExitEmptyListItem,
    // Backspace and Delete at the edges of a toggle's label. Ahead of ListItem and
    // TaskItem in the keymap for the same reason ExitEmptyListItem is.
    LiftToggleOnBackspace,
    // Forwards arrow keys to the block menu while the caret stays in the
    // document, so a menu opened on a text selection is still operable.
    BlockMenuKeys,
    // Tab indents a plain paragraph, heading or quote, and Shift-Tab takes it
    // back. Last in the list, which is where it belongs: it is the only thing here
    // that changes what Tab means, so everything with a claim on the key -- the
    // list keymap, the code block, `tableEditing` -- gets asked first. It also
    // checks that itself rather than trusting this position.
    TabIndent,
    // Adds `has-focus` to the block the caret is in. The dimming itself is CSS
    // driven off the editor's focus-mode class, which is why there is no command.
    Focus.configure({ className: 'has-focus', mode: 'deepest' }),
    TableOfContents.configure({
        // The outline is rendered from this callback rather than polled, so an
        // idle page costs nothing.
        onUpdate: items => onTocUpdate?.(items),
    }),
    SlashCommandExtension,
];
