import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createNote,
    deleteNote,
    getNoteById,
    getUserNotes,
    togglePinNote,
    updateNote,
} from '../services/noteService';
import type { Note } from '../services/noteService';
import { queryKeys } from '../utils/queryKeys';

export const useNotes = () =>
    useQuery({
        queryKey: queryKeys.notes,
        queryFn: getUserNotes,
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
        mutationFn: (note: { title?: string | null; content?: string; notes_color?: string | null }) =>
            createNote(note),
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

export const useDeleteNote = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteNote(id),
        onSuccess: (_data, id) => {
            qc.setQueryData(queryKeys.note(id), null);
            qc.invalidateQueries({ queryKey: queryKeys.notes });
            onDone?.();
        },
    });
};

// Pinning bypasses useUpdateNote on purpose: the editor page holds the note in
// local state and owns its own autosave, so routing a pin through that
// mutation would race the editor's next write.
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
