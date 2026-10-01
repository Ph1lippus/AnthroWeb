import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RotateCcw, StickyNote, Trash2 } from 'lucide-react';
import Title from '../Title';
import LoadingSpinner from '../LoadingSpinner';
import ConfirmModal from '../ConfirmModal';
import NotesSidebar from './NotesSidebar';
import NoteEditorPane from './NoteEditorPane';
import type { Note } from '../../services/noteService';
import {
    useCreateNote,
    useDeleteNoteForever,
    useNotes,
    useRestoreNote,
    useTrashedNotes,
} from '../../hooks/useNotes';
import { stripHtml } from '../../utils/noteContent';
import { allTags, buildNoteTree } from '../../utils/noteTree';

/**
 * The notes workspace: pages down a rail, the open page on the right.
 *
 * Both /Notes and /Notes/:id render this. The route decides which page is open,
 * and a bare /Notes opens the most recently touched one, so there is never a
 * landing state that shows a list without a page beside it.
 */
const NotesWorkspace: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const notesQuery = useNotes();
    const trashedQuery = useTrashedNotes();
    const createNote = useCreateNote();
    const restoreNote = useRestoreNote();
    const deleteForever = useDeleteNoteForever();

    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState(false);
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [showTrash, setShowTrash] = useState(false);
    const [pendingRestore, setPendingRestore] = useState<Note | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Note | null>(null);

    const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
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

    // Which page is open. The route wins, so a note stays deep-linkable and Back
    // has a step to return to; otherwise the newest page opens, which means
    // /Notes never shows a list without a page beside it.
    const activeNote: Note | null = useMemo(() => {
        if (id) return notes.find(note => note.id === id) ?? null;
        return rows[0]?.note ?? notes[0] ?? null;
    }, [id, notes, rows]);

    const handleSelect = (noteId: string) => {
        navigate(`/Notes/${noteId}`);
    };

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
            <div className="books-page-wrapper">
                <Title title="Notes" />
                <LoadingSpinner />
            </div>
        );
    }

    // The trash replaces the page pane as well as the list: the rail shows
    // thrown-away pages, and editing one would be meaningless, so the right-hand
    // side becomes the restore/delete view rather than the editor.
    if (showTrash) {
        return (
            <div className="books-page-wrapper">
                <Title title="Notes trash" />
                <div className="notes-workspace">
                    <NotesSidebar
                        rows={[]}
                        tags={tags}
                        query={query}
                        onQueryChange={setQuery}
                        activeTag={activeTag}
                        onTagChange={setActiveTag}
                        onSelect={handleSelect}
                        onCreate={handleCreate}
                        creating={creating}
                        showTrash
                        onToggleTrash={() => setShowTrash(false)}
                        trashedCount={trashed.length}
                    />

                    <section className="notes-pane">
                        <div className="note-trash-head">
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
                                            <span className="note-trash-icon">
                                                {note.notes_icon ?? <StickyNote size={14} />}
                                            </span>
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
                                                title="Restore"
                                            >
                                                <RotateCcw size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                className="note-action-btn note-action-btn--danger"
                                                onClick={() => setPendingDelete(note)}
                                                title="Delete for good"
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
            </div>
        );
    }

    const hasAnyNotes = notes.length > 0;

    return (
        <div className="books-page-wrapper">
            <Title title={activeNote?.title?.trim() || 'Notes'} />

            <div className="notes-workspace">
                <NotesSidebar
                    rows={rows}
                    tags={tags}
                    query={query}
                    onQueryChange={setQuery}
                    activeId={activeNote?.id}
                    activeTag={activeTag}
                    onTagChange={setActiveTag}
                    onSelect={handleSelect}
                    onCreate={handleCreate}
                    creating={creating}
                    showTrash={showTrash}
                    onToggleTrash={() => setShowTrash(true)}
                    trashedCount={trashed.length}
                />

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
                            onClose={() => navigate('/Notes')}
                        />
                    ) : (
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
                    )}
                </section>
            </div>
        </div>
    );
};

export default NotesWorkspace;
