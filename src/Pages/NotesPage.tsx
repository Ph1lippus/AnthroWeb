import React, { useState, useEffect, useRef, useCallback } from 'react';
import Title from '../Components/Title';
import { getUserNotes, createNote, updateNote, deleteNote, togglePinNote } from '../services/noteService';
import type { Note } from '../services/noteService';

const NotesPage: React.FC = () => {
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Add/Edit modal state
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [editingNote, setEditingNote] = useState<Note | null>(null);
    const [noteTitle, setNoteTitle] = useState('');
    const [saving, setSaving] = useState(false);

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

    // View note modal
    const [viewNote, setViewNote] = useState<Note | null>(null);

    // Rich text editor ref
    const editorRef = useRef<HTMLDivElement>(null);

    // Fetch notes
    useEffect(() => {
        const loadNotes = async () => {
            setLoading(true);
            const allNotes = await getUserNotes();
            setNotes(allNotes);
            setLoading(false);
        };
        loadNotes();
    }, []);

    const resetForm = () => {
        setNoteTitle('');
        setEditingNote(null);
        setShowNoteModal(false);
        if (editorRef.current) {
            editorRef.current.innerHTML = '';
        }
    };

    const openAddModal = () => {
        setEditingNote(null);
        setNoteTitle('');
        setShowNoteModal(true);
        // Reset editor content after render
        setTimeout(() => {
            if (editorRef.current) {
                editorRef.current.innerHTML = '';
            }
        }, 0);
    };

    const openEditModal = (note: Note) => {
        setEditingNote(note);
        setNoteTitle(note.title);
        setShowNoteModal(true);
        setTimeout(() => {
            if (editorRef.current) {
                editorRef.current.innerHTML = note.content;
            }
        }, 0);
    };

    const handleSave = async () => {
        if (!noteTitle.trim()) return;
        setSaving(true);
        try {
            const content = editorRef.current ? editorRef.current.innerHTML : '';

            if (editingNote) {
                await updateNote(editingNote.id!, {
                    title: noteTitle.trim(),
                    content,
                });
            } else {
                await createNote({
                    title: noteTitle.trim(),
                    content,
                });
            }

            const refreshedNotes = await getUserNotes();
            setNotes(refreshedNotes);
            resetForm();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await deleteNote(deleteTarget.id!);
        const refreshedNotes = await getUserNotes();
        setNotes(refreshedNotes);
        setDeleteTarget(null);
    };

    const handleTogglePin = async (note: Note) => {
        await togglePinNote(note.id!, note.is_pinned);
        const refreshedNotes = await getUserNotes();
        setNotes(refreshedNotes);
    };

    // Rich text formatting commands
    const execFormat = useCallback((command: string, value?: string) => {
        document.execCommand(command, false, value || undefined);
        if (editorRef.current) {
            editorRef.current.focus();
        }
    }, []);

    const handleFormatBold = () => execFormat('bold');
    const handleFormatItalic = () => execFormat('italic');
    const handleFormatUnderline = () => execFormat('underline');
    const handleFormatStrikeThrough = () => execFormat('strikeThrough');
    const handleFormatOrderedList = () => execFormat('insertOrderedList');
    const handleFormatUnorderedList = () => execFormat('insertUnorderedList');
    const handleFormatHeading = () => execFormat('formatBlock', 'h3');
    const handleFormatParagraph = () => execFormat('formatBlock', 'p');
    const handleFormatBlockquote = () => execFormat('formatBlock', 'blockquote');
    const handleFormatCode = () => execFormat('formatBlock', 'pre');

    const handleInsertLink = () => {
        const url = prompt('Enter URL:');
        if (url) {
            execFormat('createLink', url);
        }
    };

    const handleInsertImage = () => {
        const url = prompt('Enter image URL:');
        if (url) {
            execFormat('insertImage', url);
        }
    };

    const filteredNotes = notes.filter(n =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const pinnedNotes = filteredNotes.filter(n => n.is_pinned);
    const unpinnedNotes = filteredNotes.filter(n => !n.is_pinned);

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const stripHtml = (html: string) => {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    };

    const renderNoteCard = (note: Note) => {
        const plainText = stripHtml(note.content);
        const preview = plainText.substring(0, 120);

        return (
            <div key={note.id} className="note-card">
                <div className="note-card-top">
                    <div className="note-card-title-section" onClick={() => setViewNote(note)}>
                        <h3 className="note-card-title">
                            {note.is_pinned && <i className="fa-solid fa-thumbtack note-pin-icon"></i>}
                            {note.title}
                        </h3>
                        {preview && <p className="note-card-preview">{preview}{plainText.length > 120 ? '...' : ''}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button
                            onClick={() => handleTogglePin(note)}
                            className={`note-action-btn ${note.is_pinned ? 'note-action-btn--pinned' : ''}`}
                            title={note.is_pinned ? 'Unpin note' : 'Pin note'}
                            aria-label="Toggle pin"
                        >
                            <i className="fa-solid fa-thumbtack"></i>
                        </button>
                        <button
                            onClick={() => openEditModal(note)}
                            className="note-action-btn"
                            title="Edit note"
                            aria-label="Edit note"
                        >
                            <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button
                            onClick={() => setDeleteTarget(note)}
                            className="note-action-btn note-action-btn--danger"
                            title="Delete note"
                            aria-label="Delete note"
                        >
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div className="note-card-footer">
                    <span className="note-card-date">{formatDate(note.updated_at || note.created_at)}</span>
                </div>
            </div>
        );
    };

    return (
        <>
            <Title title="Notes" />
            <div className="notes-page-wrapper">
                <div className="dashboard-section notes-section">
                    <div className="notes-card">
                        {/* Stats + Top Bar */}
                        <div className="notes-stats">
                            <div className="notes-stat-item">
                                <span className="notes-stat-label">Total Notes</span>
                                <span className="notes-stat-value">{notes.length}</span>
                            </div>
                            <div className="notes-stat-item">
                                <span className="notes-stat-label">Pinned</span>
                                <span className="notes-stat-value">{notes.filter(n => n.is_pinned).length}</span>
                            </div>
                        </div>

                        <div className="notes-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={openAddModal} className="btn-action">
                                    <i className="i-lucide-plus mr-1"></i>New Note
                                </button>
                            </div>

                            <div className="search-container notes-search">
                                <div className="search-input-wrapper">
                                    <i className="search-input-icon fa-solid fa-magnifying-glass"></i>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                        placeholder="Search notes..."
                                    />
                                    {searchQuery && (
                                        <button
                                            className="search-clear-btn"
                                            onClick={() => setSearchQuery('')}
                                            aria-label="Clear search"
                                        >
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Notes Content */}
                        {loading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading notes...</p>
                            </div>
                        ) : notes.length === 0 ? (
                            <div className="notes-empty">
                                <i className="fa-solid fa-note-sticky notes-empty-icon"></i>
                                <p className="notes-empty-title">No notes yet</p>
                                <p className="notes-empty-text">Create your first note to get started!</p>
                            </div>
                        ) : (
                            <div className="notes-scroll-area">
                                {pinnedNotes.length > 0 && (
                                    <div className="notes-group">
                                        <div className="notes-group-header">
                                            <i className="fa-solid fa-thumbtack"></i>
                                            Pinned ({pinnedNotes.length})
                                        </div>
                                        <div className="notes-grid">
                                            {pinnedNotes.map(renderNoteCard)}
                                        </div>
                                    </div>
                                )}
                                {unpinnedNotes.length > 0 && (
                                    <div className="notes-group">
                                        <div className="notes-group-header">
                                            <i className="fa-regular fa-note-sticky"></i>
                                            All Notes ({unpinnedNotes.length})
                                        </div>
                                        <div className="notes-grid">
                                            {unpinnedNotes.map(renderNoteCard)}
                                        </div>
                                    </div>
                                )}
                                {filteredNotes.length === 0 && searchQuery && (
                                    <p className="text-sm opacity-50 mt-4 text-center">No notes match your search.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add/Edit Note Modal */}
            {showNoteModal && (
                <div className="import-modal-overlay" onMouseDown={(e) => {
                    if (e.target === e.currentTarget) resetForm();
                }}>
                    <div className="import-modal-card note-modal-card">
                        <h3 className="mb-4">{editingNote ? 'Edit Note' : 'New Note'}</h3>
                        <div className="mb-3">
                            <label className="form-label">Title</label>
                            <input
                                type="text"
                                value={noteTitle}
                                onChange={(e) => setNoteTitle(e.target.value)}
                                className="form-control"
                                placeholder="Note title"
                                required
                                autoFocus
                            />
                        </div>
                        <div className="mb-3">
                            <label className="form-label">Content</label>
                            <div className="note-editor-toolbar">
                                <button type="button" onClick={handleFormatBold} className="note-toolbar-btn" title="Bold (Ctrl+B)">
                                    <i className="fa-solid fa-bold"></i>
                                </button>
                                <button type="button" onClick={handleFormatItalic} className="note-toolbar-btn" title="Italic (Ctrl+I)">
                                    <i className="fa-solid fa-italic"></i>
                                </button>
                                <button type="button" onClick={handleFormatUnderline} className="note-toolbar-btn" title="Underline (Ctrl+U)">
                                    <i className="fa-solid fa-underline"></i>
                                </button>
                                <button type="button" onClick={handleFormatStrikeThrough} className="note-toolbar-btn" title="Strikethrough">
                                    <i className="fa-solid fa-strikethrough"></i>
                                </button>
                                <span className="note-toolbar-separator"></span>
                                <button type="button" onClick={handleFormatHeading} className="note-toolbar-btn" title="Heading">
                                    <i className="fa-solid fa-heading"></i>
                                </button>
                                <button type="button" onClick={handleFormatParagraph} className="note-toolbar-btn" title="Paragraph">
                                    <i className="fa-solid fa-paragraph"></i>
                                </button>
                                <button type="button" onClick={handleFormatBlockquote} className="note-toolbar-btn" title="Blockquote">
                                    <i className="fa-solid fa-quote-left"></i>
                                </button>
                                <button type="button" onClick={handleFormatCode} className="note-toolbar-btn" title="Code block">
                                    <i className="fa-solid fa-code"></i>
                                </button>
                                <span className="note-toolbar-separator"></span>
                                <button type="button" onClick={handleFormatOrderedList} className="note-toolbar-btn" title="Ordered list">
                                    <i className="fa-solid fa-list-ol"></i>
                                </button>
                                <button type="button" onClick={handleFormatUnorderedList} className="note-toolbar-btn" title="Unordered list">
                                    <i className="fa-solid fa-list-ul"></i>
                                </button>
                                <span className="note-toolbar-separator"></span>
                                <button type="button" onClick={handleInsertLink} className="note-toolbar-btn" title="Insert link">
                                    <i className="fa-solid fa-link"></i>
                                </button>
                                <button type="button" onClick={handleInsertImage} className="note-toolbar-btn" title="Insert image">
                                    <i className="fa-solid fa-image"></i>
                                </button>
                            </div>
                            <div
                                ref={editorRef}
                                className="note-editor"
                                contentEditable
                                suppressContentEditableWarning
                                data-placeholder="Write your note content here..."
                            ></div>
                        </div>
                        <div className="flex gap-2 justify-end mt-4">
                            <button type="button" onClick={resetForm} className="btn-form-cancel" disabled={saving}>Cancel</button>
                            <button
                                type="button"
                                onClick={handleSave}
                                className="btn-form-submit"
                                disabled={!noteTitle.trim() || saving}
                            >
                                {saving ? 'Saving...' : editingNote ? 'Save Changes' : 'Create Note'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Note Modal */}
            {viewNote && (
                <div className="import-modal-overlay" onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setViewNote(null);
                }}>
                    <div className="import-modal-card note-view-card">
                        <div className="note-view-header">
                            <h3>
                                {viewNote.is_pinned && <i className="fa-solid fa-thumbtack note-pin-icon"></i>}
                                {viewNote.title}
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const n = viewNote;
                                        setViewNote(null);
                                        openEditModal(n);
                                    }}
                                    className="note-action-btn"
                                    title="Edit"
                                >
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button
                                    onClick={() => setViewNote(null)}
                                    className="note-action-btn"
                                    title="Close"
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>
                        <div className="note-view-date">
                            {formatDate(viewNote.updated_at || viewNote.created_at)}
                        </div>
                        <div
                            className="note-view-content"
                            dangerouslySetInnerHTML={{ __html: viewNote.content }}
                        />
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="import-modal-overlay" onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setDeleteTarget(null);
                }}>
                    <div className="import-modal-card delete-modal-card">
                        <h3 className="mb-4">Delete Note</h3>
                        <p className="delete-modal-text">
                            Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>? This action cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-center mt-5">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="btn-form-cancel"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="btn-form-submit btn-form-submit--danger"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default NotesPage;