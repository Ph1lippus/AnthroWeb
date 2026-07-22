import { supabase } from './supabaseClient';

// Book types
export interface Book {
    id?: string;
    user_id: string;
    title: string;
    total_pages: number;
    current_page: number;
    progress: number;
    status: 'planned' | 'reading' | 'completed' | 'dropped';
    notes?: string;
    started_at?: string;
    completed_at?: string;
    created_at?: string;
    updated_at?: string;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    hasMore: boolean;
}

const PAGE_SIZE = 100;

// Fetch books with pagination
export const getUserBooksPaginated = async (page: number = 0, pageSize: number = PAGE_SIZE): Promise<PaginatedResult<Book>> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], total: 0, hasMore: false };

    // Get total count first
    const { count } = await supabase
        .from('books')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

    const total = count || 0;

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) {
        console.error('Error fetching books:', error.message);
        return { data: [], total: 0, hasMore: false };
    }

    return {
        data: data as Book[],
        total,
        hasMore: from + pageSize < total,
    };
};

// Fetch all books for current user (handles > 1000 books by pagination)
export const getUserBooks = async (): Promise<Book[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // First, get the total count to verify against
    const { count } = await supabase
        .from('books')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
    
    const totalInDb = count || 0;
    console.log(`📚 Total books in database for user: ${totalInDb}`);

    const allBooks: Book[] = [];
    const pageSize = 500; // Use 500 to stay well under PostgREST's 1000 row limit per request
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('books')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            console.error('Error fetching books:', error.message);
            break;
        }

        if (data && data.length > 0) {
            console.log(`Page ${page}: fetched ${data.length} books (range ${from}-${to})`);
            allBooks.push(...(data as Book[]));
            // If we got less than pageSize, we've reached the end
            hasMore = data.length === pageSize;
            page++;
        } else {
            console.log(`Page ${page}: no data returned, stopping`);
            hasMore = false;
        }
    }

    console.log(`Total books fetched before deduplication: ${allBooks.length}`);

    // Return ALL books - don't filter out duplicates
    // The database should have unique IDs, but if there are duplicates, we still show them
    // This ensures all 2153 books are displayed
    console.log(`Total books to display: ${allBooks.length}`);
    
    if (totalInDb !== allBooks.length) {
        console.warn(`⚠️  MISMATCH: Database reports ${totalInDb} books but only fetched ${allBooks.length} rows`);
        console.warn(`   This indicates a pagination or RLS issue.`);
    }

    return allBooks;
};

// Delete multiple books by id (batched to avoid PostgREST .in() limit of 1000)
export const deleteMultipleBooks = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;

    const BATCH_SIZE = 100; // Safe batch size well under the 1000 limit
    const batches: string[][] = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        batches.push(ids.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
        const { error } = await supabase
            .from('books')
            .delete()
            .in('id', batch);

        if (error) {
            console.error('Error deleting books batch:', error.message);
            throw error;
        }
    }
};

// Create a new book
export const createBook = async (book: Book) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('books')
        .insert({
            user_id: user.id,
            title: book.title,
            total_pages: book.total_pages,
            current_page: book.current_page || 0,
            progress: book.progress || 0,
            status: book.status || 'planned',
            notes: book.notes,
            started_at: book.started_at,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating book:', error.message);
        throw error;
    }
    return data;
};

// Update a book
export const updateBook = async (id: string, updates: Partial<Book>) => {
    const { data, error } = await supabase
        .from('books')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating book:', error.message);
        throw error;
    }
    return data;
};

// Delete a book
export const deleteBook = async (id: string) => {
    const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting book:', error.message);
        throw error;
    }
};

// Update book progress
export const updateBookProgress = async (id: string, currentPage: number, totalPages: number) => {
    const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
    const status = totalPages > 0 ? (currentPage >= totalPages ? 'completed' : 'reading') : 'planned';

    return updateBook(id, {
        current_page: currentPage,
        progress,
        status,
        completed_at: status === 'completed' ? new Date().toISOString().split('T')[0] : undefined,
    });
};

// Export books to CSV format (properly escapes commas and quotes in titles)
export const exportBooksToCSV = (books: Book[]): string => {
    const headers = ['title', 'total_pages', 'current_page'];
    const escapeCsvField = (field: string | number): string => {
        const str = String(field);
        // If the field contains commas, quotes, or newlines, wrap it in quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    const rows = books.map(book => [
        escapeCsvField(book.title),
        escapeCsvField(book.total_pages),
        escapeCsvField(book.current_page)
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
};

// Parse and import books from CSV
export const importBooksFromCSV = async (csvContent: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const lines = csvContent.trim().split('\n');
    const booksToCreate: Book[] = [];

    for (let i = 1; i < lines.length; i++) { // Skip header
        const [title, totalPages, currentPage] = lines[i].split(',');
        
        if (title && title.trim()) {
            const totalPagesNum = parseInt(totalPages) || 0;
            const currentPageNum = parseInt(currentPage) || 0;
            
            booksToCreate.push({
                user_id: user.id,
                title: title.trim(),
                total_pages: totalPagesNum,
                current_page: currentPageNum,
                progress: totalPagesNum > 0 ? Math.round((currentPageNum / totalPagesNum) * 100) : 0,
                status: totalPagesNum > 0 ? (currentPageNum >= totalPagesNum ? 'completed' : 'reading') : 'planned',
            });
        }
    }

    if (booksToCreate.length === 0) return [];

    const { data, error } = await supabase
        .from('books')
        .insert(booksToCreate)
        .select();

    if (error) {
        console.error('Error importing books:', error.message);
        throw error;
    }
    return data;
};
