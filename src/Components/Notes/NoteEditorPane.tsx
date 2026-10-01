import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
    ArrowLeft,
    Check,
    Loader2,
    Palette,
    Pin,
    PinOff,
    Trash2,
} from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import type { Note } from '../../services/noteService';
import { useDeleteNote, useToggleNotePin, useUpdateNote } from '../../hooks/useNotes';
import { NOTE_COLORS, absoluteTime, isBlankNote, relativeTime, wordCount } from '../../utils/noteContent';

// TipTap and ProseMirror are by far the heaviest thing the notes page loads, and
// nothing outside these two routes needs them. Splitting the import keeps them
// out of the main bundle -- the same approach DashboardPage takes for recharts.
const NoteEditor = lazy(() => import('./NoteEditor'));

const AUTOSAVE_DELAY = 1500;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface Pending {
    title: string;
    content: string;
}

interface NoteEditorPaneProps {
    note: Note;
    onDeleted: () => void;
    onClose?: () => void;
}

/**
 * The right half of the notes workspace: one open page, always editable.
 *
 * Open is the same as editing -- there is no read mode and no edit button. The
 * pane owns a local copy of title and content, autosaves it after a pause in
 * typing, and flushes anything still pending when it unmounts.
 *
 * The workspace mounts this with key={note.id}, so switching pages remounts the
 * pane instead of trying to reconcile one document into another. That is what
 * keeps two notes from ever bleeding into each other.
 */
