/**
 * The notice context, in its own module.
 *
 * Separate from both the provider and the hook because of fast refresh, and all
 * three placements are correct rather than fussy. A module that exports a
 * component *and* anything else only hot-reloads cleanly while that "anything
 * else" keeps its shape; edit the provider and the whole subtree blanks to the
 * Suspense fallback instead of swapping in the new code. Working on the thing
 * that shows every error in the app is the worst possible time to hit that.
 *
 * `react-refresh/only-export-components` catches it at lint time, which is the
 * point: the rule exists so this file gets made instead of the warning being
 * suppressed.
 */
import { createContext } from 'react';

export type NoticeKind = 'error' | 'success' | 'info';

export interface Notice {
    id: number;
    kind: NoticeKind;
    message: string;
}

export interface NoticeApi {
    /**
     * Show a message.
     *
     * Returns an id so a caller that wants to replace or withdraw its own message
     * -- a field that stops being valid, a dialog that closes -- can do so
     * without having to match on text.
     */
    notify: (kind: NoticeKind, message: string) => number;
    /** Withdraw one message. Safe to call with an id that has already expired. */
    dismiss: (id: number) => void;
}

export const NoticeContext = createContext<NoticeApi | null>(null);
