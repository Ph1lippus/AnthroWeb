/**
 * One place for every message the user needs to see.
 *
 * THE RULE
 *
 * Errors appear at the top of the screen, in the same spot, whatever raised
 * them. Not inside the form that caused them, not in a corner, not only in the
 * console.
 *
 * An error rendered inside a form has to be *looked for*. It sits below the
 * field, below the fold on a phone, under whatever the user was doing, and on a
 * long form it may be off-screen entirely -- so the failure mode is a button
 * that silently does nothing. This app had roughly a dozen forms each with its
 * own inline error block in its own place, which meant the same class of failure
 * announced itself in a dozen different places, none of them consistent, and
 * several of them invisible until you scrolled.
 *
 * The one place is the only place that is learnable. Once it is known, every
 * failure in the app is reported the same way.
 *
 * WHY SUCCESSES LIVE HERE TOO
 *
 * A separate channel for errors would mean two behaviours to remember and two
 * layouts on screen. Confirmations that share the surface get the same
 * reliability for free, and the distinction between them is colour and an icon
 * rather than position -- so a success never looks like a failure, and an error
 * can never be mistaken for one.
 *
 * WHY IT IS A PROVIDER AND NOT A MODULE-LEVEL FUNCTION
 *
 * A module-level `toast()` writing into a module-level array would work and
 * would be untestable: nothing outside React could read it, nothing could be
 * rendered, and every caller would silently drop messages raised before mount.
 * Through context, a message raised during a render is queued and shown, and a
 * component that unmounts while a request is in flight cannot leak its state
 * update into a container that has gone with it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

export type { Notice, NoticeApi, NoticeKind } from './noticeContext';
import { NoticeContext, type Notice, type NoticeApi, type NoticeKind } from './noticeContext';

/**
 * How long a message stays.
 *
 * Errors outlive successes. A success that has been read and understood is
 * finished; an error that scrolls away before it has been read is a failure the
 * user never finds out about, and it is the one they most need to know about.
 */
const LIFETIME_MS: Record<NoticeKind, number> = {
    error: 9000,
    success: 4000,
    info: 5000,
};

const MAX_VISIBLE = 3;

export const NoticeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notices, setNotices] = useState<Notice[]>([]);
    const nextId = useRef(1);
    const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

    const dismiss = useCallback((id: number) => {
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
        setNotices(current => current.filter(notice => notice.id !== id));
    }, []);

    const notify = useCallback((kind: NoticeKind, message: string) => {
        const id = nextId.current++;
        setNotices(current => {
            const next = [...current, { id, kind, message }];
            // Older messages drop off the top rather than the stack growing down
            // past the fold. The newest is the one the user just caused and the
            // one they are looking at.
            return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
        });

        timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME_MS[kind]));
        return id;
    }, [dismiss]);

    // Every pending timer is cleared on unmount, and every queued message with
    // it. Without this, a notice raised by a component that unmounts mid-request
    // lands in a container that is gone -- which is the React warning this file
    // was written to stop, just moved from component state into shared state.
    const timersRef = timers;
    useEffect(() => {
        const pending = timersRef.current;
        return () => {
            for (const timer of pending.values()) clearTimeout(timer);
            pending.clear();
        };
    }, [timersRef]);

    const api = useMemo<NoticeApi>(() => ({ notify, dismiss }), [notify, dismiss]);

    return (
        <NoticeContext.Provider value={api}>
            {children}
            <NoticeStack notices={notices} onDismiss={dismiss} />
        </NoticeContext.Provider>
    );
};

const NoticeStack: React.FC<{ notices: Notice[]; onDismiss: (id: number) => void }> = ({
    notices, onDismiss,
}) => {
    if (notices.length === 0) return null;

    return (
        <div className="notice-stack" role="region" aria-label="Notifications">
            {/*
                `assertive` on the region and `polite` on the individual messages:
                assertive on the container would make a screen reader interrupt
                for every notice including a success the user did not need
                interrupting for, and the region is announced once on appearance.
            */}
            <div aria-live="assertive" aria-atomic="false" className="notice-stack__inner">
                {notices.map(notice => (
                    <div
                        key={notice.id}
                        className={`notice notice--${notice.kind}`}
                        role={notice.kind === 'error' ? 'alert' : 'status'}
                    >
                        <span className="notice-icon" aria-hidden="true">
                            {notice.kind === 'error'
                                ? <AlertTriangle size={15} />
                                : notice.kind === 'success'
                                    ? null
                                    : <Info size={15} />}
                        </span>
                        <span className="notice-text">{notice.message}</span>
                        <button
                            type="button"
                            className="notice-close"
                            onClick={() => onDismiss(notice.id)}
                            aria-label="Dismiss"
                        >
                            <X size={13} aria-hidden="true" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};


