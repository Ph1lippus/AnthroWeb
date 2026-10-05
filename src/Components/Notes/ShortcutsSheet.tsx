import React from 'react';

interface ShortcutsSheetProps {
    open: boolean;
    onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
const mod = isMac ? '⌘' : 'Ctrl';

/**
 * A row is [what you press, what it does].
 *
 * The key combinations are rendered as `<kbd>` chips, which is what they are, and
 * split on ` + ` so `Ctrl` and `K` are two keys rather than one long one.
 */
type Row = [string, string];

const GROUPS: { title: string; rows: Row[] }[] = [
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
            ['Enter in an empty to-do', 'Leave the list as a paragraph'],
        ],
    },
    {
        // Split out from Lists because Tab means three different things depending
        // on where the caret is, and one line cannot say so. It was listed as
        // "Indent, or next table cell" under Lists, which was two thirds true and
        // gave no hint that plain text -- where the complaint usually comes from --
        // did nothing at all.
        title: 'Indenting',
        rows: [
            ['Tab', 'Indent a line, nest a list, or go to the next table cell'],
            ['Shift + Tab', 'Outdent, or go to the previous table cell'],
            ['Escape, then Tab', 'Leave the page and move to the next control'],
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
 * The editor help sheet.
 *
 * `?` opens it, but only from outside the editor: inside, a question mark is a
 * perfectly ordinary character and swallowing it would be more annoying than
 * useful.
 *
 * Mostly shortcuts, with one section on the block menu. That section is not
 * decoration: the menu buttons carry `title` tooltips, which only a mouse with a
 * hover ever sees. This is the only place they are written down for anyone on a
 * phone.
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
