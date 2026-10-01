import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StickyNote } from 'lucide-react';
import Title from '../Title';
import LoadingSpinner from '../LoadingSpinner';
import NotesSidebar from './NotesSidebar';
import NoteEditorPane from './NoteEditorPane';
import type { Note } from '../../services/noteService';
import { useCreateNote, useNotes } from '../../hooks/useNotes';
import { stripHtml } from '../../utils/noteContent';

/**
 * The notes workspace: page titles on the left, the open page on the right.
 *
 * Both /Notes and /Notes/:id render this. The route decides which page is open,
 * and a bare /Notes opens the most recently touched one, so there is never a
 * landing state that shows a list without a page beside it.
 */
const NotesWorkspace: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const notesQuery = useNotes();
    const createNote = useCreateNote();

    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState(false);

    const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);

    const visibleNotes = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matched = q
            ? notes.filter(note =>
                  `${note.title ?? ''} ${stripHtml(note.content)}`.toLowerCase().includes(q),
              )
            : notes;
        // Pinned first, then newest page.
        //
        // Deliberately created_at rather than updated_at: autosave stamps
        // updated_at on every idle pause, so a last-edited sort makes the rail
        // reshuffle under the caret every time the user pauses to think. Ordering
        // by creation keeps the list still while a page is being written in; the
        // pane's own meta line reports how long ago the page was last touched.
        return [...matched].sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return Number(b.is_pinned) - Number(a.is_pinned);
            return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
        });
    }, [notes, query]);

    // Which page is open. The route wins, so a note stays deep-linkable and Back
    // has a step to return to; otherwise the newest page opens, which means
    // /Notes never shows a list without a page beside it.
    const activeNote: Note | null = useMemo(() => {
        if (id) return notes.find(note => note.id === id) ?? null;
        return visibleNotes[0] ?? notes[0] ?? null;
    }, [id, notes, visibleNotes]);

    const handleSelect = (noteId: string) => {
        navigate(`/Notes/${noteId}`);
    };

    const handleCreate = () => {
        setCreating(true);
        // The row is inserted before the editor opens, so the user lands in a
        // live blank page rather than a form they still have to start filling in.
        createNote.mutate(
            { title: '', content: '' },
            {
                onSuccess: note => {
                    setCreating(false);
                    navigate(`/Notes/${note.id}`);
                },
                onError: () => setCreating(false),
            },
        );
    };

    if (notesQuery.isLoading) {
        return (
            <div className="books-page-wrapper">
                <Title title="Notes" />
                <LoadingSpinner />
            </div>
        );
    }

    const showListOnly = !activeNote;

    return (
        <div className="books-page-wrapper">
            <Title title={activeNote?.title?.trim() || 'Notes'} />

            <div className={`notes-workspace${showListOnly ? ' notes-workspace--list-only' : ''}`}>
                <NotesSidebar
                    notes={visibleNotes}
                    query={query}
                    onQueryChange={setQuery}
                    activeId={activeNote?.id}
                    onSelect={handleSelect}
                    onCreate={handleCreate}
                    creating={creating}
                />

                <section className="notes-pane">
                    {activeNote ? (
                        // Keyed by id so opening a different page remounts the
                        // editor with a fresh document instead of reconciling one
                        // note's content into another's.
                        <NoteEditorPane
                            key={activeNote.id}
                            note={activeNote}
                            onDeleted={() => navigate('/Notes', { replace: true })}
                            onClose={() => navigate('/Notes')}
                        />
                    ) : (
                        <div className="notes-pane-blank">
                            <StickyNote size={40} className="notes-pane-blank-icon" />
                            <p className="notes-pane-blank-title">
                                {notes.length === 0 ? 'Nothing here yet' : 'Select a page'}
                            </p>
                            <p className="notes-pane-blank-text">
                                {notes.length === 0
                                    ? 'Create a page to start writing. Type "/" inside it for blocks.'
                                    : 'Pick a title from the list to open it.'}
                            </p>
                            {notes.length === 0 && (
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
