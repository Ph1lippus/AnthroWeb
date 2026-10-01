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
import Suggestion from '@tiptap/suggestion';
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import type { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import SlashMenu from '../Components/Notes/SlashMenu';
import type { SlashIconName, SlashMenuRef } from '../Components/Notes/SlashMenu';

export interface SlashCommand {
    title: string;
    hint: string;
    icon: SlashIconName;
    keywords: string[];
    run: (editor: Editor) => void;
}

// Every entry the "/" menu can insert. Grouped visually in the menu by the
// order here, which is why basic text blocks come before structural ones.
export const SLASH_COMMANDS: SlashCommand[] = [
    {
        title: 'Text',
        hint: 'Plain paragraph',
        icon: 'Type',
        keywords: ['text', 'paragraph', 'p'],
        run: editor => editor.chain().focus().setParagraph().run(),
    },
    {
        title: 'Heading 1',
        hint: 'Large section heading',
        icon: 'Heading1',
        keywords: ['h1', 'heading', 'title', 'big'],
        run: editor => editor.chain().focus().setHeading({ level: 1 }).run(),
    },
    {
        title: 'Heading 2',
        hint: 'Medium section heading',
        icon: 'Heading2',
        keywords: ['h2', 'heading', 'subtitle'],
        run: editor => editor.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
        title: 'Heading 3',
        hint: 'Small section heading',
        icon: 'Heading3',
        keywords: ['h3', 'heading', 'subheading'],
        run: editor => editor.chain().focus().setHeading({ level: 3 }).run(),
    },
    {
        title: 'Bulleted list',
        hint: 'Unordered list',
        icon: 'List',
        keywords: ['list', 'bullet', 'ul', 'unordered'],
        run: editor => editor.chain().focus().toggleBulletList().run(),
    },
    {
        title: 'Numbered list',
        hint: 'Ordered list',
        icon: 'ListOrdered',
        keywords: ['list', 'number', 'ol', 'ordered'],
        run: editor => editor.chain().focus().toggleOrderedList().run(),
    },
    {
        title: 'To-do',
        hint: 'Track something with a checkbox',
        icon: 'CheckSquare',
        keywords: ['todo', 'task', 'checkbox', 'check'],
        run: editor => editor.chain().focus().toggleTaskList().run(),
    },
    {
        title: 'Quote',
        hint: 'Set text apart',
        icon: 'Quote',
        keywords: ['quote', 'blockquote', 'cite'],
        run: editor => editor.chain().focus().toggleBlockquote().run(),
    },
    {
        title: 'Code block',
        hint: 'Monospaced block',
        icon: 'Code',
        keywords: ['code', 'snippet', 'pre', 'monospace'],
        run: editor => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
        title: 'Divider',
        hint: 'Horizontal rule',
        icon: 'Minus',
        keywords: ['divider', 'rule', 'separator', 'hr', 'line'],
        run: editor => editor.chain().focus().setHorizontalRule().run(),
    },
    {
        title: 'Image',
        hint: 'Embed from a URL',
        icon: 'Image',
        keywords: ['image', 'picture', 'photo', 'img'],
        // Notion prompts inline rather than in the menu; window.prompt keeps this
        // dependency-free and matches how the old editor inserted images.
        run: editor => {
            const url = window.prompt('Image URL');
            if (url) editor.chain().focus().setImage({ src: url }).run();
        },
    },
];

const filterCommands = ({ query }: { query: string }) => {
    const q = query.toLowerCase().trim();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
        cmd => cmd.title.toLowerCase().includes(q) || cmd.keywords.some(k => k.includes(q)),
    );
};

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
                command: ({ editor, range, props }: { editor: Editor; range: { from: number; to: number }; props: SlashCommand }) => {
                    // Replace the whole "/query" run, then run the command.
                    editor.chain().focus().deleteRange(range).run();
                    props.run(editor);
                },
                items: ({ query }: { query: string }) => filterCommands({ query }),
                render: () => {
                    let component: ReactRenderer<SlashMenuRef, SuggestionProps<SlashCommand>> | null = null;
                    let unmount: (() => void) | null = null;

                    return {
                        onStart: (props: SuggestionProps<SlashCommand>) => {
                            component = new ReactRenderer<SlashMenuRef, SuggestionProps<SlashCommand>>(SlashMenu, {
                                props,
                                editor: props.editor,
                            });
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

export interface NoteEditorExtensionsOptions {
    placeholder: string;
}

/**
 * The full extension set for a note.
 *
 * StarterKit v3 already bundles link, underline, strike and the list family, so
 * those are configured through its options rather than added as separate
 * extensions.
 */
export const buildNoteExtensions = ({ placeholder }: NoteEditorExtensionsOptions) => [
    StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: 'note-code-block' } },
        // Reopen the link editor when clicking an existing link, and treat bare
        // URLs typed into the page as links the way Notion does.
        link: {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            HTMLAttributes: { class: 'note-link' },
        },
        dropcursor: { color: 'var(--color-primary)', width: 2 },
        // A trailing paragraph keeps Enter from ever leaving you somewhere you
        // cannot type, which is the main dead end when editing a note.
        trailingNode: false,
    }),
    Placeholder.configure({
        placeholder,
        // Only the first block is dimmed, so a half-written note does not look
        // like an empty one.
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
        includeChildren: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: 'note-image' },
    }),
    Highlight.configure({ multicolor: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Typography,
    CharacterCount,
    SlashCommandExtension,
];
