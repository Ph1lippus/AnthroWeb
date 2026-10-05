import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * A floating panel anchored to a control, drawn outside the page it belongs to.
 *
 * Exists because the notes page could not host one, and the reason it now can is
 * this file rather than a cleverer CSS. Every one of those blockers was a
 * *containment* problem, and containment only applies to descendants:
 *
 *   - `.notes-pane` is `overflow: hidden` and `.notes-workspace` is
 *     `contain: layout paint`, so anything positioned inside them is clipped to
 *     a box that is, on a phone, most of the screen.
 *   - the workspace sets `backdrop-filter`, which makes it a containing block for
 *     `position: fixed` descendants -- so `position: fixed` did not escape it
 *     either, it just re-anchored to the same clipped box.
 *   - the workspace holds a dozen icon buttons in a row that does not wrap, so a
 *     panel nested in that row had nowhere to go; it overflowed and was clipped.
 *
 * `createPortal` into `document.body` removes all four at once, because the panel
 * is no longer a descendant of anything on the page. That is the same move
 * `SidebarNav` makes for its settings menu, and `verify-sidebar-menu.mjs` asserts
 * it there for the same reason it is asserted here.
 *
 * The second problem this solves is not about CSS at all. Closing on any click
 * outside means the handler has to recognise the trigger AND this portalled panel
 * as "inside", or a pointerdown on a swatch closes the panel before the click on
 * that swatch lands and nothing is ever selectable. That check is the reason the
 * dismissal lives here rather than in each caller.
 */

/** Gap between the anchor and the panel, and the space kept off the window edges. */
const GAP = 8;
const MARGIN = 8;

/** Corners are where a panel would otherwise hang off screen, so they flip. */
const FITS = {
    below: (rect: DOMRect, height: number) => rect.bottom + GAP + height + MARGIN <= window.innerHeight,
    above: (rect: DOMRect, height: number) => rect.top - GAP - height - MARGIN >= 0,
    rightOf: (rect: DOMRect, width: number) => rect.right + GAP + width + MARGIN <= window.innerWidth,
    leftOf: (rect: DOMRect, width: number) => rect.left - GAP - width - MARGIN >= 0,
};

interface Placement {
    side: 'top' | 'bottom' | 'left' | 'right';
    top: number;
    left: number;
}

/**
 * Where the panel goes, given the anchor's rect and the panel's own measured size.
 *
 * Flipped to the opposite edge when the requested one does not fit and the other
 * does, then clamped inside the window on both axes -- so a control near a corner
 * cannot open a panel mostly off screen.
 */
const nextPos = (
    rect: DOMRect,
    side: 'top' | 'bottom' | 'right' | 'left',
    width: number,
    height: number,
): Placement => {
    let resolved = side;
    if (side === 'bottom' && !FITS.below(rect, height) && FITS.above(rect, height)) {
        resolved = 'top';
    } else if (side === 'top' && !FITS.above(rect, height) && FITS.below(rect, height)) {
        resolved = 'bottom';
    } else if (side === 'right' && !FITS.rightOf(rect, width) && FITS.leftOf(rect, width)) {
        resolved = 'left';
    } else if (side === 'left' && !FITS.leftOf(rect, width) && FITS.rightOf(rect, width)) {
        resolved = 'right';
    }

    let top: number;
    let left: number;
    if (resolved === 'bottom') {
        top = rect.bottom + GAP;
        left = rect.left;
    } else if (resolved === 'top') {
        top = rect.top - GAP - height;
        left = rect.left;
    } else if (resolved === 'right') {
        top = rect.top;
        left = rect.right + GAP;
    } else {
        top = rect.top;
        left = rect.left - GAP - width;
    }

    return {
        side: resolved,
        top: Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN)),
        left: Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN)),
    };
};

