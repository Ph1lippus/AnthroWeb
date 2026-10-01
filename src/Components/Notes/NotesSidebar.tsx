import React from 'react';
import { Plus, RotateCcw, Search, StickyNote, Trash2, X } from 'lucide-react';
import type { NoteTreeRow } from '../../utils/noteTree';

interface NotesSidebarProps {
    rows: NoteTreeRow[];
    tags: string[];
    query: string;
    onQueryChange: (value: string) => void;
    activeId?: string;
    activeTag: string | null;
    onTagChange: (tag: string | null) => void;
    onSelect: (id: string) => void;
    onCreate: () => void;
    creating: boolean;
    showTrash: boolean;
    onToggleTrash: () => void;
    trashedCount: number;
}

/**
 * The notes rail: a flat list of pages, indented by depth.
 *
 * Titles only, deliberately. The old page spent a 280px column and most of the
 * viewport on stat tiles and card previews; here the list only has to make each
 * page findable, so 244px of monospace text is enough and the page gets
 * everything else.
 */
const NotesSidebar: React.FC<NotesSidebarProps> = ({
    rows,
    tags,
    query,
    onQueryChange,
    activeId,
    activeTag,
    onTagChange,
    onSelect,
    onCreate,
    creating,
    showTrash,
    onToggleTrash,
    trashedCount,
}) => {
    return (
        <aside className="notes-rail">
            <div className="search-container notes-search">
                <div className="search-input-wrapper">
                    <Search className="search-input-icon" />
                    <input
                        type="text"
                        value={query}
                        onChange={event => onQueryChange(event.target.value)}
                        className="search-input"
                        placeholder="Search"
                        aria-label="Search notes"
                    />
                    {query && (
                        <button
                            type="button"
                            className="search-clear-btn"
                            onClick={() => onQueryChange('')}
                            aria-label="Clear search"
                        >
                            <X />
                        </button>
                    )}
                </div>
            </div>

            <button type="button" className="notes-new-btn" onClick={onCreate} disabled={creating}>
                <Plus size={14} />
                {creating ? 'Creating...' : 'New note'}
            </button>

            {tags.length > 0 && (
                <div className="notes-rail-group">
                    <div className="notes-tag-row">
                        {tags.map(tag => (
                            <button
                                type="button"
                                key={tag}
                                className={`notes-chip${activeTag === tag ? ' notes-chip--on' : ''}`}
                                onClick={() => onTagChange(activeTag === tag ? null : tag)}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <nav className="notes-rail-list" aria-label="Notes">
                {rows.length === 0 ? (
                    <p className="notes-rail-empty">
                        <StickyNote size={18} />
                        {query || activeTag ? 'No matches' : 'No notes yet'}
                    </p>
                ) : (
                    <ul className="notes-rail-items">
                        {rows.map(({ note, depth }) => {
                            const title = note.title?.trim() || 'Untitled';
                            const isActive = note.id === activeId;
                            return (
                                <li key={note.id}>
                                    <button
                                        type="button"
                                        // Indent by depth rather than nesting the markup, so
                                        // the row keeps one height and the rail stays cheap to
                                        // scroll however deep the tree goes.
                                        style={{ paddingLeft: `${0.55 + depth * 0.6}rem` }}
                                        className={`notes-rail-item${isActive ? ' notes-rail-item--active' : ''}${
                                            !note.title?.trim() ? ' notes-rail-item--untitled' : ''
                                        }`}
                                        onClick={() => onSelect(note.id!)}
                                        aria-current={isActive ? 'page' : undefined}
                                        title={title}
                                    >
                                        {note.notes_icon && (
                                            <span className="notes-rail-item-icon">{note.notes_icon}</span>
                                        )}
                                        <span className="notes-rail-item-title">{title}</span>
                                        {note.is_pinned && <span className="notes-rail-item-dot" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </nav>

            {trashedCount > 0 && (
                <button
                    type="button"
                    className={`notes-trash-btn${showTrash ? ' notes-trash-btn--on' : ''}`}
                    onClick={onToggleTrash}
                >
                    {showTrash ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                    {showTrash ? 'Back to notes' : `Trash (${trashedCount})`}
                </button>
            )}
        </aside>
    );
};

export default NotesSidebar;
