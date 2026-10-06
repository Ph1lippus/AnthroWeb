import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronLeft,
    Copy,
    Download,
    Eye,
    Keyboard,
    ListTree,
    PanelLeft,
    Palette,
    Pin,
    Plus,
    SmilePlus,
    Trash2,
    X,
} from 'lucide-react';
import NoteToc from './NoteToc';
import NoteIconBadge from './NoteIconBadge';
import NoteColorPicker from './NoteColorPicker';
import NoteIconPicker from './NoteIconPicker';
import ShortcutsSheet from './ShortcutsSheet';
import ConfirmModal from '../ConfirmModal';
import type { TableOfContentData } from '@tiptap/extension-table-of-contents';
import type { Note } from '../../services/noteService';
import type { NoteEditorHandle } from './NoteEditor';
import { useNoteEditorChunk } from './useNoteEditorChunk';
import { useDuplicateNote, useToggleNotePin, useTrashNote, useUpdateNote } from '../../hooks/useNotes';
import { noteAncestors } from '../../utils/noteTree';
import { downloadNoteHtml, downloadNoteMarkdown } from '../../utils/noteExport';
import { resolveNoteColor } from '../../utils/noteColors';
import { resolveNoteIcon } from '../../utils/noteIcons';
import {
    absoluteTime,
    isBlankNote,
    relativeTime,
    shouldShowToc,
    wordCount,
} from '../../utils/noteContent';

// TipTap and ProseMirror are by far the heaviest thing the notes page loads, and
// nothing outside this route needs them, so the editor is fetched through
// `useNoteEditorChunk` rather than `lazy()`. That buys one commit instead of two:
// the title, the icon and the body all land together, rather than the page
// appearing and then filling in under it.
const AUTOSAVE_DELAY = 1500;

interface Pending {
    title: string;
    content: string;
}

