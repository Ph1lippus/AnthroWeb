import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The one tooltip the whole app uses.
 *
 * Every control on the site asks for a tooltip by carrying `data-tip` instead of
 * `title`, and this renders all of them. One delegated listener mounted once at
 * the top of the authenticated tree, rather than a `<Tooltip>` wrapper around each
 * control, for three reasons:
 *
 *  - Converting a call site is `title="X"` -> `data-tip="X"`. A wrapper component
 *    would have to be threaded around every button, including the ones rendered by
 *    code that has never heard of it -- Recharts, the TipTap drag handle, the
 *    elements ProseMirror builds itself.
 *  - `title` has to be deleted rather than left alongside, or the browser draws
 *    its own on top of this one a second later. That is the whole complaint: two
 *    tooltips, one of them in the OS style.
 *  - Nothing is rendered unless something is being hovered, so the cost of the
 *    pattern is one `div` that only exists while a tip is up.
 *
 * `title` is still the accessible name where an element has no other, which is why
 * the sweep only swaps the attribute on controls that already carry `aria-label`
 * or visible text. `scripts/verify-notes-appearance.mjs` enforces that.
 */

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * What state holds: which control, and what it says. Deliberately not the
 * position -- see the layout effect below for why.
 */
interface TipState {
    label: string;
    /** The control it belongs to, so it can be re-measured rather than looked up. */
    anchor: HTMLElement;
}

/**
 * Long enough that crossing a control does not flash its neighbour's tip, short
 * enough to feel instant once the pointer has settled. The same value SidebarNav
 * uses for its own tooltip, so moving between the two feels like one behaviour.
 */
const SHOW_DELAY = 120;

/** Gap between the anchor and the tip, and the space kept off the window edges. */
const GAP = 8;
const MARGIN = 8;

/** `data-tip-side` is for the handful of controls a default placement suits badly. */
const readSide = (anchor: HTMLElement): Side | null => {
    const side = anchor.dataset.tipSide;
    return side === 'top' || side === 'bottom' || side === 'left' || side === 'right' ? side : null;
};

/**
 * The element a `data-tip` sits on, if the event landed on one.
 *
 * `closest` rather than the target itself: the pointer is usually over an `<svg>`
 * or a `<span>` inside the control, and an icon carrying no tip of its own has to
 * resolve to the button that does.
 */
const anchorFrom = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const anchor = target.closest<HTMLElement>('[data-tip]');
    return anchor && anchor.dataset.tip ? anchor : null;
};

/**
 * Where the tip goes, given the anchor's rect and the tip's own measured size.
 *
 * Aligned to the requested edge, flipped to its opposite when that does not fit,
 * and clamped inside the window on both axes.
 *
 * Above and below, the tip is aligned to the anchor's near edge rather than
 * centred: a tip centred on a control near the left edge hangs off screen, and
 * clamping it back to the margin leaves it visibly detached from the control it is
 * describing.
 *
 * Left and right are a different shape and are centred instead. That is the edge
 * the notes rail uses, and its rows are 30px tall against a tip two lines high --
 * aligning the two top edges leaves the tip hanging below the row like a caption,
 * and on a two-line tip that reads as belonging to whatever is underneath it.
 */
const nextPos = (rect: DOMRect, side: Side, width: number, height: number) => {
    let resolved = side;
    if (side === 'bottom' && rect.bottom + GAP + height + MARGIN > window.innerHeight
        && rect.top - GAP - height - MARGIN >= 0) {
        resolved = 'top';
    } else if (side === 'top' && rect.top - GAP - height - MARGIN < 0
        && rect.bottom + GAP + height + MARGIN <= window.innerHeight) {
        resolved = 'bottom';
    } else if (side === 'right' && rect.right + GAP + width + MARGIN > window.innerWidth
        && rect.left - GAP - width - MARGIN >= 0) {
        resolved = 'left';
    } else if (side === 'left' && rect.left - GAP - width - MARGIN < 0
        && rect.right + GAP + width + MARGIN <= window.innerWidth) {
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
        top = rect.top + rect.height / 2 - height / 2;
        left = rect.right + GAP;
    } else {
        top = rect.top + rect.height / 2 - height / 2;
        left = rect.left - GAP - width;
    }

    return {
        side: resolved,
        top: Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN)),
        left: Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN)),
    };
};

