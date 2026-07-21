import { supabase } from './supabaseClient';

export interface Note {
    id?: string;
    user_id: string;
    title: string;
    content: string;
    is_pinned: boolean;
    created_at?: string;
    updated_at?: string;
}

// Fetch all notes for current user
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

// Create a new note
export const createNote = async (note: { title: string; content: string; is_pinned?: boolean }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('notes')
        .insert({
            user_id: user.id,
            title: note.title,
            content: note.content,
            is_pinned: note.is_pinned || false,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating note:', error.message);
        throw error;
    }
    return data;
};

// Update a note
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
    return data;
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