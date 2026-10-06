import { useCallback, useState } from 'react';
import type React from 'react';
import type { ContextMenuItem, ContextMenuState } from './ContextMenu';

/**
 * Holds the one open right-click menu, and the ways to open it.
 *
 * Its own file because `ContextMenu` is a component and this is not: a module that
 * exports both breaks React Fast Refresh, which reloads a file on save and would
 * remount the menu itself every time the hook's file changed.
 *
 * Held above the rows rather than inside one, because there is only ever one menu:
 * a second right click replaces it instead of leaving two open, and the row that
 * opened it can be gone by the time it closes without that being a leak.
 *
 * `openFromEvent` for a right click. `openAt` for a control with no pointer
 * position of its own worth using -- a small button on a touch screen, where the
 * menu should appear against the button rather than wherever a synthetic right
 * click would have landed.
 */
export const useContextMenu = () => {
    const [state, setState] = useState<ContextMenuState | null>(null);

    const openAt = useCallback((x: number, y: number, label: string, items: ContextMenuItem[]) => {
        setState({ x, y, label, items });
    }, []);

    const openFromEvent = useCallback(
        (event: MouseEvent | React.MouseEvent, label: string, items: ContextMenuItem[]) => {
            // The browser's own menu has to go, or the two appear together.
            event.preventDefault();
            openAt(event.clientX, event.clientY, label, items);
        },
        [openAt],
    );

    const close = useCallback(() => setState(null), []);

    return { state, openAt, openFromEvent, close };
};