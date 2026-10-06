import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

/**
 * The menu a right click opens. Use `useContextMenu` to hold one.
 *
 * One component for the whole app, because "what should this row do?" has the same
 * answer everywhere -- a short list of verbs on the thing that was clicked -- and
 * every row that answers it privately ends up with its own idea of where the menu
 * goes and when it closes. A row opts in with three lines:
 *
 *     const menu = useContextMenu();
 *     ...
 *     onContextMenu={event => menu.openFromEvent(event, label, items)}
 *     ...
 *     {menu.state && <ContextMenu {...menu.state} onClose={menu.close} />}
 *
 * It looks like the rest of the app because it is built from the same two pieces
 * every other floating panel here uses: the `.popover` surface and the
 * `.sidebar-menu-item` row. No new surface, no new hover, no new danger colour --
 * there is nothing to keep in step with.
 *
 * Portalled to `document.body` for the same reason `Popover` is: the notes
 * workspace is `contain: layout paint` with `backdrop-filter`, which makes it a
 * containing block for `position: fixed` descendants, so a menu placed inside it
 * would be re-anchored to a box that is, on a phone, most of the screen.
 */

/** Space kept off the window edges. */
const MARGIN = 8;

export interface ContextMenuItem {
    /** Stable key, and what the keyboard highlight is tracked by. */
    id: string;
    label: string;
    icon?: LucideIcon;
    /** Drawn in the destructive colour, for anything that cannot be undone. */
    danger?: boolean;
    disabled?: boolean;
    /** A hairline above this item, to separate it from the group above. */
    separatorBefore?: boolean;
    onSelect: () => void;
}

export interface ContextMenuState {
    /** Where the pointer was, in viewport coordinates. */
    x: number;
    y: number;
    /** Accessible name for the menu. */
    label: string;
    items: ContextMenuItem[];
}

/**
 * Where the menu goes from the point it was opened at.
 *
 * Flips to the other side of the pointer when it would run off an edge, then
 * clamps, so a right click in the last few pixels of the window still opens a menu
 * that is fully readable. A menu is never "not enough room" -- a short one scrolls,
 * and a long one is the caller's problem to keep short.
 */
const nextPos = (
    x: number,
    y: number,
    width: number,
    height: number,
): { top: number; left: number } => {
    const left =
        x + width + MARGIN > window.innerWidth
            ? Math.max(MARGIN, x - width)
            : Math.max(MARGIN, x);
    const top =
        y + height + MARGIN > window.innerHeight
            ? Math.max(MARGIN, y - height)
            : Math.max(MARGIN, y);
    return { top, left };
};

export interface ContextMenuProps extends ContextMenuState {
    onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, label, items, onClose }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    // The row the keyboard is on, tracked separately from focus so a mouse can
    // move the highlight without taking focus away from the panel. Mirrored into a
    // ref because the listeners below must not be torn down and rebuilt every time
    // the highlight moves.
    const [active, setActive] = useState(0);
    const activeRef = useRef(0);
    const highlight = useCallback((index: number) => {
        activeRef.current = index;
        setActive(index);
    }, []);

    // Place by writing to the node rather than holding coordinates in state, which
    // is what `Popover` does and for the same reason: an effect correcting state
    // with a fresh object never compares equal and re-runs for ever. A layout
    // effect, so the menu is never painted at an unplaced position.
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const placed = nextPos(x, y, panel.offsetWidth, panel.offsetHeight);
        panel.style.top = `${placed.top}px`;
        panel.style.left = `${placed.left}px`;
    }, [x, y, items]);

    // Focus the panel on open, so the arrow keys work without a click first. The
    // panel itself rather than a row: the first row is the destructive one more
    // often than not, and Enter on a freshly opened menu should not remove
    // something.
    useEffect(() => {
        panelRef.current?.focus();
    }, []);

    const close = useCallback(() => onClose(), [onClose]);

    const runItem = useCallback(
        (item: ContextMenuItem) => {
            if (item.disabled) return;
            close();
            item.onSelect();
        },
        [close],
    );

    const step = useCallback(
        (delta: number) => {
            const enabled = items
                .map((item, index) => (item.disabled ? -1 : index))
                .filter(index => index >= 0);
            if (enabled.length === 0) return;
            const at = enabled.indexOf(activeRef.current);
            // -1 when the highlight is on a disabled row, which sends it to the end
            // of the list in the direction of travel rather than nowhere.
            const next =
                at < 0
                    ? delta > 0
                        ? enabled[0]
                        : enabled[enabled.length - 1]
                    : enabled[(at + delta + enabled.length) % enabled.length];
            highlight(next);
            panelRef.current
                ?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
                .forEach((row, index) => {
                    if (index === next) row.focus();
                });
        },
        [items, highlight],
    );

    // Dismissal lives here rather than in each caller, because the panel is
    // portalled: `contains` on the row that opened it does not cover it, and a
    // caller that forgot that would unmount the menu on pointerdown -- before the
    // click on the item inside it could land.
    useEffect(() => {
        const onDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (panelRef.current?.contains(target)) return;
            close();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                close();
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                step(1);
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                step(-1);
                return;
            }
            // The panel holds focus rather than the rows, so Enter and Space are
            // only meaningful once something is highlighted -- which it is, from the
            // first frame.
            if ((event.key === 'Enter' || event.key === ' ') && items[activeRef.current]) {
                event.preventDefault();
                runItem(items[activeRef.current]);
            }
        };
        // Capture phase, for the same reason `Popover` uses it: a row that stops
        // propagation -- a drag handle, a chart, an editor -- must not be able to
        // swallow the dismissal and leave the menu stuck open.
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        // A second right click is a request for a different menu, not for this one
        // on top of the browser's. Closed first and opened after, in the same tick,
        // so a right click on another row replaces this one rather than stacking.
        document.addEventListener('contextmenu', close, true);
        // Fixed to the viewport, so scrolling or resizing would leave it behind.
        const onViewport = () => close();
        window.addEventListener('scroll', onViewport, true);
        window.addEventListener('resize', onViewport);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('contextmenu', close, true);
            window.removeEventListener('scroll', onViewport, true);
            window.removeEventListener('resize', onViewport);
        };
    }, [close, step, runItem, items]);

    return createPortal(
        <div ref={panelRef} className="popover context-menu" role="menu" aria-label={label} tabIndex={-1}>
            {items.map((item, index) => {
                const Icon = item.icon;
                return (
                    <React.Fragment key={item.id}>
                        {item.separatorBefore && <div className="context-menu-sep" role="separator" />}
                        <button
                            type="button"
                            role="menuitem"
                            className={`sidebar-menu-item context-menu-item${item.danger ? ' sidebar-menu-item--danger context-menu-item--danger' : ''}${index === active ? ' is-active' : ''}`}
                            // Prevented so the button does not take focus on mousedown:
                            // the panel keeps it, and the keyboard position does not
                            // jump to whatever was clicked.
                            onMouseDown={event => event.preventDefault()}
                            onMouseEnter={() => !item.disabled && highlight(index)}
                            onClick={() => runItem(item)}
                            disabled={item.disabled}
                        >
                            {/* A slot whether or not there is a glyph, so labels in a
                                menu of mixed items stay in one column. */}
                            <span className="context-menu-icon">{Icon ? <Icon size={14} /> : null}</span>
                            {item.label}
                        </button>
                    </React.Fragment>
                );
            })}
        </div>,
        document.body,
    );
};

export default ContextMenu;
