import React from 'react';
import { Plus, Search, StickyNote, X } from 'lucide-react';
import type { Note } from '../../services/noteService';

interface NotesSidebarProps {
    notes: Note[];
    query: string;
    onQueryChange: (value: string) => void;
    activeId?: string;
    onSelect: (id: string) => void;
    onCreate: () => void;
    creating: boolean;
}

/**
 * The notes rail: a flat list of page titles.
 *
 * Titles only, deliberately. The old page spent a 280px column and most of the
 * viewport on stat tiles and card previews; here the list only has to make each
 * page findable, so 240px of monospace text is enough and the page itself gets
 * everything else.
 */
const NotesSidebar: React.FC<NotesSidebarProps> = ({
    notes,
    query,
    onQueryChange,
    activeId,
    onSelect,
    onCreate,
    creating,
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

            <nav className="notes-rail-list" aria-label="Notes">
                {notes.length === 0 ? (
                    <p className="notes-rail-empty">
                        <StickyNote size={18} />
                        {query ? 'No matches' : 'No notes yet'}
                    </p>
                ) : (
                    <ul className="notes-rail-items">
                        {notes.map(note => {
                            const title = note.title?.trim() || 'Untitled';
                            const isActive = note.id === activeId;
                            return (
                                <li key={note.id}>
                                    <button
                                        type="button"
                                        className={`notes-rail-item${isActive ? ' notes-rail-item--active' : ''}${
                                            !note.title?.trim() ? ' notes-rail-item--untitled' : ''
                                        }`}
                                        onClick={() => onSelect(note.id!)}
                                        aria-current={isActive ? 'page' : undefined}
                                        title={title}
                                    >
                                        <span className="notes-rail-item-title">{title}</span>
                                        {note.is_pinned && <span className="notes-rail-item-dot" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </nav>
        </aside>
    );
};

export default NotesSidebar;
