import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import Popover from '../Popover';
import {
    ALL_NOTE_ICON_ENTRIES,
    NOTE_ICON_GROUPS,
    findNoteIcons,
    resolveNoteIcon,
    type NoteIcon,
} from '../../utils/noteIcons';

interface NoteIconPickerProps {
    anchor: HTMLElement | null;
    onClose: () => void;
    value: string;
    onChange: (id: string | null) => void;
}

const RECENTS_KEY = 'notes:icon-recents';

const readRecents = (): string[] => {
    try {
        const raw = window.localStorage.getItem(RECENTS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter(v => typeof v === 'string') : [];
    } catch {
        return [];
    }
};

const writeRecents = (next: string[]) => {
    try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next.slice(0, 8)));
    } catch {
        // ignore
    }
};

const NoteIconPicker: React.FC<NoteIconPickerProps> = ({ anchor, onClose, value, onChange }) => {
    const [query, setQuery] = useState('');
    const [recents, setRecents] = useState<string[]>(() => readRecents());

    const handleChange = (id: string | null) => {
        onChange(id);
        if (id) {
            setRecents(prev => {
                const next = [id, ...prev.filter(x => x !== id)].slice(0, 8);
                writeRecents(next);
                return next;
            });
        }
    };

    const current = resolveNoteIcon(value);

    // Curated groups, accepting either `{ids}` shape.
    const grouped = useMemo(() => {
        if (query.trim()) return null;
        return NOTE_ICON_GROUPS.map(entry => ({
            group: entry.group,
            icons: entry.ids
                .map(id => (ALL_NOTE_ICON_ENTRIES as NoteIcon[]).find(x => x.id === id))
                .filter((x): x is NoteIcon => !!x),
        })).filter(entry => entry.icons.length > 0);
    }, [query]);

    const flat = useMemo(() => {
        if (!query.trim()) return null;
        return findNoteIcons(query);
    }, [query]);

    const total = grouped
        ? grouped.reduce((sum, entry) => sum + entry.icons.length, 0)
        : (flat?.length ?? 0);

    const recentIcons = useMemo(() => {
        return recents
            .map(id => (ALL_NOTE_ICON_ENTRIES as NoteIcon[]).find(x => x.id === id))
            .filter((x): x is NoteIcon => !!x);
    }, [recents]);

    const renderIcon = (icon: NoteIcon) => {
        const selected = current?.id === icon.id;
        const Icon = icon.Icon;
        return (
            <button
                key={icon.id}
                type="button"
                className={`note-icon-tile${selected ? ' note-icon-tile--on' : ''}`}
                onClick={() => handleChange(icon.id)}
                aria-pressed={selected}
                data-tip={icon.label}
                aria-label={`Page icon: ${icon.label}`}
            >
                <Icon size={17} aria-hidden="true" />
            </button>
        );
    };

    return (
        <Popover anchor={anchor} onClose={onClose} label="Page icon" className="note-icon-popover">
            <div className="note-icon-search">
                <Search size={13} className="note-icon-search-icon" aria-hidden="true" />
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Escape') {
                            e.stopPropagation();
                            setQuery('');
                        }
                    }}
                    placeholder="Search icons"
                    aria-label="Search icons"
                    autoFocus
                />
                {query && (
                    <button
                        type="button"
                        className="note-icon-search-clear"
                        onClick={() => setQuery('')}
                        aria-label="Clear icon search"
                        data-tip="Clear"
                    >
                        <X size={12} aria-hidden="true" />
                    </button>
                )}
            </div>

            <div className="note-icon-scroll">
                {!query && recentIcons.length > 0 && (
                    <section className="note-icon-group">
                        <h3 className="note-icon-group-label">Recent</h3>
                        <div className="note-icon-grid">{recentIcons.map(renderIcon)}</div>
                    </section>
                )}
                {!query && (grouped ?? []).map(entry => (
                    <section key={entry.group} className="note-icon-group">
                        <h3 className="note-icon-group-label">{entry.group}</h3>
                        <div className="note-icon-grid">{entry.icons.map(renderIcon)}</div>
                    </section>
                ))}
                {query && (
                    <section className="note-icon-group">
                        <h3 className="note-icon-group-label">Matches ({flat?.length ?? 0} of {ALL_NOTE_ICON_ENTRIES.length})</h3>
                        <div className="note-icon-grid">{(flat ?? []).map(renderIcon)}</div>
                    </section>
                )}
                {total === 0 && (
                    <p className="note-icon-empty">
                        Nothing matches <span className="note-icon-empty-query">{query.trim()}</span>
                    </p>
                )}
            </div>

            <div className="note-icon-footer">
                <button
                    type="button"
                    className="note-icon-remove"
                    onClick={() => handleChange(null)}
                    disabled={!current}
                    data-tip={current ? 'Remove the page icon' : 'No icon to remove'}
                    aria-label="Remove the page icon"
                >
                    <X size={12} aria-hidden="true" />
                    Remove
                </button>
            </div>
        </Popover>
    );
};

export default NoteIconPicker;
