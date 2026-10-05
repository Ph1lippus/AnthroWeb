import React, { useRef, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpToLine,
    ChevronDown,
    ChevronRight,
    Copy,
    CornerDownRight,
    FolderPlus,
    MoreHorizontal,
    Pin,
    Plus,
    RotateCcw,
    Search,
    StickyNote,
    Trash2,
    X,
} from 'lucide-react';
import type { DropMode, NoteTreeRow } from '../../utils/noteTree';
import { isFolded, nextSibling, previousSibling, rowIndex } from '../../utils/noteTree';
import type { Note } from '../../services/noteService';
import NoteIconBadge from './NoteIconBadge';
import { hasNoteColor, resolveNoteColor } from '../../utils/noteColors';

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
    /**
     * Ids whose branches are folded. Held above so the twisty and the drop maths
     * cannot disagree about which rows are on screen.
     */
    unfolded: ReadonlySet<string>;
    onToggleCollapse: (id: string) => void;
    onRename: (id: string, title: string) => void;
    onTogglePin: (note: Note) => void;
    onDuplicate: (note: Note) => void;
    onCreateChild: (parentId: string) => void;
    onTrash: (note: Note) => void;
    /**
     * A drag, or one of the menu's move entries, landing `dragId` on `targetId`.
     *
     * One handler for both on purpose. HTML5 drag and drop needs a mouse, so on a
     * phone the menu's Move/Nest/Promote entries are the only route to a reorder
     * -- and two code paths that worked out a different parent would leave two
     * different lists depending on which one was used.
     */
    onMove: (dragId: string, targetId: string, mode: DropMode) => void;
    /** Take a page out of its parent and back to the top level. */
    onPromote: (id: string) => void;
}

