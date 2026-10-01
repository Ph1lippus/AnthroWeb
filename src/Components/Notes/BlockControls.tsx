import React from 'react';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import {
    CheckSquare,
    Columns,
    Heading,
    Languages,
    List,
    ListOrdered,
    Quote,
    Rows,
    Table,
    Trash2,
    Type,
} from 'lucide-react';

/** Languages offered in the code block picker. Kept short on purpose: a full
 *  language list is mostly noise, and highlight.js covers the rest if a language
 *  is typed by hand. */
const LANGUAGES = [
    'javascript',
    'typescript',
    'python',
    'html',
    'css',
    'json',
    'sql',
    'bash',
    'rust',
    'go',
    'java',
    'csharp',
    'php',
    'ruby',
    'swift',
    'kotlin',
    'diff',
    'plaintext',
];

/**
 * The conversions offered for a multi-block selection.
 *
 * Each runs TipTap's own toggle command, which already operates on the whole
 * selection. That is what makes turning fifty lines into to-dos one action
 * rather than fifty: ProseMirror applies the change across every block the
 * selection touches.
 */
const TURN_INTO: {
    label: string;
    title: string;
    icon: React.ComponentType<{ size?: number | string; strokeWidth?: number }>;
    run: (editor: Editor) => void;
    isActive: (editor: Editor) => boolean;
}[] = [
    {
        label: 'Text',
        title: 'Turn into text',
        icon: Type,
        run: editor => editor.chain().focus().setParagraph().run(),
        isActive: editor => editor.isActive('paragraph'),
    },
    {
        label: 'Heading',
        title: 'Turn into heading',
        icon: Heading,
        run: editor => editor.chain().focus().setHeading({ level: 2 }).run(),
        isActive: editor => editor.isActive('heading'),
    },
    {
        label: 'Bulleted',
        title: 'Turn into a bulleted list',
        icon: List,
        run: editor => editor.chain().focus().toggleBulletList().run(),
        isActive: editor => editor.isActive('bulletList'),
    },
    {
        label: 'Numbered',
        title: 'Turn into a numbered list',
        icon: ListOrdered,
        run: editor => editor.chain().focus().toggleOrderedList().run(),
        isActive: editor => editor.isActive('orderedList'),
    },
    {
        label: 'To-do',
        title: 'Turn into to-dos',
        icon: CheckSquare,
        run: editor => editor.chain().focus().toggleTaskList().run(),
        isActive: editor => editor.isActive('taskList'),
    },
    {
        label: 'Quote',
        title: 'Turn into a quote',
        icon: Quote,
        run: editor => editor.chain().focus().toggleBlockquote().run(),
        isActive: editor => editor.isActive('blockquote'),
    },
];

interface BlockControlsProps {
    editor: Editor;
}

/**
 * Contextual controls for whatever the caret (or selection) is inside.
 *
 * Tables and code blocks each need a small toolbar that only exists while the
 * caret is in one, and a multi-block selection needs a "turn into" bar. One
 * component owns all three, driven by useEditorState, so exactly one toolbar is
 * ever on screen instead of each block type subscribing separately.
 *
 * The selection bar comes first: it is the case where losing the selection would
 * cost the user their work, and it is the reason the slash menu no longer eats
 * a selection.
 */
const BlockControls: React.FC<BlockControlsProps> = ({ editor }) => {
    const state = useEditorState({
        editor,
        selector: ({ editor: instance }) => {
            const { from, to, empty } = instance.state.selection;
            let blocks = 0;
            if (!empty) {
                // Counts the blocks the selection actually spans, so the bar
                // appears for "three lines selected" but not for a double-click on
                // one word.
                instance.state.doc.nodesBetween(from, to, () => {
                    blocks += 1;
                    return true;
                });
            }
            return {
                selectedBlocks: blocks,
                inTable: instance.isActive('table'),
                inCode: instance.isActive('codeBlock'),
                language:
                    (instance.getAttributes('codeBlock').language as string | null) ?? 'plaintext',
            };
        },
    });

    if (!state || editor.isDestroyed) return null;

    if (state.selectedBlocks > 1) {
        return (
            <div className="note-block-controls">
                <span className="note-block-controls-label">
                    Turn {state.selectedBlocks} blocks into
                </span>
                {TURN_INTO.map(option => {
                    const Icon = option.icon;
                    const active = option.isActive(editor);
                    return (
                        <button
                            type="button"
                            key={option.label}
                            title={option.title}
                            className={active ? 'note-block-controls-on' : undefined}
                            // mousedown, not click: the editor must keep the
                            // selection, since the whole point is converting it.
                            onMouseDown={event => {
                                event.preventDefault();
                                option.run(editor);
                            }}
                        >
                            <Icon size={13} />
                            {option.label}
                        </button>
                    );
                })}
            </div>
        );
    }

    if (state.inTable) {
        return (
            <div className="note-block-controls">
                <span className="note-block-controls-label">
                    <Table size={12} /> Table
                </span>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                    title="Add row below"
                >
                    <Rows size={13} /> Row
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().addColumnAfter().run()}
                    title="Add column right"
                >
                    <Columns size={13} /> Column
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                    title="Toggle header row"
                >
                    Header
                </button>
                <button
                    type="button"
                    className="note-block-controls-danger"
                    onClick={() => editor.chain().focus().deleteRow().run()}
                    title="Delete this row"
                >
                    <Trash2 size={13} />
                </button>
                <button
                    type="button"
                    className="note-block-controls-danger"
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                    title="Delete this column"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        );
    }

    if (state.inCode) {
        return (
            <div className="note-block-controls">
                <span className="note-block-controls-label">
                    <Languages size={12} /> Code
                </span>
                <select
                    className="note-code-language"
                    value={state.language}
                    onChange={event => {
                        const { value } = event.target;
                        editor
                            .chain()
                            .focus()
                            .updateAttributes('codeBlock', { language: value })
                            .run();
                    }}
                    aria-label="Code language"
                >
                    {LANGUAGES.map(language => (
                        <option key={language} value={language}>
                            {language}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    return null;
};

export default BlockControls;
