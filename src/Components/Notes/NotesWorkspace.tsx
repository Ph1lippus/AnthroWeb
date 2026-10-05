import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, RotateCcw, StickyNote, Trash2 } from 'lucide-react';
import Title from '../Title';
import LoadingSpinner from '../LoadingSpinner';
import ConfirmModal from '../ConfirmModal';
import NotesSidebar from './NotesSidebar';
import NoteEditorPane from './NoteEditorPane';
import NoteIconBadge from './NoteIconBadge';
import QuickSwitcher from './QuickSwitcher';
import type { Note } from '../../services/noteService';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
    useCreateNote,
    useDeleteNoteForever,
    useDuplicateNote,
    useMoveNote,
    useNotes,
    useRenameNote,
    useRestoreNote,
    useToggleNotePin,
    useTrashNote,
    useTrashedNotes,
} from '../../hooks/useNotes';
import { stripHtml } from '../../utils/noteContent';
import type { DropMode } from '../../utils/noteTree';
import {
    allTags,
    buildNoteTree,
    dropPlacement,
    positionOf,
    promotePlacement,
    visibleRows,
} from '../../utils/noteTree';

/**
 * Below this the rail and the page cannot both be on screen usefully, so they
 * take turns.
 *
 * Matches the breakpoint the notes CSS splits at, which is wider than the app's
 * `useIsMobile` (768px) on purpose: at 900px the rail has already become a
 * cramped horizontal strip, and a strip of titles you have to scroll sideways
 * to find a page in is not a list of pages.
 */
const NARROW_QUERY = '(max-width: 900px)';

/** Which branches the reader has opened. Survives a reload, because a fold is a
 *  decision about how much is on screen and losing it on refresh means re-folding
 *  the same tree every time the page is opened.
 *
 *  What is kept is the exceptions, not the rule. Branches start folded, so the
 *  stored list is "the ones I opened" -- storing the folded ones instead would
 *  leave a branch that had never been touched with no state at all, and it would
 *  come back open. */
const UNFOLDED_KEY = 'notes:unfoldedBranches';

const readUnfolded = (): ReadonlySet<string> => {
    try {
        const raw = window.localStorage.getItem(UNFOLDED_KEY);
        if (!raw) return new Set();
        const parsed: unknown = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : []);
    } catch {
        return new Set();
    }
};

const writeUnfolded = (unfolded: ReadonlySet<string>) => {
    try {
        window.localStorage.setItem(UNFOLDED_KEY, JSON.stringify([...unfolded]));
    } catch {
        // Private browsing or a full quota: folding still works for this visit.
    }
};

/**
 * The notes workspace: pages down a rail, the open page on the right.
 *
 * Both /Notes and /Notes/:id render this. The route decides which page is open,
 * and on a wide screen a bare /Notes opens the most recently touched one, so
 * there is never a landing state that shows a list without a page beside it.
 *
 * On a narrow one it is the other way round: the list is the landing state and
 * a page replaces it, because two panes side by side on a phone means neither
 * is readable. That is still the route deciding -- /Notes is the list,
 * /Notes/:id is the page -- so Back works and a note stays deep-linkable.
 */