interface NoteEditorPaneProps {
    note: Note;
    /** The live page list, so breadcrumbs can be resolved from the parent id. */
    allNotes: Note[];
    onDeleted: () => void;
    /**
     * Return to the page list. Optional on purpose: it is only reachable where
     * the list is not already on screen, so leaving it undefined is what keeps
     * the button off the split layout, where it would be a no-op next to a rail
     * that is permanently visible.
     */
    onClose?: () => void;
    /**
     * Whether the page list beside this one is closed. Drives the state of the
     * rail toggle, which is also the only way to reopen it.
     */
    railHidden?: boolean;
    /**
     * Show or hide the page list. Optional on purpose: it is only meaningful on
     * the split layout, where the rail and the page share the screen. Handing it
     * undefined is what keeps the control off the stacked layout, where there is
     * nothing to bring back.
     */
    onToggleRail?: () => void;
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
const NoteEditorPane: React.FC<NoteEditorPaneProps> = ({
    note,
    allNotes,
    onDeleted,
    onClose,
    railHidden = false,
    onToggleRail,
}) => {
    const updateNote = useUpdateNote(note.id);
    const trashNoteMutation = useTrashNote();
    const duplicateNoteMutation = useDuplicateNote();
    const togglePin = useToggleNotePin();

    // The body is the last thing to arrive and the first thing to matter, so
    // nothing below this line is drawn until it is here. `Editor` is null only
    // while the chunk is in flight, or if it failed outright.
    const { Editor } = useNoteEditorChunk();

    const [title, setTitle] = useState(note.title ?? '');
    const [content, setContent] = useState(note.content ?? '');
    const [actionError, setActionError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [newTag, setNewTag] = useState('');
    const [showExport, setShowExport] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [focusMode, setFocusMode] = useState(false);
    const [showToc, setShowToc] = useState(false);
    const [tocItems, setTocItems] = useState<TableOfContentData>([]);

    /**
     * Which picker is open, and the element it is anchored to.
     *
     * One piece of state rather than two booleans, because the two pickers are
     * mutually exclusive and each needs the trigger's own element to place itself
     * against. Captured from the click event rather than held in a ref: a ref would
     * have to be read during render to be passed down, which is not a thing React
     * allows, and eleven interchangeable 28px buttons are too alike to find again
     * with a query.
     */
    const [openPicker, setOpenPicker] = useState<'color' | 'icon' | null>(null);
    const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);

    const openPickerAt = (which: 'color' | 'icon', trigger: HTMLElement) => {
        // Clicking the other trigger moves the panel rather than leaving two of
        // them fighting over the same dismissal.
        setPickerAnchor(trigger);
        setOpenPicker(current => (current === which ? null : which));
    };

    const closePicker = useCallback(() => {
        setOpenPicker(null);
        setPickerAnchor(null);
    }, []);

    // The editor is lazy, so the header's block-menu button cannot reach into it
    // during render. It asks through this handle on click instead.
    const editorRef = useRef<NoteEditorHandle>(null);
    const blockMenuButtonRef = useRef<HTMLButtonElement>(null);

    // Stable identity on purpose: NoteEditor reports the outline through an effect
    // keyed on this callback, so a fresh function each render would loop forever.
    const handleTocChange = useCallback((items: TableOfContentData) => {
        setTocItems(items);
    }, []);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The newest values still owed to the database. A ref rather than state
    // because the unmount flush runs outside the render cycle and must not close
    // over a stale snapshot.
    const pendingRef = useRef<Pending | null>(null);
    // If a write is in flight a newer one waits behind it, rather than racing to
    // the server and landing out of order with the older payload.
    const inFlightRef = useRef(false);
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
            try {
                await updateNote.mutateAsync({ title: pending.title, content: pending.content });
                // Only clear if nothing new was typed while this was in flight.
                if (pendingRef.current === pending) {
                    pendingRef.current = null;
                    setActionError(null);
                }
            } catch (error) {
                // The payload stays in pendingRef so the next keystroke retries it
                // instead of silently dropping the edit, and the failure is reported
                // through the same line as every other action error rather than
                // through a save indicator in the header. With nothing in the header
                // at all, a failure that never resolves on its own -- signed out, a
                // row-level rejection -- would otherwise be completely silent, and
                // the retry only ever comes from the next keystroke.
                setActionError(
                    `Could not save: ${error instanceof Error ? error.message : 'unknown error'}`,
                );
            } finally {
                inFlightRef.current = false;
            }
        };
        persistRef.current = persist;
    }, [updateNote]);

    const scheduleSave = (nextTitle: string, nextContent: string) => {
        pendingRef.current = { title: nextTitle, content: nextContent };
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
        setActionError(null);
        updateNote.mutate(
            // An empty id is the removal, written as null. Sent as an empty string
            // instead, Postgres stores it and `resolveNoteColor` treats it as
            // Default anyway -- so the page *looked* uncoloured while still
            // carrying a value, and re-picking the same colour afterwards was not
            // distinguishable from a no-op.
            { notes_color: color || null },
            {
                // Surfaced rather than swallowed. This mutation writes a column
                // added by migration 0006, so against a database that has not had
                // it applied every write 4xx's -- and an unhandled mutation error
                // meant nothing at all appeared to happen.
                onError: error => {
                    setActionError(`Could not save colour: ${error.message}`);
                },
            },
        );
    };

    const handleIcon = (icon: string | null) => {
        setActionError(null);
        updateNote.mutate(
            { notes_icon: icon },
            { onError: error => setActionError(`Could not save icon: ${error.message}`) },
        );
    };

    const handleDelete = () => {
        // Clear the pending payload first: unmounting would otherwise flush an
        // update for a row that is on its way to the trash.
        pendingRef.current = null;
        if (timerRef.current) clearTimeout(timerRef.current);
        // A soft delete. This is reachable from one click on the page, so it has
        // to be recoverable -- the irreversible version lives in the trash view.
        // onError is explicit because a swallowed rejection here looks exactly
        // like the button doing nothing, which is how a misspelled column went
        // unnoticed for a whole round.
        trashNoteMutation.mutate(note.id!, {
            onSuccess: () => onDeleted(),
            onError: (error: Error) => {
                setActionError(`Could not move to trash: ${error.message}`);
            },
        });
    };

    const handleAddTag = () => {
        const tag = newTag.trim();
        if (!tag) return;
        const current = note.notes_tags ?? [];
        // Case-insensitive duplicate check, so "Exam" and "exam" do not both end
        // up on one page.
        if (current.some(existing => existing.toLowerCase() === tag.toLowerCase())) {
            setNewTag('');
            return;
        }
        updateNote.mutate({ notes_tags: [...current, tag] });
        setNewTag('');
    };

    const handleRemoveTag = (tag: string) => {
        updateNote.mutate({ notes_tags: (note.notes_tags ?? []).filter(entry => entry !== tag) });
    };

    // Cmd/Ctrl+Shift+E exports. Bound on the window so it works with the caret in
    // the body, and ignored while a modifier-free keystroke is being typed.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
                event.preventDefault();
                downloadNoteMarkdown(note, allNotes);
                return;
            }
            // "?" only when it is not being typed: an editable target means the
            // character belongs to the note.
            if (
                event.key === '?' &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey &&
                !(event.target instanceof HTMLElement && event.target.isContentEditable) &&
                !(event.target instanceof HTMLInputElement)
            ) {
                event.preventDefault();
                setShowShortcuts(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [note, allNotes]);

    const currentColor = note.notes_color ?? '';
    // Resolved once here rather than at each of the six places that draw the
    // colour, so the tint on the page, the rail dot, the accent rule and the icon
    // cannot disagree about what colour this page is.
    const tone = resolveNoteColor(currentColor);
    const icon = resolveNoteIcon(note.notes_icon);
    const words = wordCount(content);
    // Ancestors resolve against the live list. A parent that is missing -- trashed,
    // or filtered out by a search -- simply drops out of the trail rather than
    // rendering a dead link.
    const ancestors = useMemo(() => noteAncestors(allNotes, note), [allNotes, note]);
    // Captured from the note as it was opened, not from live state: this decides
    // whether the caret goes into the body on mount, and that only makes sense
    // for a page that was still empty when it loaded.
    const isBlank = isBlankNote(note.content);

return (
        <>
            {/* The tint travels down from here as custom properties rather than as a
                class, so the rule above the page and the icon cannot disagree
                about what colour this page is. A page with no colour leaves them
                unset and both rules fall back to the app's own accent. */}
            <div
                className="note-pane-shell"
                style={{
                    ['--note-solid' as string]: tone.id ? tone.solid : undefined,
                    ['--note-text' as string]: tone.id ? tone.text : undefined,
                } as React.CSSProperties}
            >
            <div className="note-pane-bar">
                {/* Rendered only where it does something: `margin-right: auto`
                    pushes the rest of the bar to the right, so the back control
                    sits against the left edge above the title's breadcrumb trail. */}
                {onClose && (
                    <button
                        type="button"
                        className="note-back-btn"
                        onClick={onClose}
                        aria-label="Back to the page list"
                        data-tip="Back to the page list"
                    >
                        <ChevronLeft size={13} />
                        Pages
                    </button>
                )}

                <div className="note-pane-actions">
                    {/* Left of the group, so `margin-right: auto` on this button
                        pushes the rest of the bar to the right and leaves it
                        against the edge it belongs to. Rendered only where it has
                        something to toggle -- see onToggleRail. */}
                    {onToggleRail && (
                        <button
                            type="button"
                            className="note-action-btn note-rail-toggle-btn"
                            onClick={onToggleRail}
                            data-tip={railHidden ? 'Show the page list' : 'Hide the page list'}
                            aria-label={railHidden ? 'Show the page list' : 'Hide the page list'}
                            aria-pressed={railHidden}
                        >
                            <PanelLeft size={14} />
                        </button>
                    )}

                    {actionError && (
                        <span className="note-inline-error" role="alert">
                            {actionError}
                        </span>
                    )}

                    <button
                        type="button"
                        className={`note-action-btn${focusMode ? ' note-action-btn--pinned' : ''}`}
                        onClick={() => setFocusMode(v => !v)}
                        data-tip="Focus mode: dim everything except the current line"
                        aria-label="Focus mode"
                        aria-pressed={focusMode}
                    >
                        <Eye size={14} />
                    </button>

                    {/* The block menu's only way in on a phone. The grip it opens
                        from lives in a gutter that has nowhere to go at this width,
                        and there is no hover to reveal it with. Hidden above the
                        breakpoint, where the grip is available and better aimed. */}
                    <button
                        type="button"
                        ref={blockMenuButtonRef}
                        className="note-action-btn note-block-menu-btn"                        onClick={() => {
                            const button = blockMenuButtonRef.current;
                            if (button) {
                                editorRef.current?.openBlockMenu(button.getBoundingClientRect());
                            }
                        }}
                        data-tip="Block menu for the current block"
                        aria-label="Block menu"
                    >
                        <Plus size={14} />
                    </button>

                    {/* Only offered once the page has enough headings for an outline
                        to be worth the space. */}
                    {shouldShowToc(tocItems.length) && (
                        <button
                            type="button"
                            className={`note-action-btn${showToc ? ' note-action-btn--pinned' : ''}`}
                            onClick={() => setShowToc(v => !v)}
                            data-tip="Outline of this page"
                            aria-label="Outline"
                            aria-pressed={showToc}
                        >
                            <ListTree size={14} />
                        </button>
                    )}

                    <button
                        type="button"
                        className={`note-action-btn${showExport ? ' note-action-btn--pinned' : ''}`}
                        onClick={() => setShowExport(v => !v)}
                        data-tip="Export this page"
                        aria-label="Export this page"
                        aria-expanded={showExport}
                    >
                        <Download size={14} />
                    </button>

                    {showExport && (
                        <div className="note-export-inline" role="group" aria-label="Export">
                            <button
                                type="button"
                                data-tip="Download as a .md file"
                                aria-label="Download as Markdown"
                                onClick={() => {
                                    downloadNoteMarkdown(note, allNotes);
                                    setShowExport(false);
                                }}
                            >
                                Markdown
                            </button>
                            <button
                                type="button"
                                data-tip="Download as a styled .html file"
                                aria-label="Download as HTML"
                                onClick={() => {
                                    downloadNoteHtml(note);
                                    setShowExport(false);
                                }}
                            >
                                HTML
                            </button>
                        </div>
                    )}

                    <button
                        type="button"
                        className="note-action-btn"
                        onClick={() => setShowShortcuts(true)}
                        data-tip="Editor help: shortcuts and the selection toolbar (?)"
                        aria-label="Editor help"
                    >
                        <Keyboard size={14} />
                    </button>

                    {/* The two appearance triggers show the page's current colour and
                        icon rather than a generic glyph. A palette button that stays
                        grey on a pink page makes you open it to find out what you
                        already set. */}
                    <button
                        type="button"
                        className={`note-action-btn${openPicker === 'color' ? ' note-action-btn--pinned' : ''}`}
                        onClick={event => openPickerAt('color', event.currentTarget)}
                        data-tip={tone.id ? `Page colour: ${tone.label}` : 'Page colour'}
                        aria-label="Page colour"
                        aria-expanded={openPicker === 'color'}
                    >
                        <Palette size={14} style={{ color: tone.id ? tone.solid : undefined }} />
                    </button>

                    <button
                        type="button"
                        className={`note-action-btn${openPicker === 'icon' ? ' note-action-btn--pinned' : ''}`}
                        onClick={event => openPickerAt('icon', event.currentTarget)}
                        data-tip={icon ? `Page icon: ${icon.label}` : 'Page icon'}
                        aria-label="Page icon"
                        aria-expanded={openPicker === 'icon'}
                    >
                        {icon
                            ? <icon.Icon size={14} />
                            : <SmilePlus size={14} />}
                    </button>

                    <button
                        type="button"
                        className="note-action-btn"
                        onClick={() => duplicateNoteMutation.mutate(note)}
                        disabled={duplicateNoteMutation.isPending}
                        data-tip="Duplicate page"
                        aria-label="Duplicate page"
                    >
                        <Copy size={14} />
                    </button>

                    <button
                        type="button"
                        className={`note-action-btn${note.is_pinned ? ' note-action-btn--pinned' : ''}`}
                        onClick={() => togglePin.mutate({ id: note.id!, isPinned: note.is_pinned })}
                        data-tip={note.is_pinned ? 'Unpin from the top' : 'Pin to the top'}
                        aria-label="Toggle pin"
                        aria-pressed={note.is_pinned}
                    >
                        {/* One glyph, inverted fill. It used to swap between `Pin`
                            and `PinOff`, which left "pinned" signalled only by the
                            absence of a diagonal slash -- and since the button's
                            hover and `--pinned` states are the same colour, a
                            hovered unpinned pin read as pinned. A solid fill is
                            legible at a glance and at any size. */}
                        <Pin size={14} fill={note.is_pinned ? 'currentColor' : 'none'} />
                    </button>

                    <button
                        type="button"
                        className="note-action-btn note-action-btn--danger"
                        onClick={() => setConfirmDelete(true)}
                        data-tip="Move to trash"
                        aria-label="Move to trash"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Both panels are portalled to <body> by Popover, which is what makes
                them work here at all -- see the note on that component for the four
                containment rules they escape. Neither closes on a pick: a colour is
                chosen by comparing it against the page, and an icon by comparing it
                against the other five places it appears. */}
            {openPicker === 'color' && (
                <NoteColorPicker
                    anchor={pickerAnchor}
                    onClose={closePicker}
                    value={currentColor}
                    onChange={handleColor}
                />
            )}
            {openPicker === 'icon' && (
                <NoteIconPicker
                    anchor={pickerAnchor}
                    onClose={closePicker}
                    value={note.notes_icon ?? ''}
                    onChange={handleIcon}
                />
            )}

            <div className="note-pane-scroll">
                {note.notes_cover && (
                    <div
                        className="note-cover"
                        style={{ backgroundImage: `url(${note.notes_cover})` }}
                        role="img"
                        aria-label="Page cover"
                    />
                )}
                {/* Unconditional. The rule only draws itself when the page has a
                    colour -- it used to be unmounted entirely without one, which
                    meant the bar below it moved up as the colour was set and back
                    down as it was cleared, so removing a colour shifted the whole
                    page by six pixels. */}
                <div className="note-pane-accent" aria-hidden="true" />

                <div className="note-pane-inner">
                    {ancestors.length > 0 && (
                        <nav className="note-breadcrumbs" aria-label="Breadcrumbs">
                            {ancestors.map(ancestor => (
                                <span key={ancestor.id} className="note-crumb">
                                    <NoteIconBadge
                                        value={ancestor.notes_icon}
                                        color={ancestor.notes_color}
                                    />
                                    {ancestor.title?.trim() || 'Untitled'}
                                </span>
                            ))}
                        </nav>
                    )}

                    {/* Icon and title share a row. The icon was a 3.25rem tile on its own line
                        above the title, which read as a header block rather than as
                        part of the page's name -- and a long title started below a
                        row of its own instead of beside it. */}
                    <div className="note-title-row">
                        {/* Clicking it opens the picker from where the icon is,
                            rather than only from the toolbar. It is the control people
                            reach for first and there was no way to get an icon onto a
                            page without finding the 28px button in the header. */}
                        <button
                            type="button"
                            className="note-page-icon-btn"
                            onClick={event => openPickerAt('icon', event.currentTarget)}
                            data-tip={icon ? `Icon: ${icon.label}. Change it` : 'Give this page an icon'}
                            aria-label={icon ? `Page icon: ${icon.label}. Change it` : 'Give this page an icon'}
                        >
                            {/*
                            The plus is the fallback glyph, and it is invisible
                            until the pointer comes near the row -- see
                            `.note-icon-badge--empty`. A page with no icon shows
                            no icon, and this is how you give it one without
                            finding the toolbar.
                        */}
                            <NoteIconBadge
                                value={note.notes_icon}
                                color={currentColor}
                                size="page"
                                fallback={<Plus size={15} />}
                            />
                        </button>

                        <input
                            type="text"
                            className="note-title-input"
                            value={title}
                            onChange={e => handleTitle(e.target.value)}
                            placeholder="Untitled"
                            aria-label="Note title"
                        />
                    </div>

                    {/*
                        Tags and the document's own facts share one row.

                        They used to be two stacked blocks with the tags wedged
                        between the title and the meta line, so neither had a clear
                        home: the tags looked like part of the title, and the meta
                        line was pushed a block further from the body it describes.
                        Both are page metadata, so both belong on the metadata row.
                    */}
                    <div className="note-meta-row">
                        <div className="note-tag-row">
                            {(note.notes_tags ?? []).map(tag => (
                                <span key={tag} className="note-tag">
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTag(tag)}
                                        aria-label={`Remove tag ${tag}`}
                                        data-tip={`Remove the tag “${tag}”`}
                                    >
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}
                            <input
                                type="text"
                                className="note-tag-input"
                                value={newTag}
                                placeholder="Add tag"
                                onChange={e => setNewTag(e.target.value)}
                                // Enter commits; Escape abandons without saving.
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddTag();
                                    } else if (e.key === 'Escape') {
                                        setNewTag('');
                                    }
                                }}
                                // Losing focus with text in the box means a tag was
                                // being written, so commit it rather than drop it.
                                onBlur={() => {
                                    if (newTag.trim()) handleAddTag();
                                }}
                                aria-label="Add tag"
                            />
                        </div>

                        <div
                            className="note-meta-line"
                            data-tip={absoluteTime(note.updated_at ?? note.created_at)}
                        >
                            {relativeTime(note.updated_at ?? note.created_at)}
                            {words > 0 && ` · ${words} ${words === 1 ? 'word' : 'words'}`}
                        </div>
                    </div>

                    {showToc && <NoteToc items={tocItems} onClose={() => setShowToc(false)} />}

                    {/* The editor, or the space it will take. Not a Suspense boundary:
                        a boundary here would paint the title row above it on its own and
                        fill the body in a frame later, which is the half-drawn page this
                        component no longer has a reason to produce. */}
                    {Editor ? (
                        <Editor
                            ref={editorRef}
                            initialHtml={note.content ?? ''}
                            onChange={handleContent}
                            autoFocus={isBlank}
                            focusMode={focusMode}
                            onTocChange={handleTocChange}
                        />
                    ) : (
                        <div className="note-prose-loading" />
                    )}
                </div>
            </div>
            </div>

            <ShortcutsSheet open={showShortcuts} onClose={() => setShowShortcuts(false)} />

            <ConfirmModal
                open={confirmDelete}
                title={`Move "${note.title || 'Untitled'}" to the trash?`}
                confirmLabel="Move to trash"
                danger
                busy={trashNoteMutation.isPending}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(false)}
            />
        </>
    );
};

export default NoteEditorPane;
