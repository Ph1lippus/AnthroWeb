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
    /**
     * The page's accent, stored by palette id ('blue', 'red', ...) rather than by
     * hex -- see `utils/noteColors`. Null means Default, which is also how a
     * colour is removed. Rows written before ids were stored hold one of seven
     * legacy hexes, which `resolveNoteColor` still resolves.
     */
    notes_color?: string | null;
    /** Lucide icon name shown above the title. Rows written before the switch to
     *  lucide hold an emoji; `resolveNoteIcon` still resolves those. */
    notes_icon?: string | null;
    /** Cover image URL drawn above the page. */
    notes_cover?: string | null;
    /** Parent page id, or null for a top-level page. Migration 0007. */
    notes_parent_id?: string | null;
    /**
     * Order among the pages sharing this page's parent.
     *
     * Read as a fraction, not an index: a page dropped between two others takes
     * the midpoint of their positions, so a reorder writes one row instead of
     * renumbering every sibling. Ties fall back to newest first, which is what
     * every page written before this column existed sits at.
     *
     * A `numeric`, and typed `string | number` because that is what it arrives as
     * -- Postgres has no numeric type that is reliably a JS number. Read it
     * through `positionOf` in `utils/noteTree`, never directly: adding two of
     * these as strings concatenates them, and the midpoint is an addition.
     */
    notes_position?: string | number | null;
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
 * The `is('notes_deleted_at', null)` filter is the important part. Migration 0007
 * adds a trash, and a trashed page that still appears in the sidebar is worse than
 * a missing feature -- it looks like a live page and can be opened and edited.
 * Every read path that lists or resolves notes has to carry this filter.
 */
export const getUserNotes = async (): Promise<Note[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .is('notes_deleted_at', null)
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
        .not('notes_deleted_at', 'is', null)
        .order('notes_deleted_at', { ascending: false });

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

    query = includeTrashed ? query : query.is('notes_deleted_at', null);

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
    notes_position?: number;
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
            // Past its new siblings rather than at zero, so a page created inside
            // a folder lands under the pages already there instead of above them.
            notes_position: note.notes_position ?? 0,
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
        .update({ notes_deleted_at: new Date().toISOString() })
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
        .update({ notes_deleted_at: null })
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
        .not('notes_deleted_at', 'is', null);

    if (error) {
        console.error('Error emptying trash:', error.message);
        throw error;
    }
};

/**
 * Re-parent a page, promote it to the top level with null, and/or place it among
 * its new siblings.
 *
 * `position` is optional because the two callers are different jobs: the trash
 * and nesting paths only change the parent, while a drag has to say where in the
 * new order the page lands. A drag inside one group writes only the position,
 * so the parent is passed through unchanged rather than being recomputed.
 */
export const moveNote = async (id: string, parentId: string | null, position?: number) => {
    return updateNote(id, {
        notes_parent_id: parentId,
        ...(position === undefined ? {} : { notes_position: position }),
    });
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
