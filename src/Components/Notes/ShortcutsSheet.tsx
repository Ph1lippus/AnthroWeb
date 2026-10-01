import React from 'react';

interface ShortcutsSheetProps {
    open: boolean;
    onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
const mod = isMac ? '⌘' : 'Ctrl';

const GROUPS: { title: string; rows: [string, string][] }[] = [
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
];

/**
 * The shortcut list.
 *
 * `?` opens it, but only from outside the editor: inside, a question mark is a
 * perfectly ordinary character and swallowing it would be more annoying than
 * useful.
 */
const ShortcutsSheet: React.FC<ShortcutsSheetProps> = ({ open, onClose }) => {
    if (!open) return null;

    return (
        <div className="import-modal-overlay" onMouseDown={onClose}>
            <div
                className="import-modal-card note-shortcuts"
                onMouseDown={event => event.stopPropagation()}
                role="dialog"
                aria-label="Keyboard shortcuts"
            >
                <div className="note-shortcuts-head">
                    <h3>Keyboard shortcuts</h3>
                    <button type="button" onClick={onClose} aria-label="Close">
                        &times;
                    </button>
                </div>
                <div className="note-shortcuts-grid">
                    {GROUPS.map(group => (
                        <section key={group.title}>
                            <h4>{group.title}</h4>
                            <dl>
                                {group.rows.map(([keys, description]) => (
                                    <div key={keys} className="note-shortcut-row">
                                        <dt>
                                            {keys.split(' + ').map((part, index) => (
                                                <React.Fragment key={`${part}-${index}`}>
                                                    {index > 0 && <span className="note-shortcut-plus">+</span>}
                                                    <kbd>{part}</kbd>
                                                </React.Fragment>
                                            ))}
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
