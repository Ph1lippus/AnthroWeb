import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
    Bold,
    Code,
    Highlighter,
    Italic,
    Link2,
    Link2Off,
    Strikethrough,
    Underline,
} from 'lucide-react';
import { buildNoteExtensions } from '../../utils/noteEditorExtensions';
import { normalizeLegacyCheckboxes } from '../../utils/noteContent';

interface NoteEditorProps {
    /** Stored HTML. Only used to seed the editor on first mount. */
    initialHtml: string;
    onChange: (html: string) => void;
    /** Put the caret in the body on mount. Used for blank pages only. */
    autoFocus?: boolean;
}

/**
 * The note body editor.
 *
 * Always editable and always mounted: there is no read mode and no edit toggle,
 * so opening a note puts the caret in a live document. Uncontrolled by design --
 * the parent owns the stored HTML but this component owns the live document, and
 * the two are reconciled once on mount rather than on every render.
 */
const NoteEditor: React.FC<NoteEditorProps> = ({ initialHtml, onChange, autoFocus = false }) => {
    const editor = useEditor({
        extensions: buildNoteExtensions({ placeholder: "Type '/' for blocks..." }),
        content: normalizeLegacyCheckboxes(initialHtml),
        // Notion-style pages are not a form field: nothing should submit them and
        // nothing should be stripped out of them.
        editorProps: {
            attributes: {
                class: 'note-prose',
                spellcheck: 'true',
            },
        },
        // Reported on every document change so the parent can debounce, rather
        // than saving inside this component, so autosave stays in one place.
        onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    });

    // Only a blank page pulls the caret into the body, so opening an existing note
    // leaves the scroll where you left it instead of jumping to the bottom.
    useEffect(() => {
        // isDestroyed, not just a truthiness check: under StrictMode React mounts,
        // unmounts and remounts effects in dev. TipTap tears the editor down in
        // between, which leaves `editor` truthy but its view null -- so
        // `editor.commands` throws on a destroyed instance rather than on a null
        // one. Only touch commands on a live editor.
        if (!autoFocus || !editor || editor.isDestroyed) return;
        editor.commands.focus('end');
    }, [editor, autoFocus]);

    const setLink = () => {
        // Same destroyed-instance guard as the autofocus effect: prompt() is a long
        // stop, and this class of crash is not worth re-teaching.
        if (!editor || editor.isDestroyed) return;
        const previous = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('Link URL', previous ?? 'https://');
        if (url === null) return;

        // An empty value is treated as "remove the link" rather than leaving the
        // user stuck with one they cannot edit.
        if (url.trim() === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
    };

    if (!editor) {
        return <div className="note-prose-loading" />;
    }

    return (
        <div className="note-editor-shell">
            {/* Selection toolbar. TipTap positions this with Floating UI and it
                only appears when there is a non-empty text selection. */}
            <BubbleMenu
                editor={editor}
                options={{ placement: 'top', offset: 8 }}
                shouldShow={({ state }) => {
                    const { from, to } = state.selection;
                    // Never offer formatting on a collapsed caret; the user is
                    // about to type, not select.
                    return from !== to && !editor.isActive('codeBlock');
                }}
            >
                <div className="note-bubble">
                    <button
                        type="button"
                        className={`note-bubble-btn${editor.isActive('bold') ? ' note-bubble-btn--on' : ''}`}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        title="Bold (Ctrl+B)"
                    >
                        <Bold size={14} />
                    </button>
                    <button
                        type="button"
                        className={`note-bubble-btn${editor.isActive('italic') ? ' note-bubble-btn--on' : ''}`}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        title="Italic (Ctrl+I)"
                    >
                        <Italic size={14} />
                    </button>
                    <button
                        type="button"
                        className={`note-bubble-btn${editor.isActive('underline') ? ' note-bubble-btn--on' : ''}`}
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        title="Underline (Ctrl+U)"
                    >
                        <Underline size={14} />
                    </button>
                    <button
                        type="button"
                        className={`note-bubble-btn${editor.isActive('strike') ? ' note-bubble-btn--on' : ''}`}
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        title="Strikethrough"
                    >
                        <Strikethrough size={14} />
                    </button>
                    <button
                        type="button"
                        className={`note-bubble-btn${editor.isActive('highlight') ? ' note-bubble-btn--on' : ''}`}
                        onClick={() => editor.chain().focus().toggleHighlight().run()}
                        title="Highlight"
                    >
                        <Highlighter size={14} />
                    </button>
                    <button
                        type="button"
                        className={`note-bubble-btn${editor.isActive('code') ? ' note-bubble-btn--on' : ''}`}
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        title="Inline code"
                    >
                        <Code size={14} />
                    </button>
                    <span className="note-bubble-sep" />
                    <button
                        type="button"
                        className={`note-bubble-btn${editor.isActive('link') ? ' note-bubble-btn--on' : ''}`}
                        onClick={setLink}
                        title="Link (Ctrl+K)"
                    >
                        <Link2 size={14} />
                    </button>
                    {editor.isActive('link') && (
                        <button
                            type="button"
                            className="note-bubble-btn"
                            onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
                            title="Remove link"
                        >
                            <Link2Off size={14} />
                        </button>
                    )}
                </div>
            </BubbleMenu>

            <EditorContent editor={editor} />
        </div>
    );
};

export default NoteEditor;