const NoteEditorPane: React.FC<NoteEditorPaneProps> = ({ note, onDeleted, onClose }) => {
    const updateNote = useUpdateNote(note.id);
    const deleteNote = useDeleteNote();
    const togglePin = useToggleNotePin();

    const [title, setTitle] = useState(note.title ?? '');
    const [content, setContent] = useState(note.content ?? '');
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [showColors, setShowColors] = useState(false);
    const [colorError, setColorError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The newest values still owed to the database. A ref rather than state
    // because the unmount flush runs outside the render cycle and must not close
    // over a stale snapshot.
    const pendingRef = useRef<Pending | null>(null);
    // If a write is in flight a newer one waits behind it, rather than racing to
    // the server and landing out of order with the older payload.
    const inFlightRef = useRef(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const persistRef = useRef<(p: Pending) => Promise<void>>(async () => {});
    // Mirrors of the two editable fields: each change handler pairs its own new
    // value with the sibling's current one, and reading the sibling from a ref
    // keeps the two handlers independent of each other's state.
    const titleRef = useRef(title);
    const contentRef = useRef(content);

    useEffect(() => {
        const persist = async (pending: Pending) => {
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            setSaveState('saving');
            try {
                await updateNote.mutateAsync({ title: pending.title, content: pending.content });
                // Only clear if nothing new was typed while this was in flight.
                if (pendingRef.current === pending) {
                    pendingRef.current = null;
                    setSavedAt(new Date().toISOString());
                    setSaveState('saved');
                }
            } catch {
                // The payload stays in pendingRef so the next keystroke retries it
                // instead of silently dropping the edit.
                setSaveState('error');
            } finally {
                inFlightRef.current = false;
            }
        };
        persistRef.current = persist;
    }, [updateNote]);

    const scheduleSave = (nextTitle: string, nextContent: string) => {
        pendingRef.current = { title: nextTitle, content: nextContent };
        setSaveState('dirty');
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            const pending = pendingRef.current;
            if (pending) void persistRef.current(pending);
        }, AUTOSAVE_DELAY);
    };

    // Flush on unmount, and only on a real unmount. Depending on the persist
    // closure here would re-run this effect every render -- the mutation object
    // is a new value each time -- which would flush the debounce on every single
    // keystroke and defeat it.
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            const pending = pendingRef.current;
            if (pending) void persistRef.current(pending);
        };
    }, []);

    const handleTitle = (value: string) => {
        titleRef.current = value;
        setTitle(value);
        scheduleSave(value, contentRef.current);
    };

    const handleContent = (value: string) => {
        contentRef.current = value;
        setContent(value);
        scheduleSave(titleRef.current, value);
    };

    const handleColor = (color: string) => {
        setShowColors(false);
        setColorError(null);
        updateNote.mutate(
            { notes_color: color || null },
            {
                // Surfaced rather than swallowed. This mutation writes a column
                // added by migration 0006, so against a database that has not had
                // it applied every write 4xx's -- and an unhandled mutation error
                // meant the menu simply closed with no visible cause.
                onError: error => {
                    setColorError(`Could not save colour: ${error.message}`);
                },
            },
        );
    };

    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
    const colorButtonRef = useRef<HTMLButtonElement>(null);

    const toggleColors = () => {
        if (showColors) {
            setShowColors(false);
            return;
        }
        const rect = colorButtonRef.current?.getBoundingClientRect();
        if (rect) setMenuPos({ top: rect.bottom + 8, left: rect.left });
        setShowColors(true);
    };

    // Dismiss on Escape or a click elsewhere, the way any popover should behave.
    useEffect(() => {
        if (!showColors) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowColors(false);
        };
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!colorButtonRef.current?.contains(target)) setShowColors(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [showColors]);

    const handleDelete = () => {
        // Clear the pending payload before deleting: unmounting would otherwise
        // flush an update for a row that no longer exists.
        pendingRef.current = null;
        if (timerRef.current) clearTimeout(timerRef.current);
        deleteNote.mutate(note.id!, { onSuccess: onDeleted });
    };

    const saveLabel =
        saveState === 'saving'
            ? 'Saving...'
            : saveState === 'dirty'
              ? 'Unsaved changes'
              : saveState === 'error'
                ? 'Save failed, will retry'
                : savedAt
                  ? `Saved ${relativeTime(savedAt)}`
                  : 'All changes saved';

    const currentColor = note.notes_color ?? '';
    const words = wordCount(content);
    // Captured from the note as it was opened, not from live state: this decides
    // whether the caret goes into the body on mount, and that only makes sense
    // for a page that was still empty when it loaded.
    const isBlank = isBlankNote(note.content);

    return (
        <>
            <div className="note-pane-bar">
                {/* Only reachable below the split breakpoint, where the rail
                    collapses and this becomes the way back to the list. */}
                {onClose && (
                    <button type="button" className="note-back-btn" onClick={onClose}>
                        <ArrowLeft size={14} />
                        <span>All notes</span>
                    </button>
                )}

                <div className="note-pane-actions">
                    {colorError && (
                        <span className="note-inline-error" role="alert">
                            {colorError}
                        </span>
                    )}

                    <span className={`note-save-status note-save-status--${saveState}`}>
                        {saveState === 'saving' && <Loader2 size={12} className="note-spin" />}
                        {saveState === 'saved' && <Check size={12} />}
                        {saveLabel}
                    </span>

                    <div className="note-color-wrap">
                        <button
                            type="button"
                            ref={colorButtonRef}
                            className={`note-action-btn${currentColor ? ' note-action-btn--pinned' : ''}`}
                            onClick={toggleColors}
                            title="Page colour"
                            aria-label="Page colour"
                            aria-expanded={showColors}
                        >
                            <Palette size={14} />
                        </button>
                        {showColors && menuPos && (
                            /* Fixed, not absolute. The pane and workspace both clip
                               and create containing blocks (overflow, backdrop-filter),
                               so an absolute menu here is at the mercy of whichever
                               ancestor wins. Fixed plus a measured trigger rect is
                               immune to all of it, and translateX(-100%) lines the
                               menu's right edge up with the button without needing to
                               know its width first. */
                            <div
                                className="note-color-menu"
                                style={{ top: menuPos.top, left: menuPos.left }}
                            >
                                {NOTE_COLORS.map(color => (
                                    <button
                                        type="button"
                                        key={color.label}
                                        className={`note-color-swatch${
                                            currentColor === color.value ? ' note-color-swatch--on' : ''
                                        }${color.value ? '' : ' note-color-swatch--none'}`}
                                        style={color.value ? { background: color.value } : undefined}
                                        onClick={() => handleColor(color.value)}
                                        title={color.label}
                                        aria-label={color.label}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        className={`note-action-btn${note.is_pinned ? ' note-action-btn--pinned' : ''}`}
                        onClick={() => togglePin.mutate({ id: note.id!, isPinned: note.is_pinned })}
                        title={note.is_pinned ? 'Unpin' : 'Pin'}
                        aria-label="Toggle pin"
                    >
                        {note.is_pinned ? <Pin size={14} /> : <PinOff size={14} />}
                    </button>

                    <button
                        type="button"
                        className="note-action-btn note-action-btn--danger"
                        onClick={() => setConfirmDelete(true)}
                        title="Delete note"
                        aria-label="Delete note"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <div className="note-pane-scroll">
                {currentColor && (
                    <div className="note-pane-accent" style={{ background: currentColor }} />
                )}

                <div className="note-pane-inner">
                    <input
                        type="text"
                        className="note-title-input"
                        value={title}
                        onChange={e => handleTitle(e.target.value)}
                        placeholder="Untitled"
                        aria-label="Note title"
                    />

                    <div
                        className="note-meta-line"
                        title={absoluteTime(note.updated_at ?? note.created_at)}
                    >
                        {relativeTime(note.updated_at ?? note.created_at)}
                        {words > 0 && ` · ${words} ${words === 1 ? 'word' : 'words'}`}
                    </div>

                    {/* The title and meta line render immediately; only the
                        document body waits on the editor chunk. */}
                    <Suspense fallback={<div className="note-prose-loading" />}>
                        <NoteEditor
                            initialHtml={note.content ?? ''}
                            onChange={handleContent}
                            autoFocus={isBlank}
                        />
                    </Suspense>
                </div>
            </div>

            <ConfirmModal
                open={confirmDelete}
                title={`Delete "${note.title || 'Untitled'}"?`}
                confirmLabel="Delete"
                danger
                busy={deleteNote.isPending}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(false)}
            />
        </>
    );
};

export default NoteEditorPane;
