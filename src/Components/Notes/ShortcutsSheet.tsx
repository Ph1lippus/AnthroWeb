import React from 'react';

interface ShortcutsSheetProps {
    open: boolean;
    onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
const mod = isMac ? '⌘' : 'Ctrl';

/**
 * A row is [left-hand label, what it does, kind?].
 *
 * The third element is there for the one section that is not about keys. Key
 * combinations are rendered as `<kbd>` chips, which is what they are; the names
 * of the toolbar buttons are not keystrokes and rendering them as keys would
 * teach the wrong thing, so those rows pass 'label' and get plain text instead.
 *
 * `wide` left-aligns a section's descriptions. The shortcut rows are short and
 * read fine pushed right against the chip column; the toolbar rows are sentences
 * and do not.
 */
type Row = [string, string] | [string, string, 'label'];

const GROUPS: { title: string; wide?: boolean; rows: Row[] }[] = [
    {
        title: 'Writing',
        rows: [
            ['Type /', 'Open the block menu'],
            ['# then space', 'Heading 1'],
            ['## then space', 'Heading 2'],
            ['### then space', 'Heading 3'],
            ['- then space', 'Bulleted list'],
            ['1. then space', 'Numbered list'],
            ['[] then space', 'To-do'],
            ['> then space', 'Quote'],
            ['``` then space', 'Code block'],
            ['--- on its own line', 'Divider'],
        ],
    },
    {
        title: 'Selecting',
        rows: [
            ['Shift + arrow keys', 'Extend the selection'],
            [`${mod} + A`, 'Select the whole page'],
            ['Double-click a word', 'Select it'],
            ['Triple-click a line', 'Select it'],
        ],
    },
    {
        title: 'Formatting',
        rows: [
            [`${mod} + B`, 'Bold'],
            [`${mod} + I`, 'Italic'],
            [`${mod} + U`, 'Underline'],
            [`${mod} + Shift + X`, 'Strikethrough'],
            [`${mod} + E`, 'Inline code'],
            [`${mod} + K`, 'Link'],
        ],
    },
    {
        title: 'History',
        rows: [
            [`${mod} + Z`, 'Undo'],
            [`${mod} + Shift + Z`, 'Redo'],
        ],
    },
    {
        title: 'Lists',
        rows: [
            ['Tab', 'Indent, or next table cell'],
            ['Shift + Tab', 'Outdent, or previous table cell'],
            ['Enter in an empty to-do', 'Untick it'],
        ],
    },
    {
        title: 'Pages',
        rows: [
            [`${mod} + K`, 'Go to page'],
            [`${mod} + Shift + E`, 'Export this page'],
            ['?', 'This list'],
        ],
    },
    {
        // The toolbar that appears above a selection. Its buttons carry `title`
        // tooltips, which a mouse user sees on hover but a phone never does --
        // there is no hover on a touch screen, so on mobile this section is the
        // only description of what the row of icons does.
        title: 'Selection toolbar',
        wide: true,
        rows: [
            ['B', 'Bold — Ctrl+B', 'label'],
            ['I', 'Italic — Ctrl+I', 'label'],
            ['U', 'Underline — Ctrl+U', 'label'],
            ['S', 'Strikethrough — Ctrl+Shift+X', 'label'],
            ['H', 'Highlight — marks the text with a colour', 'label'],
            ['</>', 'Inline code — sets the text in a monospaced font', 'label'],
            ['x₂', 'Subscript — lowers and shrinks the text', 'label'],
            ['x²', 'Superscript — raises and shrinks the text', 'label'],
            ['🔗', 'Link — Ctrl+K; turns the selection into a link, or edits the one it is already inside', 'label'],
            ['🔗̸', 'Remove link — appears only while the selection is already a link', 'label'],
        ],
    },
];

/**
 * The editor help sheet.
 *
 * `?` opens it, but only from outside the editor: inside, a question mark is a
 * perfectly ordinary character and swallowing it would be more annoying than
 * useful.
 *
 * Mostly shortcuts, with one section on the selection toolbar. That section is
 * not decoration: the toolbar buttons carry `title` tooltips, which only a mouse
 * with a hover ever sees. This is the only place the buttons are written down for
 * anyone on a phone.
 */
const ShortcutsSheet: React.FC<ShortcutsSheetProps> = ({ open, onClose }) => {
    if (!open) return null;

    return (
        <div className="import-modal-overlay" onMouseDown={onClose}>
            <div
                className="import-modal-card note-shortcuts"
                onMouseDown={event => event.stopPropagation()}
                role="dialog"
                aria-label="Editor help"
            >
                <div className="note-shortcuts-head">
                    <h3>Editor help</h3>
                    <button type="button" onClick={onClose} aria-label="Close">
                        &times;
                    </button>
                </div>
                <div className="note-shortcuts-grid">
                    {GROUPS.map(group => (
                        <section key={group.title} className={group.wide ? 'note-shortcut-section--wide' : undefined}>
                            <h4>{group.title}</h4>
                            <dl>
                                {group.rows.map(([keys, description, kind]) => (
                                    <div key={keys} className="note-shortcut-row">
                                        <dt>
                                            {kind === 'label' ? (
                                                <span className="note-shortcut-label">{keys}</span>
                                            ) : (
                                                keys.split(' + ').map((part, index) => (
                                                    <React.Fragment key={`${part}-${index}`}>
                                                        {index > 0 && <span className="note-shortcut-plus">+</span>}
                                                        <kbd>{part}</kbd>
                                                    </React.Fragment>
                                                ))
                                            )}
                                        </dt>
                                        <dd>{description}</dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ShortcutsSheet;
