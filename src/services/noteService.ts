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
    created_at?: string;
    updated_at?: string;
}

// Order pinned first, then most recently touched. Matches notes_user_pinned_updated_idx
// and notes_user_updated_idx from migration 0006.
export const getUserNotes = async (): Promise<Note[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching notes:', error.message);
        return [];
    }

    return data as Note[];
};

// Single note for the full-page editor. Scoped to the caller's id so a guessed
// uuid in the URL cannot read another account's note.
export const getNoteById = async (id: string): Promise<Note | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error('Error fetching note:', error.message);
        throw error;
    }

    return (data as Note) ?? null;
};

// Create a new note. Title defaults to empty rather than being required, so
// "New note" can insert the row and hand the user straight to the editor.
export const createNote = async (note: { title?: string | null; content?: string; is_pinned?: boolean; notes_color?: string | null }) => {
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

// Delete a note
export const deleteNote = async (id: string) => {
    const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting note:', error.message);
        throw error;
    }
};

// Toggle pin status
export const togglePinNote = async (id: string, isPinned: boolean) => {
    return updateNote(id, { is_pinned: !isPinned });
};