/**
 * The notes rail: a tree of pages, indented by depth.
 *
 * Titles only, deliberately. The old page spent a 280px column and most of the
 * viewport on stat tiles and card previews; here the list only has to make each
 * page findable, so a narrow column of monospace text is enough and the page
 * gets everything else.
 *
 * Everything that acts on a page hangs off its row rather than off the editor,
 * because on a narrow screen the editor and this list are never on screen at the
 * same time. A page has to be renameable, nestable and throwable-away without
 * being opened.
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
    unfolded,
    onToggleCollapse,
    onRename,
    onTogglePin,
    onDuplicate,
    onCreateChild,
    onTrash,
    onMove,
    onPromote,
}) => {
    // Which row's action menu is open, if any. A single id rather than a Set:
    // only one is ever open, and two overlapping menus in a column this narrow
    // would cover the rows either side of them.
    const [menuFor, setMenuFor] = useState<string | null>(null);
    // The row being renamed and the text in its input. Held here rather than
    // written through on every keystroke, so a rename is one write when it is
    // committed instead of one per character.
    const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
    // The page being dragged, and the row it is currently over.
    const [dragging, setDragging] = useState<string | null>(null);
    const [hover, setHover] = useState<{ id: string; mode: DropMode } | null>(null);
    // Stops the commit-on-blur writing a second time after the commit-on-Enter
    // that precedes it: Enter writes the title and takes the input out of the
    // DOM, which fires a blur.
    const committedRef = useRef(false);
    // The live DOM node of each row, so a drag can measure where in the row the
    // pointer is without asking React to re-render on every pointer move.
    const rowNodes = useRef<Record<string, HTMLLIElement | null>>({});

    // Stale-target cleanup, derived rather than done in an effect.
    //
    // A menu or a drop indicator can be left pointing at a row that is no longer
    // drawn -- a rename committed, a search narrowed, a branch folded -- and the
    // obvious fix is an effect that clears it. That is a second render for
    // something knowable during this one, so the answer is computed here instead
    // and the state keeps whatever it was holding; if the row comes back, so does
    // the menu, which is the more useful of the two behaviours.
    const openMenu = menuFor && rows.some(row => row.note.id === menuFor) ? menuFor : null;
    const dropOver = hover && rows.some(row => row.note.id === hover.id) ? hover : null;

    /**
     * Which part of a row the pointer is over: the top and bottom thirds mean
     * "beside it", the middle means "inside it".
     *
     * Thirds of the row rather than a fixed number of pixels, so the three bands
     * stay the same size however tall the row has grown. The whole row is also
     * kept as the drop target even when the drop would be refused, so a drag over
     * a page's own subtree still reads as "no" rather than as nothing happening
     * at all.
     */
    const dropModeAt = (id: string, clientY: number): DropMode => {
        const box = rowNodes.current[id]?.getBoundingClientRect();
        if (!box || box.height === 0) return 'after';
        const offset = (clientY - box.top) / box.height;
        if (offset < 1 / 3) return 'before';
        if (offset > 2 / 3) return 'after';
        return 'into';
    };

    const beginRename = (note: Note) => {
        setMenuFor(null);
        committedRef.current = false;
        setEditing({ id: note.id!, value: note.title ?? '' });
    };

    const commitRename = () => {
        if (!editing || committedRef.current) return;
        committedRef.current = true;
        const { id, value } = editing;
        setEditing(null);
        // Written even when the text is unchanged. Renaming an untitled page to
        // "Untitled" is a real title, and skipping the write because the string
        // compared equal to the placeholder would make it impossible to set.
        onRename(id, value.trim());
    };

    const cancelRename = () => {
        committedRef.current = true;
        setEditing(null);
    };

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
                        {rows.map(row => {
                            const { note, depth, childCount } = row;
                            const id = note.id!;
                            const title = note.title?.trim() || 'Untitled';
                            const isActive = note.id === activeId;
                            // A branch starts folded; the set holds the ones that were opened.
                            const isCollapsed = isFolded(row, unfolded);
                            const isEditing = editing?.id === id;
                            const index = rowIndex(rows, id);
                            const prev = previousSibling(rows, index);
                            const next = nextSibling(rows, index);

                            return (
                                <li
                                    key={id}
                                    ref={element => {
                                        rowNodes.current[id] = element;
                                    }}
                                    className={`notes-rail-row${isActive ? ' notes-rail-row--active' : ''}${
                                        isEditing ? ' notes-rail-row--editing' : ''
                                    }${dragging === id ? ' notes-rail-row--dragging' : ''}${
                                        dropOver?.id === id
                                            ? ` notes-rail-row--drop-${dropOver.mode}`
                                            : ''
                                    }`}
                                    // Indent the row rather than nesting the markup, so it
                                    // keeps one height and the rail stays cheap to scroll
                                    // however deep the tree goes.
                                    style={{ paddingLeft: `${0.25 + depth * 0.7}rem` }}
                                    draggable={!isEditing && !openMenu}
                                    onDragStart={event => {
                                        setDragging(id);
                                        setMenuFor(null);
                                        event.dataTransfer.effectAllowed = 'move';
                                        // Firefox will not start a drag with no payload.
                                        event.dataTransfer.setData('text/plain', id);
                                    }}
                                    onDragOver={event => {
                                        if (!dragging || dragging === id) return;
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = 'move';
                                        setHover({ id, mode: dropModeAt(id, event.clientY) });
                                    }}
                                    onDragLeave={() =>
                                        setHover(current => (current?.id === id ? null : current))
                                    }
                                    onDrop={event => {
                                        event.preventDefault();
                                        const from =
                                            dragging || event.dataTransfer.getData('text/plain');
                                        const mode =
                                            dropOver?.id === id ? dropOver.mode : dropModeAt(id, event.clientY);
                                        setDragging(null);
                                        setHover(null);
                                        if (from && from !== id) onMove(from, id, mode);
                                    }}
                                    onDragEnd={() => {
                                        setDragging(null);
                                        setHover(null);
                                    }}
                                >
                                    {/* Only drawn on a page that has children. A leaf still gets the slot, filled
                                        with an empty box, so every title starts at the same x and
                                        the list does not shuffle sideways as branches open and
                                        close. */}
                                    {childCount > 0 ? (
                                        <button
                                            type="button"
                                            className="notes-rail-twisty"
                                            onClick={() => onToggleCollapse(id)}
                                            aria-expanded={!isCollapsed}
                                            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${title}`}
                                        >
                                            {isCollapsed ? (
                                                <ChevronRight size={13} />
                                            ) : (
                                                <ChevronDown size={13} />
                                            )}
                                        </button>
                                    ) : (
                                        <span className="notes-rail-twisty notes-rail-twisty--leaf" />
                                    )}

                                    {/* The title is a button, except while it is being renamed
                                        -- then an input stands in its place. Swapping the
                                        element rather than nesting one inside the other,
                                        because a focusable field inside a button is invalid
                                        and cannot be tabbed to. */}
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            className="notes-rail-edit"
                                            value={editing.value}
                                            autoFocus
                                            aria-label={`Rename ${title}`}
                                            onChange={event =>
                                                setEditing(current =>
                                                    current
                                                        ? { ...current, value: event.target.value }
                                                        : current,
                                                )
                                            }
                                            onBlur={commitRename}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    commitRename();
                                                } else if (event.key === 'Escape') {
                                                    event.preventDefault();
                                                    cancelRename();
                                                }
                                            }}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            className={`notes-rail-item${
                                                isActive ? ' notes-rail-item--active' : ''
                                            }${!note.title?.trim() ? ' notes-rail-item--untitled' : ''}`}
                                            onClick={() => onSelect(id)}
                                            onDoubleClick={() => beginRename(note)}
                                            aria-current={isActive ? 'page' : undefined}
                                            data-tip={title}
                                            // To the right of the rail, not under it. The rail
                                            // is against the left edge of the window, so a
                                            // tip placed under the icon would sit on top of
                                            // the navigation rail; the app's own sidebar
                                            // places its tips at the same offset for the
                                            // same reason.
                                            data-tip-side="right"
                                        >
                                            {/* The colour bar comes before the icon
                                                rather than after the title, so a row's
                                                icon and its colour stay on the same
                                                leading edge and the text block does
                                                not shift when either is added. */}
                                            {hasNoteColor(note.notes_color) && (
                                                <span
                                                    className="notes-rail-item-swatch"
                                                    style={{
                                                        ['--note-rail-swatch' as string]:
                                                            resolveNoteColor(note.notes_color).solid,
                                                    } as React.CSSProperties}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <NoteIconBadge
                                                value={note.notes_icon}
                                                color={note.notes_color}
                                                showTip={false}
                                            />
                                            <span className="notes-rail-item-title">{title}</span>
                                            {note.is_pinned && <span className="notes-rail-item-dot" />}
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className={`notes-rail-more${
                                            openMenu === id ? ' notes-rail-more--on' : ''
                                        }`}
                                        onClick={() => setMenuFor(current => (current === id ? null : id))}
                                        aria-label={`Actions for ${title}`}
                                        aria-haspopup="menu"
                                        aria-expanded={openMenu === id}
                                    >
                                        <MoreHorizontal size={14} />
                                    </button>

                                    {openMenu === id && (
                                        <div className="notes-rail-menu" role="menu">
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setMenuFor(null);
                                                    onTogglePin(note);
                                                }}
                                            >
                                                <Pin size={13} />
                                                {note.is_pinned ? 'Unpin' : 'Pin'}
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setMenuFor(null);
                                                    onCreateChild(id);
                                                }}
                                            >
                                                <FolderPlus size={13} />
                                                New page inside
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setMenuFor(null);
                                                    onDuplicate(note);
                                                }}
                                            >
                                                <Copy size={13} />
                                                Duplicate
                                            </button>

                                            <span className="notes-rail-menu-sep" />

                                            {/* The touch route to a reorder. The three below
                                                are the same handler the drag uses, aimed at
                                                the row above or below instead of at a
                                                pointer position. */}
                                            <button
                                                type="button"
                                                role="menuitem"
                                                disabled={!prev}
                                                onClick={() => {
                                                    if (!prev) return;
                                                    setMenuFor(null);
                                                    onMove(id, prev.note.id!, 'before');
                                                }}
                                            >
                                                <ArrowUp size={13} />
                                                Move up
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                disabled={!next}
                                                onClick={() => {
                                                    if (!next) return;
                                                    setMenuFor(null);
                                                    onMove(id, next.note.id!, 'after');
                                                }}
                                            >
                                                <ArrowDown size={13} />
                                                Move down
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                disabled={!prev}
                                                onClick={() => {
                                                    if (!prev) return;
                                                    setMenuFor(null);
                                                    onMove(id, prev.note.id!, 'into');
                                                }}
                                            >
                                                <CornerDownRight size={13} />
                                                Nest under previous
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                disabled={depth === 0}
                                                onClick={() => {
                                                    setMenuFor(null);
                                                    onPromote(id);
                                                }}
                                            >
                                                <ArrowUpToLine size={13} />
                                                Promote to top level
                                            </button>

                                            <span className="notes-rail-menu-sep" />

                                            <button
                                                type="button"
                                                role="menuitem"
                                                className="notes-rail-menu-item--danger"
                                                onClick={() => {
                                                    setMenuFor(null);
                                                    onTrash(note);
                                                }}
                                            >
                                                <Trash2 size={13} />
                                                Move to trash
                                            </button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </nav>

            {/* Always rendered, never behind a count.
                This one button is both "open the trash" and "leave the trash",
                and hiding it when the trash is empty meant that emptying the
                trash from inside the trash view removed the only way out of it.
                The count is still there when there is something to count. */}
            <button
                type="button"
                className={`notes-trash-btn${showTrash ? ' notes-trash-btn--on' : ''}`}
                onClick={onToggleTrash}
                aria-pressed={showTrash}
            >
                {showTrash ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                {showTrash
                    ? 'Back to notes'
                    : trashedCount > 0
                      ? `Trash (${trashedCount})`
                      : 'Trash'}
            </button>
        </aside>
    );
};

export default NotesSidebar;
