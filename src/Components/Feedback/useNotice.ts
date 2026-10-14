/**
 * The hook half of the notice system, kept out of `NoticeProvider.tsx`.
 *
 * Separate because of fast refresh, and that rule is right: a module that
 * exports both a component and a hook only hot-reloads correctly when nothing
 * changes the component's shape. Editing the provider then blanks the screen to
 * the fallback boundary instead of swapping in the new code, which is a
 * miserable thing to hit while working on the thing that shows every error in
 * the app.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NoticeContext, type NoticeApi } from './noticeContext';

export type { NoticeApi, NoticeKind, Notice } from './noticeContext';

/**
 * The one way to raise a message.
 *
 * Throws rather than returning a no-op when there is no provider, because a
 * silently dropped error is precisely the failure this whole arrangement
 * exists to remove -- and a missing provider is a wiring mistake that should
 * surface immediately rather than becoming a message that never appears.
 */
export const useNotice = (): NoticeApi => {
    const api = useContext(NoticeContext);
    if (!api) throw new Error('useNotice must be used inside <NoticeProvider>.');
    return api;
};

/**
 * `notify` bound to `error`, which is what almost every caller wants.
 *
 * Naming it `error` rather than making everyone write `notify('error', ...)` is
 * the difference between a form that reports its own failure and one that
 * quietly swallows it. The default kind of a message is the one that matters.
 */
export const useErrorNotice = () => {
    const { notify } = useNotice();
    return useCallback((message: string) => notify('error', message), [notify]);
};

/**
 * Turn a thrown value into the sentence to show.
 *
 * Used everywhere a `catch` needs a message, so that one failed request is
 * described the same way whichever form caught it. `Error` covers essentially
 * everything real here -- Supabase rejects with an `Error`, and the vault
 * throws `Error` subclasses carrying their own wording -- and the `??` fallback
 * is only for a rejected promise with nothing in it, which must still say
 * something rather than render `undefined` in a popup.
 */
export const messageOf = (err: unknown, fallback = 'Something went wrong.'): string =>
    (err instanceof Error && err.message) || fallback;

/**
 * The shape every form here already had, pointed at the notice stack.
 *
 * A dozen forms each held `const [error, setError] = useState(null)` and
 * rendered `{error && <p className="auth-error">{error}</p>}` somewhere below the
 * fields. That is the pattern this hook exists to retire: the error appears
 * wherever the author happened to put it, which on a long form on a phone is
 * below the fold -- so a failed save reads as a button that did nothing.
 *
 * The API matches the one they already used, so adopting it is two edits and a
 * deleted render block rather than a rewrite:
 *
 *     const [error, raiseError, clearError] = useInlineError();
 *     raiseError(err instanceof Error ? err.message : 'Could not save.');
 *
 * `raiseError` returns the message as well as storing it, for a caller that
 * wants to branch on it afterwards.
 *
 * `error` is still returned, so a form can keep rendering it next to the field
 * that caused it when that is genuinely the right place -- a validation message
 * is not the same thing as a failed save, and only the latter belongs at the top
 * of the screen.
 */
export const useInlineError = (): [string | null, (message: string) => string, () => void] => {
    const [error, setError] = useState<string | null>(null);
    const { notify, dismiss } = useNotice();
    const idRef = useRef<number | null>(null);

    const raise = useCallback((message: string) => {
        // Withdraw the previous one first. Two errors stacked at the top of the
        // screen puts the newest below the older, and the newest is the one the
        // user just caused.
        if (idRef.current !== null) dismiss(idRef.current);
        idRef.current = notify('error', message);
        setError(message);
        return message;
    }, [notify, dismiss]);

    const clear = useCallback(() => {
        if (idRef.current !== null) {
            dismiss(idRef.current);
            idRef.current = null;
        }
        setError(null);
    }, [dismiss]);

    // A form that unmounts mid-request must not leave a message behind for a
    // page the user has already left.
    useEffect(() => () => {
        if (idRef.current !== null) dismiss(idRef.current);
    }, [dismiss]);

    return [error, raise, clear];
};
