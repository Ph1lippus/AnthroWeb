import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAcademicAlerts } from '../hooks/useAcademicAlerts';

const GAP = 8;
const MARGIN = 8;
/**
 * Grace period between the pointer leaving the icon and the panel closing.
 *
 * The two are separate elements -- the icon is in the rail, the panel is
 * portalled to the body -- so there is a gap to cross and without a delay the
 * panel would vanish on the way to it and reappear on the way back.
 */
const HIDE_DELAY = 140;

/**
 * The deadline warning, as a trigger on the navigation rail.
 *
 * It was a strip across the top of every page, which meant the thing it warns
 * about was on screen permanently and stopped being information. Here it is one
 * icon that is only noticeable when something is actually coming, and the dates
 * are one hover away.
 *
 * Every deadline is listed at once rather than one rotating through them. The
 * strip had to rotate because it was a fixed-width bar competing with a title
 * for the same row; a panel has the room to show all of them, and a warning you
 * have to wait nine seconds to read is a warning most people never read.
 *
 * One line per cluster, using the short form: "Maths in 3 days" answers the only
 * question the icon raised, and the full sentences are one click away on the page
 * the warning links to.
 */
const AcademicAlertBanner: React.FC = () => {
    const { data: alerts } = useAcademicAlerts();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const hideTimer = useRef<number | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const list = alerts ?? [];
    const urgent = list.some(alert => alert.urgent);

    const show = useCallback(() => {
        if (hideTimer.current !== null) {
            window.clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
        setOpen(true);
    }, []);

    // Leaving either one starts the countdown rather than closing outright, so
    // moving the pointer from the icon onto the panel keeps it open.
    const hide = useCallback(() => {
        if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => {
            hideTimer.current = null;
            setOpen(false);
        }, HIDE_DELAY);
    }, []);

    const close = useCallback(() => {
        if (hideTimer.current !== null) {
            window.clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
        setOpen(false);
    }, []);

    useEffect(
        () => () => {
            if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
        },
        [],
    );

    // Escape closes, and so does a pointerdown anywhere else. Capture phase,
    // because the rail scrolls and the panel is portalled out of it.
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close();
                buttonRef.current?.focus();
            }
        };
        const onDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (panelRef.current?.contains(target)) return;
            if (buttonRef.current?.contains(target)) return;
            close();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown, true);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown, true);
        };
    }, [open, close]);

    // Beside the icon, level with its top. The vertical clamp needs the panel's
    // own height, which only exists once it has rendered, so the position is
    // settled in a layout effect and corrected once rather than guessed at from
    // the number of lines. Nothing is reset on close: the panel only draws while
    // `open`, and a layout effect runs before the next paint, so a stale position
    // from last time is corrected before it is ever seen.
    useLayoutEffect(() => {
        if (!open) return;
        const anchor = buttonRef.current?.getBoundingClientRect();
        if (!anchor) return;

        const panel = panelRef.current;
        const height = panel?.offsetHeight ?? list.length * 24 + 16;
        const width = panel?.offsetWidth ?? 260;
        const top = Math.max(
            MARGIN,
            Math.min(anchor.top, window.innerHeight - height - MARGIN),
        );
        const left = Math.max(
            MARGIN,
            Math.min(anchor.right + GAP, window.innerWidth - width - MARGIN),
        );
        setPos({ top, left });
    }, [open, list.length]);


    if (list.length === 0) return null;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className={`sidebar-nav-alert${urgent ? ' sidebar-nav-alert--urgent' : ''}${
                    open ? ' sidebar-nav-alert--open' : ''
                }`}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
                onClick={() => navigate('/Academic')}
                aria-label={`${list.length} upcoming ${list.length === 1 ? 'deadline' : 'deadlines'}`}
                aria-expanded={open}
            >
                <AlertTriangle size={17} aria-hidden="true" />
                {list.length > 1 && (
                    <span className="sidebar-nav-alert-count" aria-hidden="true">
                        {list.length}
                    </span>
                )}
            </button>

            {open &&
                pos &&
                createPortal(
                    <div
                        ref={panelRef}
                        className="sidebar-alert-panel"
                        role="tooltip"
                        style={{ top: pos.top, left: pos.left }}
                        onMouseEnter={show}
                        onMouseLeave={hide}
                        onClick={() => navigate('/Academic')}
                    >
                        {list.map(alert => (
                            <div
                                key={alert.id}
                                className={`sidebar-alert-row${
                                    alert.urgent ? ' sidebar-alert-row--urgent' : ''
                                }`}
                            >
                                <span className="sidebar-alert-dot" aria-hidden="true" />
                                <span className="sidebar-alert-text">{alert.text}</span>
                            </div>
                        ))}
                        <div className="sidebar-alert-foot">Open Academic</div>
                    </div>,
                    document.body,
                )}
        </>
    );
};

export default AcademicAlertBanner;
