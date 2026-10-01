import React from 'react';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import {
    Columns,
    Languages,
    Rows,
    Table,
    Trash2,
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

interface BlockControlsProps {
    editor: Editor;
}

/**
 * Contextual controls for the block the caret is inside.
 *
 * Tables and code blocks both need a small toolbar that only exists while the
 * caret is in one. A single component watches the selection via useEditorState so
 * exactly one toolbar is ever on screen, instead of a table toolbar and a code
 * toolbar each subscribing separately.
 */
const BlockControls: React.FC<BlockControlsProps> = ({ editor }) => {
    const state = useEditorState({
        editor,
        selector: ({ editor: instance }) => ({
            inTable: instance.isActive('table'),
            inCode: instance.isActive('codeBlock'),
            language:
                (instance.getAttributes('codeBlock').language as string | null) ?? 'plaintext',
        }),
    });

    if (!state || editor.isDestroyed) return null;

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
