import React, { useState, useEffect, useRef, useCallback } from 'react';
import Title from '../Components/Title';
import { getUserBooks, createBook, updateBook, deleteBook, updateBookProgress, exportBooksToCSV, importBooksFromCSV, deleteMultipleBooks } from '../services/bookService';
import type { Book } from '../services/bookService';

interface DuplicateGroup {
    title: string;
    books: Book[];
}


interface GroupedBooks {
    groupName: string;
    books: Book[];
}

// Helper to extract group prefix from a book title (e.g., "Bible - Genesis" → "Bible")
const getBookGroup = (title: string): string | null => {
    const match = title.match(/^([^-]+?)\s*-\s*/);
    return match ? match[1].trim() : null;
};

// Group books by their prefix (e.g., "Bible - Genesis" → group "Bible")
const groupBooksByPrefix = (books: Book[]): { grouped: GroupedBooks[]; ungrouped: Book[] } => {
    const groupMap = new Map<string, Book[]>();
    const ungrouped: Book[] = [];

    for (const book of books) {
        const group = getBookGroup(book.title);
        if (group) {
            const existing = groupMap.get(group) || [];
            existing.push(book);
            groupMap.set(group, existing);
        } else {
            ungrouped.push(book);
        }
    }

    const grouped: GroupedBooks[] = [];
    for (const [groupName, groupBooks] of groupMap.entries()) {
        grouped.push({
            groupName,
            books: groupBooks.sort((a, b) => a.title.localeCompare(b.title)),
        });
    }
    grouped.sort((a, b) => a.groupName.localeCompare(b.groupName));

    return { grouped, ungrouped };
};

