import React from 'react';
import type { TableOfContentData } from '@tiptap/extension-table-of-contents';
import { shouldShowToc } from '../../utils/noteContent';

interface NoteTocProps {
    items: TableOfContentData;
    onClose: () => void;
}

/**
 * The page outline.
 *
 * Clicking an entry scrolls its heading into view and puts the caret there, so
 * the jump also leaves the editor in a sensible place rather than only moving
 * the viewport.
 */
const NoteToc: React.FC<NoteTocProps> = ({ items, onClose }) => {
    if (!shouldShowToc(items.length)) return null;

    return (
        <nav className="note-toc" aria-label="On this page">
            <div className="note-toc-head">
                <span className="note-toc-title">On this page</span>
                <button
                    type="button"
                    className="note-toc-close"
                    onClick={onClose}
                    aria-label="Hide outline"
                >
                    &times;
                </button>
            </div>
            <ul className="note-toc-list">
                {items.map(item => (
                    <li key={item.id} style={{ paddingLeft: `${(item.level - 1) * 0.7}rem` }}>
                        <button
                            type="button"
                            className={`note-toc-item${item.isActive ? ' note-toc-item--active' : ''}`}
                            onClick={() => {
                                item.editor
                                    .chain()
                                    .focus()
                                    .setTextSelection(item.pos + 1)
                                    .scrollIntoView()
                                    .run();
                            }}
                        >
                            {item.textContent}
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
};

export default NoteToc;
