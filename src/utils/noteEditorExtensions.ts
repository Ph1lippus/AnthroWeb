import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import CharacterCount from '@tiptap/extension-character-count';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Details, { DetailsContent, DetailsSummary } from '@tiptap/extension-details';
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
import SlashMenu from '../Components/Notes/SlashMenu';
import type { SlashMenuRef } from '../Components/Notes/SlashMenu';
import Callout from './noteCallout';
import type { CalloutType } from './noteCallout';

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
const ToggleDetails = Details.extend({
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
 * The "/" command catalogue
 * ------------------------------------------------------------------ */

export type SlashIconName =
    | 'Type'
    | 'Heading1'
    | 'Heading2'
    | 'Heading3'
    | 'Heading'
    | 'ChevronDown'
    | 'Quote'
    | 'Info'
    | 'Minus'
    | 'List'
    | 'ListOrdered'
    | 'CheckSquare'
    | 'Table'
    | 'Code'
    | 'Sigma'
    | 'Image';
export type SlashGroup = 'Basic' | 'Lists' | 'Insert' | 'Media';

export interface SlashCommand {
    /** Stable across renames, so it can key the favourites list. */
    id: string;
    title: string;
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
 */
const runToggle =
    (level: number | null) =>
    (editor: Editor): void => {
        // Already in exactly this toggle: a second press should close it rather
        // than build a nested one.
        if (editor.isActive('details')) {
            const current = (editor.getAttributes('details').toggleLevel ?? null) as number | null;
            if (current === level) {
                editor.chain().focus().unsetDetails().run();
            } else {
                editor
                    .chain()
                    .focus()
                    .updateAttributes('details', { toggleLevel: level })
                    .run();
            }
            return;
        }

        editor
            .chain()
            .focus()
            .setDetails()
            .updateAttributes('details', { toggleLevel: level })
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
        icon: 'ChevronDown',
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

export const SLASH_GROUP_ORDER: SlashGroup[] = ['Basic', 'Lists', 'Insert', 'Media'];

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
                },
                items: ({ query }: { query: string }) => filterCommands({ query }),
                render: () => {
                    let component: ReactRenderer<SlashMenuRef, SuggestionProps<SlashCommand>> | null =
                        null;
                    let unmount: (() => void) | null = null;

                    return {
                        onStart: (props: SuggestionProps<SlashCommand>) => {
                            component = new ReactRenderer<SlashMenuRef, SuggestionProps<SlashCommand>>(
                                SlashMenu,
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
    }),
    CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
        HTMLAttributes: { class: 'note-code-block' },
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
    TaskItem.configure({ nested: true }),
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