const TipLayer: React.FC = () => {
    const [tip, setTip] = useState<TipState | null>(null);
    const tipRef = useRef<HTMLDivElement>(null);
    const showTimer = useRef<number | null>(null);

    const clearShowTimer = () => {
        if (showTimer.current !== null) {
            window.clearTimeout(showTimer.current);
            showTimer.current = null;
        }
    };

    const open = useCallback((anchor: HTMLElement, immediate: boolean) => {
        clearShowTimer();
        const show = () => {
            showTimer.current = null;
            setTip(current => {
                // Bail out when it is already the same tip. Re-entering the same
                // state while a tip is up would otherwise restart the measurement
                // below on every pointer move across the control.
                if (current && current.anchor === anchor
                    && current.label === anchor.dataset.tip) {
                    return current;
                }
                return { label: anchor.dataset.tip ?? '', anchor };
            });
        };
        // Keyboard focus skips the delay. Arriving by Tab is a deliberate act, and a
        // tip trailing a fifth of a second behind the focus ring is worse than no
        // tip at all -- which is why this branches on the event rather than there
        // being two listeners.
        if (immediate) {
            show();
            return;
        }
        showTimer.current = window.setTimeout(show, SHOW_DELAY);
    }, []);

    const close = useCallback(() => {
        clearShowTimer();
        setTip(null);
    }, []);

    // A pending timer must never fire after the pointer has already left.
    useEffect(() => clearShowTimer, []);

    // Delegated, and in the capture phase so a control that stops propagation -- a
    // drag handle, a chart, an editor menu -- cannot hide the tip belonging to its
    // own element by swallowing the event before it reaches the document.
    useEffect(() => {
        const onOver = (event: MouseEvent) => {
            const anchor = anchorFrom(event.target);
            if (anchor) open(anchor, false);
        };
        // Only a pointer genuinely leaving the control closes the tip. Moving from
        // the button onto the icon inside it fires `out` on the icon, and closing
        // there made the tip flicker on every button that carries a glyph.
        const onOut = (event: MouseEvent) => {
            if (anchorFrom(event.relatedTarget) === anchorFrom(event.target)) return;
            close();
        };
        const onFocusIn = (event: FocusEvent) => {
            const anchor = anchorFrom(event.target);
            if (anchor) open(anchor, true);
        };
        const onFocusOut = (event: FocusEvent) => {
            if (anchorFrom(event.relatedTarget) === anchorFrom(event.target)) return;
            close();
        };
        // A tip anchored to something just removed from the DOM -- a row deleted
        // from the rail, a card unmounted by a filter -- would otherwise sit over
        // the gap it pointed at. A tooltip follows nothing: it is pinned to one
        // control, so any scroll means the answer it gave is stale.
        const onViewportChange = () => close();

        document.addEventListener('mouseover', onOver, true);
        document.addEventListener('mouseout', onOut, true);
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('focusout', onFocusOut, true);
        window.addEventListener('scroll', onViewportChange, true);
        window.addEventListener('resize', onViewportChange);
        return () => {
            document.removeEventListener('mouseover', onOver, true);
            document.removeEventListener('mouseout', onOut, true);
            document.removeEventListener('focusin', onFocusIn, true);
            document.removeEventListener('focusout', onFocusOut, true);
            window.removeEventListener('scroll', onViewportChange, true);
            window.removeEventListener('resize', onViewportChange);
        };
    }, [open, close]);

    /**
     * Position written straight onto the node.
     *
     * Not state, and that is the whole point. A tip's size is only knowable after
     * it has rendered, so the obvious implementation is: render it, measure it,
     * put the coordinates in state, render again. With a dependency array on the
     * label that settles; without one it does not, because a fresh object never
     * compares equal to the previous one and the effect re-triggers for ever until
     * React gives up on the nesting depth and no tip is ever shown again.
     *
     * A layout effect runs before the paint, so measuring here and writing
     * `style` means the tip is never seen at an unplaced position -- no estimated
     * size to keep in step with the stylesheet, and no second pass. The side goes
     * on `data-side` rather than a class for the same reason: it is derived, and
     * derived values do not belong in the render.
     */
    useLayoutEffect(() => {
        const node = tipRef.current;
        if (!tip || !node) return;
        const rect = tip.anchor.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        const placed = nextPos(
            rect,
            readSide(tip.anchor) ?? 'bottom',
            node.offsetWidth,
            node.offsetHeight,
        );
        node.style.top = `${placed.top}px`;
        node.style.left = `${placed.left}px`;
        node.dataset.side = placed.side;
    }, [tip]);

    if (!tip) return null;

    return createPortal(
        <div
            ref={tipRef}
            className="tooltip"
            role="tooltip"
        >
            {tip.label}
            <span className="tooltip-arrow" aria-hidden="true" />
        </div>,
        document.body,
    );
};

export default TipLayer;
