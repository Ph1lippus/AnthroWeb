import { supabase } from './supabaseClient';

export interface Note {
    id?: string;
    user_id: string;
    // Nullable after migration 0006: a page is created blank and titled as you
    // type, so the first write has an empty title. The client renders that as
    // "Untitled" rather than rejecting it.
    title: string | null;
    content: string;
    is_pinned: boolean;
    notes_color?: string | null;
    /** Emoji shown beside the title. */
    notes_icon?: string | null;
    /** Cover image URL drawn above the page. */
    notes_cover?: string | null;
    /** Parent page id, or null for a top-level page. Migration 0007. */
    notes_parent_id?: string | null;
    /** When the note was thrown away, or null while it is live. */
    notes_deleted_at?: string | null;
    /** Free-form labels. */
    notes_tags?: string[] | null;
    created_at?: string;
    updated_at?: string;
}

/**
 * Live notes for the sidebar: pinned first, then most recently touched.
 *
 * The `is('deleted_at', null)` filter is the important part. Migration 0007 adds
 * a trash, and a trashed page that still appears in the sidebar is worse than a
 * missing feature -- it looks like a live page and can be opened and edited.
 * Every read path that lists or resolves notes has to carry this filter.
 */
export const getUserNotes = async (): Promise<Note[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching notes:', error.message);
        return [];
    }

    return data as Note[];
};

/** Thrown-away pages, newest deletion first. Backs the trash view. */
export const getTrashedNotes = async (): Promise<Note[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    if (error) {
        console.error('Error fetching trashed notes:', error.message);
        return [];
    }

    return data as Note[];
};

// Single note for the editor. Scoped to the caller's id so a guessed uuid in the
// URL cannot read another account's note.
//
// includeTrashed is only for the trash view's restore action; everything else
// must go through the default, or a thrown-away page reappears as editable.
export const getNoteById = async (id: string, includeTrashed = false): Promise<Note | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    let query = supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id);

    query = includeTrashed ? query : query.is('deleted_at', null);

    const { data, error } = await query.maybeSingle();

    if (error) {
        console.error('Error fetching note:', error.message);
        throw error;
    }

    return (data as Note) ?? null;
};

// Create a new page. Title defaults to empty rather than being required, so
// "New note" can insert the row and hand the user straight to the editor.
export const createNote = async (note: {
    title?: string | null;
    content?: string;
    is_pinned?: boolean;
    notes_color?: string | null;
    notes_icon?: string | null;
    notes_cover?: string | null;
    notes_parent_id?: string | null;
    notes_tags?: string[];
}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('notes')
        .insert({
            user_id: user.id,
            title: note.title ?? '',
            content: note.content ?? '',
            is_pinned: note.is_pinned || false,
            notes_color: note.notes_color ?? null,
            notes_icon: note.notes_icon ?? null,
            notes_cover: note.notes_cover ?? null,
            notes_parent_id: note.notes_parent_id ?? null,
            notes_tags: note.notes_tags ?? [],
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating note:', error.message);
        throw error;
    }
    return data as Note;
};

// Update a note. Every write stamps updated_at, which is what the list sorts on
// -- so autosave also drives "last edited" ordering. Callers doing rapid
// successive updates need their own ordering guard; see useUpdateNote.
export const updateNote = async (id: string, updates: Partial<Note>) => {
    const { data, error } = await supabase
        .from('notes')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating note:', error.message);
        throw error;
    }
    return data as Note;
};

/** Toggle pin status. */
export const togglePinNote = async (id: string, isPinned: boolean) => {
    return updateNote(id, { is_pinned: !isPinned });
};

/**
 * Throw a page away.
 *
 * A soft delete by default, so a mis-click is recoverable from the trash. The
 * permanent variant is only reachable from the trash view itself, where the user
 * has already seen what they are about to lose.
 *
 * Children are not touched: a page thrown away with sub-pages promotes them to
 * the top level, which is what the ON DELETE SET NULL in the schema does for a
 * hard delete and what keeps a trashed parent from stranding a live child.
 */
export const trashNote = async (id: string): Promise<Note> => {
    const { data, error } = await supabase
        .from('notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error trashing note:', error.message);
        throw error;
    }
    return data as Note;
};

/** Remove a page for good. Only ever called from the trash view. */
export const deleteNoteForever = async (id: string) => {
    const { error } = await supabase.from('notes').delete().eq('id', id);

    if (error) {
        console.error('Error deleting note:', error.message);
        throw error;
    }
};

/** Bring a page back out of the trash. */
export const restoreNote = async (id: string): Promise<Note> => {
    const { data, error } = await supabase
        .from('notes')
        .update({ deleted_at: null })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error restoring note:', error.message);
        throw error;
    }
    return data as Note;
};

/** Empty the trash. */
export const emptyTrash = async () => {
    const { error } = await supabase
        .from('notes')
        .delete()
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .not('deleted_at', 'is', null);

    if (error) {
        console.error('Error emptying trash:', error.message);
        throw error;
    }
};

/** Re-parent a page, or promote it to the top level with null. */
export const moveNote = async (id: string, parentId: string | null) => {
    return updateNote(id, { notes_parent_id: parentId });
};

/** Copy a page, including its colour, icon and tags but never its pinned state. */
export const duplicateNote = async (note: Note): Promise<Note> => {
    return createNote({
        title: note.title ? `${note.title} (copy)` : '',
        content: note.content,
        notes_color: note.notes_color ?? null,
        notes_icon: note.notes_icon ?? null,
        notes_cover: note.notes_cover ?? null,
        // The copy sits beside the original rather than inside it, which is what
        // makes the duplicate useful: nesting it would be circular.
        notes_parent_id: note.notes_parent_id ?? null,
        notes_tags: note.notes_tags ?? [],
    });
};
