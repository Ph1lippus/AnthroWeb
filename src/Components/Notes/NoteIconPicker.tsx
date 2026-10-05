import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import Popover from '../Popover';
import { NOTE_ICON_GROUPS, resolveNoteIcon, type NoteIcon } from '../../utils/noteIcons';

interface NoteIconPickerProps {
    /** The control it is anchored to. Null keeps it closed. */
    anchor: HTMLElement | null;
    onClose: () => void;
    /** The stored value: a lucide name, or one of the legacy emoji. */
    value: string;
    onChange: (id: string | null) => void;
}

/**
 * The page icon picker.
 *
 * Sixty-odd lucide icons in six sections, with a search box over the top.
 *
 * The search is not decoration at this size. The old picker had sixteen icons in
 * one undifferentiated strip, and the complaint about it was that there were too
 * few *and* that none of them could be found -- adding more without a way to
 * narrow them would have replaced one unusable list with a longer one. Matching on
 * both the icon's name and its group means "code", "study" and "gym" all land on
 * something, which is how people actually look for an icon.
 *
 * Stays open on pick for the same reason the colour picker does: an icon is
 * chosen by comparison, and closing after each one means a reopen per attempt.
 * Removal is the explicit control in the footer rather than "click the same icon
 * again", because a toggle has to be guessed at and a labelled button does not.
 */
const NoteIconPicker: React.FC<NoteIconPickerProps> = ({ anchor, onClose, value, onChange }) => {
    const [query, setQuery] = useState('');

    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return NOTE_ICON_GROUPS;
        // A section that matched nothing is dropped rather than left as a heading
        // over an empty row.
        return NOTE_ICON_GROUPS
            .map(entry => ({
                group: entry.group,
                icons: entry.icons.filter(icon =>
                    icon.label.toLowerCase().includes(needle)
                    || icon.id.toLowerCase().includes(needle)
                    || entry.group.toLowerCase().includes(needle)),
            }))
            .filter(entry => entry.icons.length > 0);
    }, [query]);

    const current = resolveNoteIcon(value);
    const total = groups.reduce((sum, entry) => sum + entry.icons.length, 0);

    const renderIcon = (icon: NoteIcon) => {
        const selected = current?.id === icon.id;
        const Icon = icon.Icon;
        return (
            <button
                key={icon.id}
                type="button"
                className={`note-icon-tile${selected ? ' note-icon-tile--on' : ''}`}
                onClick={() => onChange(icon.id)}
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
                            // Clears the search rather than closing the panel. Escape
                            // already closes it on the document, and stopping that
                            // here would leave no way out of a search that found
                            // nothing -- the one state where closing is least useful.
                            e.stopPropagation();
                            setQuery('');
                        }
                    }}
                    placeholder="Search icons"
                    aria-label="Search icons"
                    // Auto-focused: the panel exists to pick an icon, and reaching for
                    // the keyboard to start typing is what the box is for.
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
                {groups.map(entry => (
                    <section key={entry.group} className="note-icon-group">
                        <h3 className="note-icon-group-label">{entry.group}</h3>
                        <div className="note-icon-grid">{entry.icons.map(renderIcon)}</div>
                    </section>
                ))}
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
                    onClick={() => onChange(null)}
                    // Disabled rather than absent when there is nothing to remove: a
                    // footer whose contents change shape between pages is one more
                    // thing to mis-click, and a visible-disabled control still
                    // answers "can I clear this?" without a hover.
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