const NotesWorkspace: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const narrow = useMediaQuery(NARROW_QUERY);

    const notesQuery = useNotes();
    const trashedQuery = useTrashedNotes();
    const createNote = useCreateNote();
    const restoreNote = useRestoreNote();
    const deleteForever = useDeleteNoteForever();
    const renameNote = useRenameNote();
    const togglePin = useToggleNotePin();
    const duplicateNote = useDuplicateNote();
    const trashNote = useTrashNote();
    const moveNote = useMoveNote();

    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState(false);
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [showTrash, setShowTrash] = useState(false);
    const [pendingRestore, setPendingRestore] = useState<Note | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
    // A page the rail asked to throw away, held until it is confirmed. Separate
    // from `pendingDelete`, which is the irreversible delete inside the trash
    // view: same shape, different promise, so a single confirmation cannot be
    // reused for both without the wording lying about what will happen.
    const [pendingTrash, setPendingTrash] = useState<Note | null>(null);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    // Branches the reader has opened, by page id. Everything else with children is
    // folded, which is why this is the exception list rather than the folded one.
    const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(readUnfolded);
    // Session-only, and open on every visit. Persisting it was the wrong call in the
    // direction it could fail: a rail closed once left the page with no list at all,
    // and the only way back was the button in the header, which reads as a control
    // for the note rather than for the sidebar.
    const [railHidden, setRailHidden] = useState(false);

    const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
    // The ids that exist right now, or undefined while the query is still in
    // flight -- undefined meaning "not known yet" rather than "none exist", which
    // is the difference between pruning a stale fold and wiping every fold.
    const liveNoteIds = useMemo(
        () => (notesQuery.data ? new Set(notesQuery.data.map(note => note.id)) : undefined),
        [notesQuery.data],
    );
    const trashed = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data]);

    // Searchable text, built once per notes change instead of once per keystroke.
    // stripHtml uses DOMParser, so filtering over it directly meant parsing every
    // note's markup on every character typed into the search box.
    const searchIndex = useMemo(() => {
        const index = new Map<string, string>();
        for (const note of notes) {
            index.set(
                note.id ?? '',
                `${note.title ?? ''} ${stripHtml(note.content)}`.toLowerCase(),
            );
        }
        return index;
    }, [notes]);

    const tags = useMemo(() => allTags(notes), [notes]);

    // The tree is built from the filtered set, so searching collapses the
    // hierarchy to the matching branches rather than hiding rows and leaving
    // children orphaned under a parent that is no longer there.
    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return buildNoteTree(
            notes.filter(note => {
                if (activeTag && !(note.notes_tags ?? []).includes(activeTag)) return false;
                if (!q) return true;
                return (searchIndex.get(note.id ?? '') ?? '').includes(q);
            }),
        );
    }, [notes, query, activeTag, searchIndex]);

    // What the rail actually draws: the same tree with folded branches removed.
    // Kept separate from `rows` rather than folded into it, because the reorder
    // arithmetic needs every row -- including the ones currently hidden -- to
    // work out where a page lands among its new siblings.
    const visible = useMemo(() => visibleRows(rows, unfolded), [rows, unfolded]);

    // Which page is open. The route wins, so a note stays deep-linkable and Back has
    // a step to return to. With no route at all, nothing is open -- on any screen.
    //
    // This used to open the newest page on a wide one, on the reasoning that the
    // list should never be shown without a page beside it. That put a page in front
    // of nobody who had asked for it: reopening Notes threw up whatever was most
    // recent rather than the list, so reading and browsing were the same action and
    // the first click after reopening always went to closing a page instead. The
    // pane already has a blank state for exactly this, and it says what to do.
    const activeNote: Note | null = useMemo(() => {
        if (!id) return null;
        return notes.find(note => note.id === id) ?? null;
    }, [id, notes]);

    /**
     * Whether the rail is on screen.
     *
     * Narrow: only when no page is open, so the list and the page take turns
     * rather than sharing the width. Wide: always, unless it was closed.
     */
    const showRail = narrow ? !id : !railHidden;
    /** The mirror of it. On a narrow screen exactly one of the two is drawn. */
    const showPane = !narrow || !!id;

    // Stable, because it goes into the rail's props memo below and a fresh
    // function each render would rebuild that memo on every keystroke anywhere in
    // the workspace.
    const handleSelect = useCallback((noteId: string) => {
        navigate(`/Notes/${noteId}`);
    }, [navigate]);

    const handleToggleRail = useCallback(() => {
        setRailHidden(current => !current);
    }, []);

    /**
     * Sweeps out ids for pages that are gone, then stores the set.
     *
     * Done on the way to writing rather than in an effect on the notes: a deleted
     * page's id is never reused, so an orphan would sit in the set forever and it
     * would only ever grow. Doing it here also means the sweep cannot run against
     * an empty list while the query is still in flight.
     */
    const commitUnfolded = useCallback(
        (next: Set<string>): Set<string> => {
            if (liveNoteIds) {
                for (const id of next) if (!liveNoteIds.has(id)) next.delete(id);
            }
            writeUnfolded(next);
            return next;
        },
        [liveNoteIds],
    );

    const handleToggleCollapse = useCallback(
        (noteId: string) => {
            setUnfolded(current => {
                const next = new Set(current);
                if (!next.delete(noteId)) next.add(noteId);
                return commitUnfolded(next);
            });
        },
        [commitUnfolded],
    );

    const handleCreate = useCallback(() => {
        setCreating(true);
        // The row is inserted before the editor opens, so the user lands in a
        // live blank page rather than a form they still have to start filling in.
        createNote.mutate(
            { title: '', content: '' },
            {
                onSuccess: note => {
                    setCreating(false);
                    setShowTrash(false);
                    navigate(`/Notes/${note.id}`);
                },
                onError: () => setCreating(false),
            },
        );
    }, [createNote, navigate]);

    // A page inside another one. Placed past its new siblings rather than at
    // zero, so it lands under the pages already in there instead of above them.
    //
    // Read off the unfiltered list rather than `rows`: rows is the tree as the
    // search box and tag filter have narrowed it, and a sibling the filter hid
    // would be stepped over.
    const handleCreateChild = useCallback(
        (parentId: string) => {
            if (!notes.some(note => note.id === parentId)) return;
            let last = 0;
            for (const note of notes) {
                if (note.notes_parent_id === parentId) {
                    last = Math.max(last, positionOf(note));
                }
            }
            setShowTrash(false);
            createNote.mutate(
                { title: '', content: '', notes_parent_id: parentId, notes_position: last + 1 },
                { onSuccess: note => navigate(`/Notes/${note.id}`) },
            );
        },
        [notes, createNote, navigate],
    );

    /**
     * A drag, or one of the menu's move entries, landing one page on another.
     *
     * Resolves the whole move here rather than in the rail, because this is where
     * the unfiltered tree and the mutation live. `dropPlacement` returns null for a
     * drop that would make a cycle -- a page onto itself or into its own subtree
     * -- and there is deliberately no message: the indicator never showed a drop
     * was possible in the first place, so refusing it silently is consistent.
     *
     * A drop "into" a folded branch unfolds it, or the page would arrive
     * somewhere the reader cannot see.
     */
    const handleMove = useCallback(
        (dragId: string, targetId: string, mode: DropMode) => {
            const placement = dropPlacement(rows, dragId, targetId, mode);
            if (!placement) return;
            if (mode === 'into') {
                setUnfolded(current => {
                    if (current.has(targetId)) return current;
                    const next = new Set(current);
                    next.add(targetId);
                    return commitUnfolded(next);
                });
            }
            moveNote.mutate({ id: dragId, ...placement });
        },
        [rows, moveNote, commitUnfolded],
    );

    const handlePromote = useCallback(
        (noteId: string) => {
            const placement = promotePlacement(rows, noteId);
            if (!placement) return;
            moveNote.mutate({ id: noteId, ...placement });
        },
        [rows, moveNote],
    );

    const handleTrash = useCallback((note: Note) => {
        // Only asked for from the rail, where the page being thrown away may well
        // be the one on screen.
        setPendingTrash(note);
    }, []);

    const handleRename = useCallback(
        (id: string, title: string) => renameNote.mutate({ id, title }),
        [renameNote],
    );

    const handleTogglePin = useCallback(
        (note: Note) => togglePin.mutate({ id: note.id!, isPinned: !!note.is_pinned }),
        [togglePin],
    );

    const handleDuplicate = useCallback(
        (note: Note) => duplicateNote.mutate(note),
        [duplicateNote],
    );

    /**
     * Everything both rail call sites pass.
     *
     * The rail is drawn twice -- once for the notes and once for the trash view,
     * which replaces the page pane rather than sitting beside it. Listing the
     * twenty-odd shared props twice is how the two copies drift, and a prop added
     * to one and not the other is a runtime crash rather than a type error,
     * because the second call site spreads nothing.
     */
    const sidebarProps = useMemo(
        () => ({
            tags,
            query,
            onQueryChange: setQuery,
            activeTag,
            onTagChange: setActiveTag,
            onSelect: handleSelect,
            onCreate: handleCreate,
            creating,
            trashedCount: trashed.length,
            unfolded,
            onToggleCollapse: handleToggleCollapse,
            onRename: handleRename,
            onTogglePin: handleTogglePin,
            onDuplicate: handleDuplicate,
            onCreateChild: handleCreateChild,
            onTrash: handleTrash,
            onMove: handleMove,
            onPromote: handlePromote,
        }),
        [
            tags,
            query,
            activeTag,
            handleSelect,
            handleCreate,
            creating,
            trashed.length,
            unfolded,
            handleToggleCollapse,
            handleRename,
            handleTogglePin,
            handleDuplicate,
            handleCreateChild,
            handleTrash,
            handleMove,
            handlePromote,
        ],
    );

    const handleConfirmTrash = () => {
        if (!pendingTrash?.id) return;
        const id = pendingTrash.id;
        trashNote.mutate(id, {
            onSuccess: () => {
                setPendingTrash(null);
                // Leaving the route pointing at a trashed page shows a blank pane
                // with no way back into it.
                navigate('/Notes', { replace: true });
            },
            // Left set, so the confirmation stays up rather than closing over a
            // write that did not happen and looking like the button did nothing.
        });
    };

    // Cmd/Ctrl+K anywhere on the page opens the switcher. Bound on the window
    // rather than the rail so it works with focus in the editor too.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setSwitcherOpen(open => !open);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const handleRestore = () => {
        if (!pendingRestore?.id) return;
        restoreNote.mutate(pendingRestore.id, { onSuccess: () => setPendingRestore(null) });
    };

    const handleDeleteForever = () => {
        if (!pendingDelete?.id) return;
        deleteForever.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
    };

    if (notesQuery.isLoading) {
        return (
            <>
                <Title title="Notes" />
                <LoadingSpinner />
            </>
        );
    }

    // The trash replaces the page pane as well as the list: the rail shows
    // thrown-away pages, and editing one would be meaningless, so the right-hand
    // side becomes the restore/delete view rather than the editor.
    //
    // The rail's own Trash button is how it is entered, so it cannot also be the
    // way out -- hence the Back control in the trash head, which appears exactly
    // where it is the only one: on a narrow screen, where the rail is hidden
    // behind the trash and nothing else on the page leads out.
    if (showTrash) {
        return (
            <>
                <Title title="Notes trash" />
                <div className={`notes-workspace${narrow ? ' notes-workspace--stacked' : ''}`}>
                    {!narrow && (
                        <NotesSidebar
                            {...sidebarProps}
                            // Empty on purpose: this copy of the rail exists only to
                            // carry the search box, the tags and the Trash button, so
                            // the thrown-away pages are not listed beside the live ones.
                            rows={[]}
                            showTrash
                            onToggleTrash={() => setShowTrash(false)}
                        />
                    )}

                    <section className="notes-pane">
                        <div className="note-trash-head">
                            <button
                                type="button"
                                className="note-back-btn"
                                onClick={() => {
                                    setShowTrash(false);
                                    if (narrow) navigate('/Notes');
                                }}
                            >
                                <ChevronLeft size={13} />
                                {narrow ? 'Notes' : 'Back to notes'}
                            </button>
                            <Trash2 size={15} />
                            <span>Trash</span>
                        </div>

                        {trashed.length === 0 ? (
                            <div className="notes-pane-blank">
                                <Trash2 size={34} className="notes-pane-blank-icon" />
                                <p className="notes-pane-blank-title">Trash is empty</p>
                                <p className="notes-pane-blank-text">
                                    Pages you throw away are kept here until you delete them for good.
                                </p>
                            </div>
                        ) : (
                            <div className="note-trash-scroll">
                                <ul className="note-trash-list">
                                    {trashed.map(note => (
                                        <li key={note.id} className="note-trash-row">
                                            <NoteIconBadge
                                                value={note.notes_icon}
                                                color={note.notes_color}
                                            />
                                            <span className="note-trash-text">
                                                <span className="note-trash-title">
                                                    {note.title?.trim() || 'Untitled'}
                                                </span>
                                                <span className="note-trash-date">
                                                    Deleted{' '}
                                                    {note.notes_deleted_at
                                                        ? new Date(note.notes_deleted_at).toLocaleDateString(
                                                              'en-US',
                                                              { month: 'short', day: 'numeric' },
                                                          )
                                                        : 'recently'}
                                                </span>
                                            </span>
                                            <button
                                                type="button"
                                                className="note-action-btn"
                                                onClick={() => setPendingRestore(note)}
                                                data-tip="Put this page back"
                                                aria-label="Put this page back"
                                            >
                                                <RotateCcw size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                className="note-action-btn note-action-btn--danger"
                                                onClick={() => setPendingDelete(note)}
                                                data-tip="Delete for good"
                                                aria-label="Delete for good"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </section>
                </div>

                <ConfirmModal
                    open={!!pendingRestore}
                    title={`Restore "${pendingRestore?.title || 'Untitled'}"?`}
                    confirmLabel="Restore"
                    busy={restoreNote.isPending}
                    onConfirm={handleRestore}
                    onCancel={() => setPendingRestore(null)}
                />
                <ConfirmModal
                    open={!!pendingDelete}
                    title={`Delete "${pendingDelete?.title || 'Untitled'}" for good?`}
                    confirmLabel="Delete forever"
                    danger
                    busy={deleteForever.isPending}
                    onConfirm={handleDeleteForever}
                    onCancel={() => setPendingDelete(null)}
                />
            </>
        );
    }

    const hasAnyNotes = notes.length > 0;

    return (
        <>
            <Title title={activeNote?.title?.trim() || 'Notes'} />

            {/* One modifier for each half of the layout. Stacked is the narrow
                screen, where the rail and the page take turns; no-rail is the wide
                one with the rail closed, where the page takes the whole card. */}
            <div
                className={`notes-workspace${narrow ? ' notes-workspace--stacked' : ''}${
                    showRail ? '' : ' notes-workspace--no-rail'
                }`}
            >
                {/* Kept mounted on the split even while closed, because a rail that
                    unmounts cannot animate shut -- and closing it is the one motion
                    that tells you where the pages went. The stacked layout is left
                    alone: there the rail and the pane are separate route views, not
                    two things sharing a window. */}
                {(showRail || !narrow) && (
                    <NotesSidebar
                        {...sidebarProps}
                        rows={visible}
                        activeId={activeNote?.id}
                        showTrash={false}
                        onToggleTrash={() => setShowTrash(true)}
                    />
                )}

                {showPane && (
                    <section className="notes-pane">
                        {activeNote ? (
                            // Keyed by id so opening a different page remounts the
                            // editor with a fresh document instead of reconciling one
                            // note's content into another's.
                            <NoteEditorPane
                                key={activeNote.id}
                                note={activeNote}
                                allNotes={notes}
                                onDeleted={() => navigate('/Notes', { replace: true })}
                                // Only reachable where the rail is not, which is the
                                // stacked layout. On the split there is nothing to go
                                // back to, so the button does not render there.
                                onClose={narrow ? () => navigate('/Notes') : undefined}
                                // Only on the split. On the stacked layout the rail is
                                // not on screen to be brought back, so the control is
                                // not offered there.
                                railHidden={!showRail}
                                onToggleRail={narrow ? undefined : handleToggleRail}
                            />
                        ) : (
                            <>
                                {/* Reachable on a narrow screen when the route names a
                                    page that is not there -- a stale link, or one that
                                    was thrown away elsewhere. Without this the blank
                                    state below is a dead end with nothing to leave it. */}
                                {narrow && (
                                    <div className="note-pane-bar">
                                        <button
                                            type="button"
                                            className="note-back-btn"
                                            onClick={() => navigate('/Notes')}
                                            aria-label="Back to the page list"
                                        >
                                            <ChevronLeft size={13} />
                                            Pages
                                        </button>
                                        <div className="note-pane-actions" />
                                    </div>
                                )}
                                <div className="notes-pane-blank">
                                    <StickyNote size={40} className="notes-pane-blank-icon" />
                                    <p className="notes-pane-blank-title">
                                        {hasAnyNotes ? 'Select a page' : 'Nothing here yet'}
                                    </p>
                                    <p className="notes-pane-blank-text">
                                        {hasAnyNotes
                                            ? 'Pick a title from the list to open it.'
                                            : 'Create a page to start writing. Type "/" inside it for blocks.'}
                                    </p>
                                    {!hasAnyNotes && (
                                        <button
                                            type="button"
                                            className="btn-action"
                                            onClick={handleCreate}
                                            style={{ marginTop: '0.5rem' }}
                                        >
                                            New note
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                )}
            </div>

            <QuickSwitcher
                open={switcherOpen}
                notes={notes}
                activeId={activeNote?.id}
                onClose={() => setSwitcherOpen(false)}
            />

            {/* The rail's own "Move to trash". Its own modal rather than the one
                below, because that one promises an irreversible delete. */}
            <ConfirmModal
                open={!!pendingTrash}
                title={`Move "${pendingTrash?.title || 'Untitled'}" to the trash?`}
                confirmLabel="Move to trash"
                danger
                busy={trashNote.isPending}
                onConfirm={handleConfirmTrash}
                onCancel={() => setPendingTrash(null)}
            />
        </>
    );
};

export default NotesWorkspace;
