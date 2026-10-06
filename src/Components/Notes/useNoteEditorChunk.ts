import { useEffect, useState } from 'react';

/**
 * The TipTap editor chunk, fetched once and shared by everything on the page.
 *
 * TipTap and ProseMirror are the heaviest thing the notes route loads and nothing
 * outside it needs them, so the editor stays in its own chunk. What this module
 * adds is *when* that chunk is asked for and what the page does while it is
 * coming, because the default behaviour is what made a note arrive in pieces:
 *
 *   - `lazy()` is not used, deliberately. It discovers an already-resolved chunk
 *     by attaching `.then`, which settles on a microtask, so the first render
 *     still reads as pending, suspends, and paints its fallback -- a title row
 *     with no body under it, for one frame. `DashboardPage` hits the same wall
 *     and says so at length; this is that answer, applied to the notes editor.
 *   - Nothing is rendered until the component itself is in hand, so the title,
 *     the icon, the tags and the body all appear in the same commit. The page's
 *     toolbar stays, because it is the editor's header and not part of the page
 *     being shown.
 *   - The workspace holds the splash screen (`useBootHold`) until the chunk has
 *     settled, so on a cold load there is nothing half-drawn underneath it.
 *
 * The fetch is started by hand rather than from the top of this module. `NotesPage`
 * is in the main bundle, so a module-scope `import()` here would pull the editor
 * down on every app load for the benefit of the routes that never open a note.
 */
type NoteEditorChunk = typeof import('./NoteEditor');
type NoteEditorComponent = NoteEditorChunk['default'];

interface NoteEditorChunkState {
    /** The editor, or null while it is still arriving -- or if the chunk failed. */
    Editor: NoteEditorComponent | null;
    /** True once the chunk has settled either way. The boot gate waits on this. */
    settled: boolean;
}

let pending: Promise<NoteEditorChunk> | null = null;
let resolved: NoteEditorChunk | null = null;

/**
 * Start the download, or hand back the one already in flight.
 *
 * Idempotent, so every caller can ask without coordinating: the first one starts
 * the fetch and the rest join it. Called on mount by both the workspace and the
 * pane, and again by anyone who wants the editor warm before it is needed.
 */
export const prefetchNoteEditor = (): Promise<NoteEditorChunk> => {
    pending ??= import('./NoteEditor').then(module => {
        resolved = module;
        return module;
    });
    return pending;
};

/**
 * The editor component, once it is here.
 *
 * `settled` is tracked separately from `Editor` for the same reason
 * `DashboardPage` tracks its charts that way: a cached page pointing at chunks a
 * deploy has since deleted rejects, and a gate waiting on "the component is not
 * null" would hold the splash for ever. `undefined` and "never arrived" have to
 * be different answers, so they are two pieces of state.
 */
export const useNoteEditorChunk = (): NoteEditorChunkState => {
    // Read from the module cache rather than starting null, so a second visit to
    // the page renders the editor on the first commit instead of after an effect.
    const [state, setState] = useState<NoteEditorChunkState>(() =>
        resolved
            ? { Editor: resolved.default, settled: true }
            : { Editor: null, settled: false },
    );

    useEffect(() => {
        let active = true;
        prefetchNoteEditor().then(
            module => {
                if (active) setState({ Editor: module.default, settled: true });
            },
            () => {
                // Settled, but with no editor in it. The page is still worth showing,
                // and it is the pane's own fallback that says the body is unavailable.
                if (active) setState({ Editor: null, settled: true });
            },
        );
        return () => {
            active = false;
        };
    }, []);

    return state;
};