const BooksPage: React.FC = () => {
    const [books, setBooks] = useState<Book[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingBook, setEditingBook] = useState<Book | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [submittedSearch, setSubmittedSearch] = useState('');

    // Delete confirmation modal
    const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);

    // Edit modal state
    const [editModalBook, setEditModalBook] = useState<Book | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editTotalPages, setEditTotalPages] = useState('');
    const [editCurrentPage, setEditCurrentPage] = useState('');

    // Add form state
    const [title, setTitle] = useState('');
    const [totalPages, setTotalPages] = useState('');
    const [currentPageInput, setCurrentPageInput] = useState('');

    // Timer state - use refs to avoid stale closure issues
    const timerDisplayRef = useRef({ minutes: 15, seconds: 0 });
    const [timerDisplay, setTimerDisplay] = useState('15:00');
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerInputRef = useRef<HTMLInputElement>(null);

    // Chronometer state - counts up forever
    const chronoTimeRef = useRef(0);
    const [chronoDisplay, setChronoDisplay] = useState('00:00:00');
    const [isChronoRunning, setIsChronoRunning] = useState(false);
    const chronoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Random book picker state
    const [randomBook, setRandomBook] = useState<Book | null>(null);
    const [showRandomModal, setShowRandomModal] = useState(false);

    // Duplicate checking state
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
    const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
    const [duplicatesDeleting, setDuplicatesDeleting] = useState(false);


    const handlePickRandom = () => {
        if (notStartedBooks.length === 0) return;
        const randomIndex = Math.floor(Math.random() * notStartedBooks.length);
        setRandomBook(notStartedBooks[randomIndex]);
        setShowRandomModal(true);
    };
    // Fetch all books at once
    useEffect(() => {
        const loadBooks = async () => {
            setLoading(true);
            const allBooks = await getUserBooks();
            setBooks(allBooks);
            setLoading(false);
        };
        loadBooks();
    }, []);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
            if (chronoIntervalRef.current) {
                clearInterval(chronoIntervalRef.current);
            }
        };
    }, []);

    const resetForm = () => {
        setTitle('');
        setTotalPages('');
        setCurrentPageInput('');
        setEditingBook(null);
        setShowAddForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const totalPagesNum = parseInt(totalPages) || 0;
        const currentPageNum = parseInt(currentPageInput) || 0;

        if (editingBook) {
            await updateBook(editingBook.id!, {
                title,
                total_pages: totalPagesNum,
                current_page: currentPageNum,
                progress: totalPagesNum > 0 ? Math.round((currentPageNum / totalPagesNum) * 100) : 0,
            });
        } else {
            await createBook({
                user_id: '',
                title,
                total_pages: totalPagesNum,
                current_page: currentPageNum,
                progress: totalPagesNum > 0 ? Math.round((currentPageNum / totalPagesNum) * 100) : 0,
                status: totalPagesNum > 0 ? (currentPageNum >= totalPagesNum ? 'completed' : 'reading') : 'planned',
            });
        }

        const refreshedBooks = await getUserBooks();
        setBooks(refreshedBooks);
        resetForm();
    };

    const openEditModal = (book: Book) => {
        setEditModalBook(book);
        setEditTitle(book.title);
        setEditTotalPages(book.total_pages.toString());
        setEditCurrentPage(book.current_page.toString());
    };

    const closeEditModal = () => {
        setEditModalBook(null);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editModalBook) return;

        setEditLoading(true);
        try {
            const totalPagesNum = parseInt(editTotalPages) || 0;
            const currentPageNum = parseInt(editCurrentPage) || 0;

            await updateBook(editModalBook.id!, {
                title: editTitle,
                total_pages: totalPagesNum,
                current_page: currentPageNum,
                progress: totalPagesNum > 0 ? Math.round((currentPageNum / totalPagesNum) * 100) : 0,
            });

            const refreshedBooks = await getUserBooks();
            setBooks(refreshedBooks);
            closeEditModal();
        } finally {
            setEditLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await deleteBook(deleteTarget.id!);
        const refreshedBooks = await getUserBooks();
        setBooks(refreshedBooks);
        setDeleteTarget(null);
    };

    const handlePageUpdate = async (book: Book, newPage: number) => {
        await updateBookProgress(book.id!, newPage, book.total_pages);
        const refreshedBooks = await getUserBooks();
        setBooks(refreshedBooks);
    };

    const handleExport = async () => {
        const allBooks = await getUserBooks();
        const csv = exportBooksToCSV(allBooks);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `books-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result as string;
            try {
                await importBooksFromCSV(content);
                setImportError(null);
                setShowImportModal(false);
                const refreshedBooks = await getUserBooks();
                setBooks(refreshedBooks);
            } catch {
                setImportError('Failed to import books. Please check your CSV format.');
            }
        };
        reader.readAsText(file);
    };

    // Duplicate checking logic
    const findDuplicates = useCallback(() => {
        const titleMap = new Map<string, Book[]>();
        for (const book of books) {
            const lowerTitle = book.title.toLowerCase().trim();
            const existing = titleMap.get(lowerTitle) || [];
            existing.push(book);
            titleMap.set(lowerTitle, existing);
        }

        const groups: DuplicateGroup[] = [];
        for (const [title, bookList] of titleMap.entries()) {
            if (bookList.length > 1) {
                groups.push({ title, books: bookList });
            }
        }

        // Sort groups by number of duplicates (most first)
        groups.sort((a, b) => b.books.length - a.books.length);

        return groups;
    }, [books]);

    const handleCheckDuplicates = useCallback(() => {
        const groups = findDuplicates();
        setDuplicateGroups(groups);

        // Pre-select all books except the first one in each group (keep one)
        const toDelete = new Set<string>();
        for (const group of groups) {
            // Keep the first book (the one with the highest current_page or most progress)
            const sorted = [...group.books].sort((a, b) => {
                // Sort by progress desc, then by current_page desc, then by created_at desc
                if (b.progress !== a.progress) return b.progress - a.progress;
                if (b.current_page !== a.current_page) return b.current_page - a.current_page;
                return (b.created_at || '').localeCompare(a.created_at || '');
            });
            // The first one (best) will be kept, the rest marked for deletion
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].id) toDelete.add(sorted[i].id!);
            }
        }
        setSelectedDeleteIds(toDelete);
        setShowDuplicatesModal(true);
    }, [findDuplicates]);

    const toggleDuplicateSelection = (bookId: string) => {
        setSelectedDeleteIds(prev => {
            const next = new Set(prev);
            if (next.has(bookId)) {
                next.delete(bookId);
            } else {
                next.add(bookId);
            }
            return next;
        });
    };

    const handleDeleteDuplicates = async () => {
        if (selectedDeleteIds.size === 0) return;

        setDuplicatesDeleting(true);
        try {
            await deleteMultipleBooks(Array.from(selectedDeleteIds));
            // Close modal and refresh
            setShowDuplicatesModal(false);
            setDuplicateGroups([]);
            setSelectedDeleteIds(new Set());
            const refreshedBooks = await getUserBooks();
            setBooks(refreshedBooks);
        } catch (err) {
            console.error('Failed to delete duplicates:', err);
        } finally {
            setDuplicatesDeleting(false);
        }
    };

    const handleCloseDuplicatesModal = () => {
        setShowDuplicatesModal(false);
        setDuplicateGroups([]);
        setSelectedDeleteIds(new Set());
    };

    // Fixed timer: uses refs to avoid stale closures
    const startTimer = () => {
        const minutes = parseInt(timerInputRef.current?.value || '15');
        timerDisplayRef.current = { minutes, seconds: 0 };
        setTimerDisplay(formatTime(minutes, 0));
        setIsTimerRunning(true);

        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
        }

        timerIntervalRef.current = setInterval(() => {
            const { minutes: m, seconds: s } = timerDisplayRef.current;
            if (s > 0) {
                timerDisplayRef.current = { minutes: m, seconds: s - 1 };
            } else if (m > 0) {
                timerDisplayRef.current = { minutes: m - 1, seconds: 59 };
            } else {
                clearInterval(timerIntervalRef.current!);
                timerIntervalRef.current = null;
                setIsTimerRunning(false);
                return;
            }
            const { minutes: newM, seconds: newS } = timerDisplayRef.current;
            setTimerDisplay(formatTime(newM, newS));
        }, 1000);
    };

    const stopTimer = () => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        setIsTimerRunning(false);
        // Keep the current display showing the stopped time
    };

    const formatTime = (minutes: number, seconds: number) => {
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Chronometer functions - counts up forever
    const formatChronoTime = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const startChrono = () => {
        if (isChronoRunning) return;
        setIsChronoRunning(true);
        chronoIntervalRef.current = setInterval(() => {
            chronoTimeRef.current += 1;
            setChronoDisplay(formatChronoTime(chronoTimeRef.current));
        }, 1000);
    };

    const stopChrono = () => {
        if (chronoIntervalRef.current) {
            clearInterval(chronoIntervalRef.current);
            chronoIntervalRef.current = null;
        }
        setIsChronoRunning(false);
    };

    const resetChrono = () => {
        if (chronoIntervalRef.current) {
            clearInterval(chronoIntervalRef.current);
            chronoIntervalRef.current = null;
        }
        chronoTimeRef.current = 0;
        setChronoDisplay('00:00:00');
        setIsChronoRunning(false);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            setSubmittedSearch(searchQuery);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSubmittedSearch('');
    };

    const handlePageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, book: Book) => {
        if (e.key === 'Enter') {
            const input = e.target as HTMLInputElement;
            const newPage = parseInt(input.value) || 0;
            handlePageUpdate(book, newPage);
        }
    };

    const completedBooks = books.filter(b => b.total_pages > 0 && b.current_page >= b.total_pages);
    const activeReadingBooks = books
        .filter(b => !(b.total_pages > 0 && b.current_page >= b.total_pages) && b.current_page > 0)
        .sort((a, b) => b.current_page - a.current_page);
    const notStartedBooks = books.filter(b => b.current_page === 0);

    const tagMatch = submittedSearch.match(/^(#\w+)\s*(.*)/i);
    const activeTag = tagMatch ? tagMatch[1].toLowerCase() : null;
    const textSearch = tagMatch ? tagMatch[2].trim() : submittedSearch.trim();

    const getFilteredBooks = () => {
        if (!submittedSearch) return [];

        let filtered = books;

        if (activeTag === '#completed') {
            filtered = completedBooks;
        } else if (activeTag === '#reading') {
            filtered = activeReadingBooks;
        } else if (activeTag === '#unread') {
            filtered = notStartedBooks;
        }

        if (textSearch) {
            filtered = filtered.filter(b =>
                b.title.toLowerCase().includes(textSearch.toLowerCase())
            );
        }

        return filtered;
    };

    const searchFiltered = getFilteredBooks();

    const getSearchHeader = () => {
        if (!submittedSearch) return '';
        const count = searchFiltered.length;
        const label = activeTag ? `${activeTag} ` : '';
        return `${label}Results (${count})`;
    };

    const totalPagesRead = books.reduce((sum, b) => sum + b.current_page, 0);
    const totalBooksCount = books.length;
    const completedCount = completedBooks.length;

    const renderBookCard = (book: Book) => (
        <div key={book.id} className="book-card">
            <div className="book-card-top">
                <h3 className="book-title">{book.title}</h3>
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={() => openEditModal(book)}
                        className="book-action-btn"
                        title="Edit book details"
                        aria-label="Edit book"
                    >
                        <i className="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button
                        onClick={() => setDeleteTarget(book)}
                        className="book-action-btn book-action-btn--danger"
                        title="Delete book"
                        aria-label="Delete book"
                    >
                        <i className="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <div className="book-card-details">
                <div className="flex items-center gap-2">
                    <label className="book-detail-label">Page:</label>
                    <input
                        type="number"
                        defaultValue={book.current_page}
                        key={book.id + '-' + book.current_page}
                        onKeyDown={(e) => handlePageKeyDown(e, book)}
                        className="book-page-input"
                        min="0"
                        max={book.total_pages > 0 ? book.total_pages : undefined}
                    />
                    {book.total_pages > 0 && (
                        <span className="text-xs opacity-50">/ {book.total_pages}</span>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-1">
                    <div className="progress-bar flex-1 h-1.5">
                        <div
                            className="progress-fill"
                            style={{ width: `${book.progress}%` }}
                        ></div>
                    </div>
                    <span className="book-progress-pct">{book.progress}%</span>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <Title title="Books" />
            <div className="books-page-wrapper">
                <div className="dashboard-section books-section">
                    <div className="books-card">
                        {/* Stats + Top Bar */}
                        <div className="books-stats">
                            <div className="books-stat-item">
                                <span className="books-stat-label">Total Books</span>
                                <span className="books-stat-value">{totalBooksCount}</span>
                            </div>
                            <div className="books-stat-item">
                                <span className="books-stat-label">Pages Read</span>
                                <span className="books-stat-value">{totalPagesRead}</span>
                            </div>
                            <div className="books-stat-item">
                                <span className="books-stat-label">Completed</span>
                                <span className="books-stat-value">{completedCount}</span>
                            </div>
                        </div>

                        <div className="books-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => setShowAddForm(true)} className="btn-action">
                                    <i className="i-lucide-plus mr-1"></i>Add Book
                                </button>
                                <button onClick={handleExport} className="btn-action" disabled={totalBooksCount === 0}>
                                    <i className="i-lucide-download mr-1"></i>Export
                                </button>
                                <button onClick={() => setShowImportModal(true)} className="btn-action">
                                    <i className="i-lucide-upload mr-1"></i>Import
                                </button>
                                <button onClick={handlePickRandom} className="btn-action" disabled={notStartedBooks.length === 0}>
                                    Random Unread
                                </button>
                                <button onClick={handleCheckDuplicates} className="btn-action" disabled={totalBooksCount < 2}>
                                    Check Duplicates
                                </button>
                            </div>

                            <div className="timer-section chrono-section">
                                <span className="timer-label">Chrono:</span>
                                <span className="chrono-display">{chronoDisplay}</span>
                                {isChronoRunning ? (
                                    <>
                                        <button onClick={stopChrono} className="timer-btn timer-btn--stop">
                                            <i className="i-lucide-pause mr-1"></i>Stop
                                        </button>
                                        <button onClick={resetChrono} className="timer-btn timer-btn--reset" title="Reset">
                                            <i className="fa-solid fa-rotate-right"></i>
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={startChrono} className="timer-btn timer-btn--start">
                                            <i className="i-lucide-play mr-1"></i>Start
                                        </button>
                                        <button onClick={resetChrono} className="timer-btn timer-btn--reset" title="Reset">
                                            <i className="fa-solid fa-rotate-right"></i>
                                        </button>
                                    </>
                                )}
                            </div>
                            <div className="timer-section">
                                <span className="timer-label">Timer:</span>
                                {isTimerRunning ? (
                                    <>
                                        <span className="timer-display">{timerDisplay}</span>
                                        <button onClick={stopTimer} className="timer-btn timer-btn--stop">
                                            <i className="i-lucide-pause mr-1"></i>Stop
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <input
                                            ref={timerInputRef}
                                            type="number"
                                            defaultValue={15}
                                            className="timer-input"
                                            min="1"
                                        />
                                        <span className="timer-unit">min</span>
                                        <button onClick={startTimer} className="timer-btn timer-btn--start">
                                            <i className="i-lucide-play mr-1"></i>Start
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Add Book Modal */}
                        {showAddForm && (
                            <div className="import-modal-overlay" onClick={(e) => {
                                if (e.target === e.currentTarget) resetForm();
                            }}>
                                <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                                    <h3 className="mb-4">Add New Book</h3>
                                    <form onSubmit={handleSubmit}>
                                        <div className="mb-4">
                                            <label className="form-label">Title</label>
                                            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="form-control" placeholder="Book title" required />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="form-label">Total Pages</label>
                                                <input type="number" value={totalPages} onChange={(e) => setTotalPages(e.target.value)} className="form-control" placeholder="Total pages" min="0" />
                                            </div>
                                            <div>
                                                <label className="form-label">Current Page</label>
                                                <input type="number" value={currentPageInput} onChange={(e) => setCurrentPageInput(e.target.value)} className="form-control" placeholder="Current page" min="0" />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end mt-5">
                                            <button type="button" onClick={resetForm} className="btn-form-cancel">Cancel</button>
                                            <button type="submit" className="btn-form-submit">Add Book</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Books Content */}
                        {!showAddForm && (
                            loading ? (
                                <div className="profile-loading">
                                    <div className="profile-loading-spinner"></div>
                                    <p>Loading books...</p>
                                </div>
                            ) : books.length === 0 ? (
                                <div className="books-empty">
                                    <i className="i-lucide-book-open books-empty-icon"></i>
                                    <p className="books-empty-title">No books added yet</p>
                                    <p className="books-empty-text">Add your first book or import from CSV to start tracking!</p>
                                </div>
                            ) : (
                                <div className="books-two-col">
                                    <div className="books-left-col">
                                        <div className="search-container">
                                            <div className="search-input-wrapper">
                                                <i className="search-input-icon fa-solid fa-magnifying-glass"></i>
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    onKeyDown={handleSearchKeyDown}
                                                    className="search-input"
                                                    placeholder='Search books... (try #completed, #reading, #unread)'
                                                />
                                                {(searchQuery || submittedSearch) && (
                                                    <button
                                                        className="search-clear-btn"
                                                        onClick={clearSearch}
                                                        aria-label="Clear search"
                                                    >
                                                        <i className="fa-solid fa-xmark"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="books-scroll-area">
                                            {submittedSearch && (
                                                <div>
                                                    <div className="books-section-header">
                                                        <i className="i-lucide-search"></i>
                                                        {getSearchHeader()}
                                                    </div>
                                                    {searchFiltered.length > 0 ? (
                                                        <div className="flex flex-col gap-2 mt-3">
                                                            {(() => {
                                                                const { grouped, ungrouped } = groupBooksByPrefix(searchFiltered);
                                                                return (
                                                                    <>
                                                                        {grouped.map((group) => (
                                                                            <div key={group.groupName} className="book-group">
                                                                                <div className="book-group-header">
                                                                                    <i className="fa-solid fa-layer-group"></i>
                                                                                    {group.groupName}
                                                                                    <span className="book-group-count">{group.books.length}</span>
                                                                                </div>
                                                                                {group.books.map(renderBookCard)}
                                                                            </div>
                                                                        ))}
                                                                        {ungrouped.length > 0 && (
                                                                            <div className="book-group">
                                                                                <div className="book-group-header">
                                                                                    <i className="fa-regular fa-bookmark"></i>
                                                                                    Other Books
                                                                                    <span className="book-group-count">{ungrouped.length}</span>
                                                                                </div>
                                                                                {ungrouped.map(renderBookCard)}
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm opacity-50 mt-2">No books match your search.</p>
                                                    )}
                                                </div>
                                            )}

                                            {!submittedSearch && notStartedBooks.length > 0 && (
                                                <div className="mt-2">
                                                    <div className="text-xs opacity-40">
                                                        {notStartedBooks.length} unread books &mdash; press Enter to search
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="books-right-col">
                                        <div className="books-section-header">
                                            <i className="i-lucide-book-open"></i>
                                            Currently Reading
                                        </div>
                                        {activeReadingBooks.length > 0 ? (
                                            <div className="books-scroll-area">
                                                <div className="flex flex-col gap-2 mt-3">
                                                    {activeReadingBooks.map(renderBookCard)}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="books-empty py-6">
                                                <p className="books-empty-text">No books in progress.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Edit Book Modal */}
            {editModalBook && (
                <div className="import-modal-overlay" onClick={(e) => {
                    if (e.target === e.currentTarget) closeEditModal();
                }}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Edit Book</h3>
                        <form onSubmit={handleEditSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Title</label>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="form-control"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Total Pages</label>
                                    <input
                                        type="number"
                                        value={editTotalPages}
                                        onChange={(e) => setEditTotalPages(e.target.value)}
                                        className="form-control"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Current Page</label>
                                    <input
                                        type="number"
                                        value={editCurrentPage}
                                        onChange={(e) => setEditCurrentPage(e.target.value)}
                                        className="form-control"
                                        min="0"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" onClick={closeEditModal} className="btn-form-cancel" disabled={editLoading}>Cancel</button>
                                <button type="submit" className="btn-form-submit" disabled={editLoading}>
                                    {editLoading ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="import-modal-overlay" onClick={(e) => {
                    if (e.target === e.currentTarget) setDeleteTarget(null);
                }}>
                    <div className="import-modal-card delete-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Book</h3>
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

            {/* Random Book Modal */}
            {showRandomModal && randomBook && (
                <div className="import-modal-overlay" onClick={(e) => {
                    if (e.target === e.currentTarget) setShowRandomModal(false);
                }}>
                    <div className="import-modal-card random-book-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Random Pick!</h3>
                        {randomBook.total_pages > 0 && (
                            <p className="text-sm opacity-70 mb-3 text-center">{randomBook.total_pages} pages</p>
                        )}
                        <h4 className="font-bold text-lg italic mb-5 text-center">{randomBook.title}</h4>
                        <div className="flex gap-2 mt-5">
                            <button
                                type="button"
                                onClick={handlePickRandom}
                                className="btn-form-cancel flex-1 text-center justify-center"
                            >
                                Pick Another
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowRandomModal(false);
                                    openEditModal(randomBook);
                                }}
                                className="btn-form-submit flex-1 text-center justify-center"
                            >
                                Start Reading
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowRandomModal(false)}
                                className="btn-form-cancel flex-1 text-center justify-center"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="import-modal-overlay">
                    <div className="import-modal-card">
                        <h3 className="mb-4">Import Books from CSV</h3>
                        <p className="text-sm opacity-70 mb-2">
                            CSV format: <code className="bg-white/10 px-1 rounded">title,total_pages,current_page</code>
                        </p>
                        <p className="text-xs opacity-60 mb-4">
                            • If total_pages is empty, it will be set to 0 (Unknown)<br />
                            • If current_page is empty, it will be set to 0
                        </p>
                        {importError && (<div className="auth-error mb-3">{importError}</div>)}
                        <input type="file" accept=".csv,text/csv" onChange={handleImport} className="form-control mb-4" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowImportModal(false)} className="btn-form-cancel">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Duplicates Modal */}
            {showDuplicatesModal && (
                <div className="import-modal-overlay" onClick={handleCloseDuplicatesModal}>
                    <div className="import-modal-card duplicates-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Manage Duplicate Books</h3>

                        {duplicateGroups.length === 0 ? (
                            <div className="duplicates-empty">
                                <i className="fa-solid fa-check-circle duplicates-empty-icon"></i>
                                <p>No duplicate titles found! All books have unique titles.</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm opacity-70 mb-3">
                                    Found <strong>{duplicateGroups.length}</strong> duplicate title group{duplicateGroups.length > 1 ? 's' : ''}.
                                    Below each group, the first entry (best progress) will be kept. Uncheck any you want to keep as well.
                                </p>

                                <div className="duplicates-scroll-area">
                                    {duplicateGroups.map((group, groupIdx) => {
                                        // Sort: best kept first (checked = false, since we pre-marked all but best for deletion)
                                        const sorted = [...group.books].sort((a, b) => {
                                            if (b.progress !== a.progress) return b.progress - a.progress;
                                            if (b.current_page !== a.current_page) return b.current_page - a.current_page;
                                            return (b.created_at || '').localeCompare(a.created_at || '');
                                        });

                                        return (
                                            <div key={groupIdx} className="duplicate-group">
                                                <div className="duplicate-group-header">
                                                    <i className="fa-solid fa-copy"></i>
                                                    <span>"{group.title}"</span>
                                                    <span className="duplicate-count">{sorted.length} copies</span>
                                                </div>
                                                <div className="duplicate-books-list">
                                                    {sorted.map((book, bookIdx) => {
                                                        const isBest = bookIdx === 0;
                                                        return (
                                                            <label
                                                                key={book.id}
                                                                className={`duplicate-book-item ${isBest ? 'duplicate-book-item--kept' : ''}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedDeleteIds.has(book.id!)}
                                                                    onChange={() => {
                                                                        // Cannot delete the last remaining book in a group
                                                                        const keptCount = sorted.filter(b => !selectedDeleteIds.has(b.id!) || b.id === book.id).length;
                                                                        if (!selectedDeleteIds.has(book.id!) && keptCount <= 1) return;
                                                                        toggleDuplicateSelection(book.id!);
                                                                    }}
                                                                    disabled={duplicatesDeleting}
                                                                />
                                                                <div className="duplicate-book-info">
                                                                    <span className="duplicate-book-title">
                                                                        {isBest && <span className="duplicate-best-badge">KEPT</span>}
                                                                        {book.title}
                                                                    </span>
                                                                    <span className="duplicate-book-meta">
                                                                        Page {book.current_page}/{book.total_pages} &middot; {book.progress}% &middot; {book.status}
                                                                    </span>
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="duplicates-summary">
                                    <span>
                                        Deleting <strong>{selectedDeleteIds.size}</strong> book{selectedDeleteIds.size !== 1 ? 's' : ''}
                                    </span>
                                </div>

                                <div className="flex gap-2 justify-end mt-4">
                                    <button
                                        type="button"
                                        onClick={handleCloseDuplicatesModal}
                                        className="btn-form-cancel"
                                        disabled={duplicatesDeleting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeleteDuplicates}
                                        className="btn-form-submit btn-form-submit--danger"
                                        disabled={selectedDeleteIds.size === 0 || duplicatesDeleting}
                                    >
                                        {duplicatesDeleting ? 'Deleting...' : `Delete ${selectedDeleteIds.size} Duplicate${selectedDeleteIds.size !== 1 ? 's' : ''}`}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default BooksPage;