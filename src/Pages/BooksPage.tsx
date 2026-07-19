import React, { useState, useEffect, useRef } from 'react';
import Title from '../Components/Title';
import { getUserBooksPaginated, getUserBooks, createBook, updateBook, deleteBook, updateBookProgress, exportBooksToCSV, importBooksFromCSV } from '../services/bookService';
import type { Book } from '../services/bookService';

const PAGE_SIZE = 100;

const BooksPage: React.FC = () => {
    const [books, setBooks] = useState<Book[]>([]);
    const [totalBooksCount, setTotalBooksCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingBook, setEditingBook] = useState<Book | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [showCompleted, setShowCompleted] = useState(true);
    
    // Form state
    const [title, setTitle] = useState('');
    const [totalPages, setTotalPages] = useState('');
    const [currentPageInput, setCurrentPageInput] = useState('');
    
    // Timer state
    const [timerMinutes, setTimerMinutes] = useState(15);
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchBooks = async (page: number = 0, append: boolean = false) => {
        if (page === 0) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        const result = await getUserBooksPaginated(page, PAGE_SIZE);
        
        if (append) {
            setBooks(prev => [...prev, ...result.data]);
        } else {
            setBooks(result.data);
        }
        setTotalBooksCount(result.total);
        setHasMore(result.hasMore);
        setCurrentPage(page);
        setLoading(false);
        setLoadingMore(false);
    };

    useEffect(() => {
        const load = async () => {
            await fetchBooks(0, false);
        };
        load();
    }, []);

    const loadMore = () => {
        if (!loadingMore && hasMore) {
            fetchBooks(currentPage + 1, true);
        }
    };

    useEffect(() => {
        if (isTimerRunning) {
            timerRef.current = setInterval(() => {
                setTimerSeconds(prev => {
                    if (prev > 0) {
                        return prev - 1;
                    } else {
                        setTimerMinutes(m => {
                            if (m > 0) {
                                return m - 1;
                            } else {
                                setIsTimerRunning(false);
                                return 0;
                            }
                        });
                        return 59;
                    }
                });
            }, 1000);
        }
        
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isTimerRunning]);

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
                status: 'reading',
            });
        }
        
        resetForm();
        fetchBooks(0, false);
    };

    const handleEdit = (book: Book) => {
        setEditingBook(book);
        setTitle(book.title);
        setTotalPages(book.total_pages.toString());
        setCurrentPageInput(book.current_page.toString());
        setShowAddForm(true);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this book?')) {
            await deleteBook(id);
            fetchBooks(0, false);
        }
    };

    const handlePageUpdate = async (book: Book, newPage: number) => {
        await updateBookProgress(book.id!, newPage, book.total_pages);
        fetchBooks(0, false);
    };

    const handleExport = async () => {
        // For export, fetch all books
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
                fetchBooks(0, false);
            } catch {
                setImportError('Failed to import books. Please check your CSV format.');
            }
        };
        reader.readAsText(file);
    };

    const startTimer = () => {
        setTimerSeconds(0);
        setIsTimerRunning(true);
    };

    const stopTimer = () => {
        setIsTimerRunning(false);
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
    };

    const formatTime = (minutes: number, seconds: number) => {
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Separate completed vs reading books
    const completedBooks = books.filter(b => b.total_pages > 0 && b.current_page >= b.total_pages);
    const readingBooks = books
        .filter(b => !(b.total_pages > 0 && b.current_page >= b.total_pages))
        .sort((a, b) => {
            // Books with progress (current_page > 0) come first
            const aHasProgress = a.current_page > 0 ? 1 : 0;
            const bHasProgress = b.current_page > 0 ? 1 : 0;
            return bHasProgress - aHasProgress;
        });

    // Compute stats
    const totalPagesRead = books.reduce((sum, b) => sum + b.current_page, 0);
    const completedCount = completedBooks.length;

    const renderBookRow = (book: Book) => (
        <div key={book.id} className="book-card">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                {/* Title */}
                <div className="min-w-0">
                    <h3 className="book-title">{book.title}</h3>
                </div>

                {/* Next Page to Read */}
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        value={book.current_page}
                        onChange={(e) => handlePageUpdate(book, parseInt(e.target.value) || 0)}
                        className="book-page-input"
                        min="0"
                        max={book.total_pages > 0 ? book.total_pages : undefined}
                    />
                    {book.total_pages > 0 && (
                        <span className="text-sm opacity-50">/ {book.total_pages}</span>
                    )}
                </div>

                {/* Total Pages */}
                <div>
                    {book.total_pages > 0 ? (
                        <span className="book-total-pages">{book.total_pages}</span>
                    ) : (
                        <span className="book-total-pages unknown">Unknown</span>
                    )}
                </div>

                {/* Progress */}
                <div className="flex items-center gap-2">
                    <div className="progress-bar flex-1 h-2">
                        <div 
                            className="progress-fill" 
                            style={{ width: `${book.progress}%` }}
                        ></div>
                    </div>
                    <span className="book-progress-pct">
                        {book.progress}%
                    </span>
                </div>
            </div>
            
            {/* Actions Row */}
            <hr className="book-actions-divider" />
            <div className="flex gap-2 justify-end">
                <button
                    onClick={() => handleEdit(book)}
                    className="book-action-btn"
                    title="Edit book"
                >
                    <i className="i-lucide-edit"></i>
                </button>
                <button
                    onClick={() => handleDelete(book.id!)}
                    className="book-action-btn book-action-btn--danger"
                    title="Delete book"
                >
                    <i className="i-lucide-trash-2"></i>
                </button>
            </div>
        </div>
    );

    return (
        <>
            <Title title="Books" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section books-section">
                    <div className="dashboard-section__head">
                        <h2>Books</h2>
                        <span>Track your reading progress</span>
                    </div>

                    <div className="books-card">
                        {/* Stats Summary */}
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

                        {/* Top Bar with Actions and Timer */}
                        <div className="flex justify-between items-start flex-wrap gap-4 mt-6 mb-8">
                            {/* Action Buttons */}
                            <div className="flex gap-3 flex-wrap">
                                <button 
                                    onClick={() => setShowAddForm(true)}
                                    className="btn-action"
                                >
                                    <i className="i-lucide-plus mr-1"></i>
                                    Add Book
                                </button>
                                <button 
                                    onClick={handleExport}
                                    className="btn-action"
                                    disabled={totalBooksCount === 0}
                                >
                                    <i className="i-lucide-download mr-1"></i>
                                    Export
                                </button>
                                <button 
                                    onClick={() => setShowImportModal(true)}
                                    className="btn-action"
                                >
                                    <i className="i-lucide-upload mr-1"></i>
                                    Import
                                </button>
                            </div>

                            {/* Global Timer */}
                            <div className="timer-section">
                                <span className="timer-label">Reading Timer:</span>
                                <input
                                    type="number"
                                    value={timerMinutes}
                                    onChange={(e) => setTimerMinutes(parseInt(e.target.value) || 15)}
                                    className="timer-input"
                                    min="1"
                                    disabled={isTimerRunning}
                                />
                                <span className="timer-unit">min</span>
                                {isTimerRunning && (
                                    <span className="timer-display">
                                        {formatTime(timerMinutes, timerSeconds)}
                                    </span>
                                )}
                                {isTimerRunning ? (
                                    <button
                                        onClick={stopTimer}
                                        className="timer-btn timer-btn--stop"
                                    >
                                        <i className="i-lucide-pause mr-1"></i>
                                        Stop
                                    </button>
                                ) : (
                                    <button
                                        onClick={startTimer}
                                        className="timer-btn timer-btn--start"
                                    >
                                        <i className="i-lucide-play mr-1"></i>
                                        Start
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Add/Edit Form */}
                        {showAddForm && (
                            <div className="book-form-card mb-8">
                                <h3 className="mb-5">
                                    <i className={`i-lucide-${editingBook ? 'edit' : 'plus-circle'} mr-1`}></i>
                                    {editingBook ? 'Edit Book' : 'Add New Book'}
                                </h3>
                                <form onSubmit={handleSubmit}>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-3">
                                        <div>
                                            <label className="form-label">Title</label>
                                            <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                className="form-control"
                                                placeholder="Book title"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="form-label">Total Pages</label>
                                            <input
                                                type="number"
                                                value={totalPages}
                                                onChange={(e) => setTotalPages(e.target.value)}
                                                className="form-control"
                                                placeholder="Total pages (0 for unknown)"
                                                min="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="form-label">Current Page</label>
                                            <input
                                                type="number"
                                                value={currentPageInput}
                                                onChange={(e) => setCurrentPageInput(e.target.value)}
                                                className="form-control"
                                                placeholder="Current page (0 if not started)"
                                                min="0"
                                            />
                                        </div>
                                    </div>
                                    <hr className="book-actions-divider mb-4" />
                                    <div className="flex flex-col sm:flex-row gap-3 w-full">
                                        <button
                                            type="button"
                                            onClick={resetForm}
                                            className="btn-form-cancel flex-1"
                                        >
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn-form-submit flex-1">
                                            {editingBook ? 'Update' : 'Add'} Book
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Books List - hidden while showing add form */}
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
                                <div className="w-full">
                                    {/* Completed Books Section - Collapsible */}
                                    {completedBooks.length > 0 && (
                                        <div className="mb-8">
                                            <button
                                                onClick={() => setShowCompleted(!showCompleted)}
                                                className="books-section-header books-section-header--clickable"
                                            >
                                                <i className={`i-lucide-chevron-${showCompleted ? 'down' : 'right'} transition-transform`}></i>
                                                <i className="i-lucide-check-circle"></i>
                                                Completed ({completedBooks.length})
                                            </button>
                                            {showCompleted && (
                                                <div className="flex flex-col gap-3 mt-4">
                                                    <div className="books-header">
                                                        <div>Title</div>
                                                        <div>Next Page to Read</div>
                                                        <div>Total Pages</div>
                                                        <div>Progress</div>
                                                    </div>
                                                    {completedBooks.map(renderBookRow)}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Reading Books Section */}
                                    <div>
                                        <div className="books-section-header">
                                            <i className="i-lucide-book-open"></i>
                                            {readingBooks.length > 0 ? 'Currently Reading' : 'Your Library'}
                                        </div>
                                        {readingBooks.length > 0 ? (
                                            <div className="flex flex-col gap-3 mt-4">
                                                <div className="books-header">
                                                    <div>Title</div>
                                                    <div>Next Page to Read</div>
                                                    <div>Total Pages</div>
                                                    <div>Progress</div>
                                                </div>
                                                {readingBooks.map(renderBookRow)}
                                            </div>
                                        ) : completedBooks.length > 0 ? (
                                            <div className="books-empty">
                                                <p className="books-empty-text">All books completed! Great job!</p>
                                            </div>
                                        ) : null}
                                    </div>

                                    {/* Load More Button */}
                                    {hasMore && (
                                        <div className="text-center mt-6">
                                            <button
                                                onClick={loadMore}
                                                disabled={loadingMore}
                                                className="btn-action"
                                            >
                                                {loadingMore ? (
                                                    <>
                                                        <div className="profile-loading-spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0 }}></div>
                                                        Loading...
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="i-lucide-chevron-down mr-1"></i>
                                                        Load More ({totalBooksCount - books.length} remaining)
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <div className="import-modal-overlay">
                    <div className="import-modal-card">
                        <h3>Import Books from CSV</h3>
                        <p className="text-sm opacity-70 mb-2">
                            CSV format: <code className="bg-white/10 px-1 rounded">title,total_pages,current_page</code>
                        </p>
                        <p className="text-xs opacity-60 mb-4">
                            • If total_pages is empty, it will be set to 0 (Unknown)<br/>
                            • If current_page is empty, it will be set to 0
                        </p>
                        
                        {importError && (
                            <div className="auth-error mb-3">
                                {importError}
                            </div>
                        )}
                        
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={handleImport}
                            className="form-control mb-4"
                        />
                        
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowImportModal(false)}
                                className="btn-form-cancel"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default BooksPage;