interface PopoverProps {
    /** The control the panel belongs to. Must be rendered and not yet unmounted. */
    anchor: HTMLElement | null;
    /** Called when the panel should close, for any reason. */
    onClose: () => void;
    /** Contents. */
    children: React.ReactNode;
    /** Accessible name for the panel. */
    label: string;
    className?: string;
    /** Which edge of the anchor to open from. Defaults to the one below it. */
    side?: 'top' | 'bottom' | 'right' | 'left';
}

const Popover: React.FC<PopoverProps> = ({ anchor, onClose, children, label, className = '', side = 'bottom' }) => {
    const panelRef = useRef<HTMLDivElement>(null);

    // Dismissal lives here rather than in each caller because the check is the
    // subtle part: the panel is portalled, so `contains` on the trigger does not
    // cover it, and a handler that forgot the panel reference would unmount it on
    // pointerdown -- before the click on whatever was inside could land.
    const handlePointerDown = useCallback((event: MouseEvent) => {
        const target = event.target as Node;
        if (panelRef.current?.contains(target)) return;
        if (anchor?.contains(target)) return;
        onClose();
    }, [anchor, onClose]);

    useEffect(() => {
        if (!anchor) return;
        const onDown = (event: MouseEvent) => handlePointerDown(event);
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // Escape pressed inside a text field in the panel belongs to that
            // field. The icon search uses it to clear the query, and clearing it
            // *and* dismissing the panel on one keystroke loses the search the
            // user was part-way through. Scoped to inputs inside the panel, so
            // Escape anywhere else still closes.
            const target = event.target;
            if (target instanceof HTMLInputElement && panelRef.current?.contains(target)) return;
            // Stopped, so the same Escape does not also reach the editor's own
            // handler and close something behind this panel as well.
            event.stopPropagation();
            onClose();
        };
        // Capture phase, because the rail scrolls and the panel is portalled out of
        // it, and a control that stops propagation -- a drag handle, a chart -- would
        // otherwise be able to swallow the dismissal.
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [anchor, handlePointerDown, onClose]);

    /**
     * Measure and place. The single place either caller goes through.
     *
     * Returns false when there is nothing to place against, which is how a panel
     * whose anchor has been removed declines to draw rather than sitting at the
     * top left of the window.
     */
    const place = useCallback(() => {
        const panel = panelRef.current;
        if (!anchor || !panel) return false;
        const rect = anchor.getBoundingClientRect();
        if (!rect.width && !rect.height) return false;
        const placed = nextPos(rect, side, panel.offsetWidth, panel.offsetHeight);
        panel.style.top = `${placed.top}px`;
        panel.style.left = `${placed.left}px`;
        panel.dataset.side = placed.side;
        return true;
    }, [anchor, side]);

    // Placed by writing to the node rather than by putting the coordinates in
    // state, which is worth a paragraph because the obvious implementation is
    // wrong twice over.
    //
    // A layout effect runs before the browser paints, so the panel is never seen
    // at an unplaced position -- no size estimate to keep in step with the
    // stylesheet, and no flash of a menu in the corner on the way to its anchor.
    //
    // Holding the coordinates in state instead would mean an effect writing a
    // fresh object to correct a fresh object, which never compares equal and
    // re-triggers for ever -- the loop `SidebarNav`'s `nextPosIfMoved` exists to
    // paper over. There is no loop to guard against when the position is not
    // state at all.
    // Wrapped rather than passed as `place` directly, because `place` reports
    // whether it managed to position anything and an effect callback that returns
    // a boolean is read as a cleanup function.
    useLayoutEffect(() => {
        place();
    });

    // Re-placed rather than closed on resize: the anchor is still there and still
    // valid, it has simply moved. Every commit re-places, so this only covers the
    // case where nothing re-renders -- a desktop browser window being dragged.
    useEffect(() => {
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [place]);

    if (!anchor) return null;

    return createPortal(
        <div
            ref={panelRef}
            className={`popover ${className}`.trim()}
            role="dialog"
            aria-label={label}
        >
            {children}
        </div>,
        document.body,
    );
};

export default Popover;
