import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { CornerDownLeft, Search, StickyNote } from 'lucide-react';
import type { Note } from '../../services/noteService';
import { noteAncestors } from '../../utils/noteTree';

interface QuickSwitcherProps {
    open: boolean;
    notes: Note[];
    activeId?: string;
    onClose: () => void;
}

interface SearchableNote {
    id: string;
    title: string;
    /** Full breadcrumb, so a page can be found by where it lives. */
    path: string;
    note: Note;
}

const MAX_RESULTS = 12;

/**
 * Cmd/Ctrl+K page switcher.
 *
 * Fuzzy-matched on the title and the breadcrumb together, so "exam" finds
 * "Exam prep" whether it lives at the top level or under "University". The
 * breadcrumb is searchable but the title is weighted well above it, otherwise a
 * page called "Notes" under a folder called "Notes" would outrank everything.
 */
const QuickSwitcher: React.FC<QuickSwitcherProps> = ({ open, notes, activeId, onClose }) => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    // Tracked so the selection can be reset during render rather than from an
    // effect. Resetting in an effect is what this repo's react-hooks lint rules
    // disallow, and it also costs an extra render pass.
    const [lastQuery, setLastQuery] = useState('');
    const [wasOpen, setWasOpen] = useState(open);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // A new query means a different result set, so the old index no longer points
    // anywhere sensible.
    if (query !== lastQuery) {
        setLastQuery(query);
        setSelected(0);
    }

    // Reopening shows the whole list again rather than the last search.
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setQuery('');
            setSelected(0);
        }
    }

    const entries = useMemo<SearchableNote[]>(
        () =>
            notes.map(note => {
                const trail = noteAncestors(notes, note)
                    .map(ancestor => ancestor.title?.trim() || 'Untitled')
                    .reverse();
                return {
                    id: note.id ?? '',
                    title: note.title?.trim() || 'Untitled',
                    path: trail.join(' / '),
                    note,
                };
            }),
        [notes],
    );

    const fuse = useMemo(
        () =>
            new Fuse(entries, {
                keys: [
                    // Title first and weighted higher: it is what people remember.
                    { name: 'title', weight: 3 },
                    { name: 'path', weight: 1 },
                ],
                // Matches a single character anywhere, which is what makes
                // "ex" reach "Exam" but also what makes a one-letter query feel
                // noisy. 0.35 is where that trade sits acceptably.
                threshold: 0.35,
                ignoreLocation: true,
                minMatchCharLength: 1,
            }),
        [entries],
    );

    // fuse.search returns wrapper objects; the menu wants the notes themselves.
    const results = useMemo(
        () =>
            (query.trim()
                ? fuse.search(query).slice(0, MAX_RESULTS).map(result => result.item)
                : entries.slice(0, MAX_RESULTS)),
        [fuse, entries, query],
    );

    // Focus only. The state resets above happen during render, so this effect
    // does nothing but move the caret into a field that now exists.
    useEffect(() => {
        if (!open) return;
        const id = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(id);
    }, [open]);

    // Keep the highlighted row visible as the arrow keys move through it.
    useEffect(() => {
        const node = listRef.current?.children[selected] as HTMLElement | undefined;
        node?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    if (!open) return null;

    const go = (entry: SearchableNote) => {
        onClose();
        navigate(`/Notes/${entry.id}`);
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelected(current => (results.length === 0 ? 0 : (current + 1) % results.length));
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected(current =>
                results.length === 0 ? 0 : (current + results.length - 1) % results.length,
            );
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const entry = results[selected];
            if (entry) go(entry);
        }
    };

    return (
        <div className="import-modal-overlay note-switcher-overlay" onMouseDown={onClose}>
            <div
                className="note-switcher"
                onMouseDown={event => event.stopPropagation()}
                role="dialog"
                aria-label="Switch page"
            >
                <div className="note-switcher-search">
                    <Search size={15} className="note-switcher-icon" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Go to page..."
                        aria-label="Search pages"
                    />
                </div>

                {results.length === 0 ? (
                    <p className="note-switcher-empty">
                        {notes.length === 0 ? 'No pages yet' : `Nothing matches "${query}"`}
                    </p>
                ) : (
                    <ul className="note-switcher-list" ref={listRef}>
                        {results.map((entry, index) => (
                            <li key={entry.id}>
                                <button
                                    type="button"
                                    className={`note-switcher-item${
                                        index === selected ? ' note-switcher-item--active' : ''
                                    }`}
                                    onMouseDown={event => {
                                        event.preventDefault();
                                        go(entry);
                                    }}
                                    onMouseEnter={() => setSelected(index)}
                                >
                                    <StickyNote size={14} className="note-switcher-item-icon" />
                                    <span className="note-switcher-item-text">
                                        <span className="note-switcher-item-title">{entry.title}</span>
                                        {entry.path && (
                                            <span className="note-switcher-item-path">{entry.path}</span>
                                        )}
                                    </span>
                                    {entry.id === activeId && (
                                        <span className="note-switcher-current">open</span>
                                    )}
                                    {index === selected && <CornerDownLeft size={13} />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default QuickSwitcher;
