import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createNote,
    deleteNoteForever,
    duplicateNote,
    emptyTrash,
    getNoteById,
    getTrashedNotes,
    getUserNotes,
    moveNote,
    restoreNote,
    togglePinNote,
    trashNote,
    updateNote,
} from '../services/noteService';
import type { Note } from '../services/noteService';
import { queryKeys } from '../utils/queryKeys';

export const useNotes = () =>
    useQuery({
        queryKey: queryKeys.notes,
        queryFn: getUserNotes,
    });

export const useTrashedNotes = () =>
    useQuery({
        queryKey: queryKeys.trashedNotes,
        queryFn: getTrashedNotes,
    });

// The full-page editor reads one note. maybeSingle in the service means a deleted
// or foreign id resolves to null rather than throwing, which the page renders as
// a not-found state instead of a crash.
export const useNote = (id: string | undefined) =>
    useQuery({
        queryKey: queryKeys.note(id ?? ''),
        queryFn: () => getNoteById(id!),
        enabled: !!id,
    });

export const useCreateNote = (onDone?: (note: Note) => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (note: {
            title?: string | null;
            content?: string;
            notes_color?: string | null;
            notes_icon?: string | null;
            notes_parent_id?: string | null;
        }) => createNote(note),
        onSuccess: (note) => {
            // Seeded into the cached list rather than only invalidated: the
            // workspace navigates straight to the new page and looks it up in this
            // list, so waiting on the refetch would flash the empty pane and, if
            // the list query happened to be fresh, never resolve at all.
            qc.setQueryData<Note[]>(queryKeys.notes, existing => [note, ...(existing ?? [])]);
            qc.setQueryData(queryKeys.note(note.id ?? ''), note);
            qc.invalidateQueries({ queryKey: queryKeys.notes });
            onDone?.(note);
        },
    });
};

// updateNote stamps updated_at, so an autosave also changes where the note sits
// in the list ordering. Patching the cached single-note row and invalidating the
// list keeps both views correct without refetching the note that was just
// written.
export const useUpdateNote = (id: string | undefined, onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (updates: Partial<Note>) => updateNote(id!, updates),
        onSuccess: (updated) => {
            qc.setQueryData(queryKeys.note(id ?? ''), updated);
            qc.invalidateQueries({ queryKey: queryKeys.notes });
            onDone?.();
        },
    });
};

/**
 * Throwing a page away.
 *
 * Also drops it from the cached single-note row and from the live list, so a
 * page thrown away while it is open closes immediately rather than sitting there
 * apparently still editable until the next refetch notices.
 */
export const useTrashNote = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => trashNote(id),
        onSuccess: (trashed) => {
            const id = trashed.id ?? '';
            qc.setQueryData<Note[]>(queryKeys.notes, existing =>
                (existing ?? []).filter(note => note.id !== id),
            );
            qc.setQueryData<Note[]>(queryKeys.trashedNotes, existing => [
                trashed,
                ...(existing ?? []),
            ]);
            qc.setQueryData(queryKeys.note(id), null);
            onDone?.();
        },
    });
};

export const useRestoreNote = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => restoreNote(id),
        onSuccess: restored => {
            const id = restored.id ?? '';
            qc.setQueryData<Note[]>(queryKeys.trashedNotes, existing =>
                (existing ?? []).filter(note => note.id !== id),
            );
            qc.setQueryData<Note[]>(queryKeys.notes, existing => [restored, ...(existing ?? [])]);
            qc.setQueryData(queryKeys.note(id), restored);
            qc.invalidateQueries({ queryKey: queryKeys.notes });
        },
    });
};

export const useDeleteNoteForever = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteNoteForever(id),
        onSuccess: (_data, id) => {
            qc.setQueryData<Note[]>(queryKeys.trashedNotes, existing =>
                (existing ?? []).filter(note => note.id !== id),
            );
            qc.setQueryData(queryKeys.note(id), null);
            qc.invalidateQueries({ queryKey: queryKeys.notes });
        },
    });
};

export const useEmptyTrash = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => emptyTrash(),
        onSuccess: () => {
            qc.setQueryData(queryKeys.trashedNotes, []);
            qc.invalidateQueries({ queryKey: queryKeys.notes });
            onDone?.();
        },
    });
};

export const useMoveNote = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
            moveNote(id, parentId),
        onSuccess: moved => {
            qc.setQueryData(queryKeys.note(moved.id ?? ''), moved);
            qc.invalidateQueries({ queryKey: queryKeys.notes });
        },
    });
};

export const useDuplicateNote = (onDone?: (note: Note) => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (note: Note) => duplicateNote(note),
        onSuccess: (copy) => {
            qc.setQueryData<Note[]>(queryKeys.notes, existing => [copy, ...(existing ?? [])]);
            qc.invalidateQueries({ queryKey: queryKeys.notes });
            onDone?.(copy);
        },
    });
};

// Pinning bypasses useUpdateNote on purpose: the editor page holds the note in
// local state and owns its own autosave, so routing a pin through that mutation
// would race the editor's next write.
export const useToggleNotePin = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) => togglePinNote(id, isPinned),
        onSuccess: (updated) => {
            qc.setQueryData(queryKeys.note(updated.id ?? ''), updated);
            qc.invalidateQueries({ queryKey: queryKeys.notes });
        },
    });
};
