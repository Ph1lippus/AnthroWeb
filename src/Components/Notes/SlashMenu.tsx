import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    CheckSquare,
    ChevronDown,
    Code,
    Heading,
    Heading1,
    Heading2,
    Heading3,
    Image,
    Info,
    List,
    ListOrdered,
    Minus,
    Quote,
    Sigma,
    Star,
    Table,
    Type,
} from 'lucide-react';
import type { SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { SlashCommand, SlashIconName } from '../../utils/noteEditorExtensions';
import {
    SLASH_GROUP_ORDER,
    readFavourites,
    writeFavourites,
} from '../../utils/noteEditorExtensions';

const ICONS: Record<SlashIconName, React.ComponentType<{ size?: number | string; strokeWidth?: number }>> = {
    Type,
    Heading1,
    Heading2,
    Heading3,
    Heading,
    ChevronDown,
    Quote,
    Info,
    Minus,
    List,
    ListOrdered,
    CheckSquare,
    Table,
    Code,
    Sigma,
    Image,
};

/** The handle TipTap's suggestion plugin calls for keystrokes. */
export interface SlashMenuRef {
    onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface SlashMenuProps {
    items: SlashCommand[];
    command: (item: SlashCommand) => void;
}

/**
 * The "/" command palette.
 *
 * Rendered through ReactRenderer inside TipTap's suggestion plugin, which
 * attaches this component's ref to `ReactRenderer.ref` and calls
 * `onKeyDown(event)` for every keystroke while the menu is open. Returning true
 * means "handled", which stops the character reaching the document.
 */
const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);
    const [favourites, setFavourites] = useState<string[]>(readFavourites);
    const activeRef = useRef<HTMLButtonElement>(null);

    // Reset the highlight whenever the filtered list changes shape, otherwise an
    // index from the previous query can point past the end of the new list.
    useEffect(() => {
        setSelected(0);
    }, [items]);

    // Keep the highlighted row on screen. Arrow keys can move the selection past
    // the fold, and without this the list looks stuck while the keyboard is
    // clearly working.
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    const toggleFavourite = useCallback(
        (event: React.MouseEvent, id: string) => {
            // The star sits inside the row, so the row's own select must not fire.
            event.preventDefault();
            event.stopPropagation();
            setFavourites(current => {
                const next = current.includes(id)
                    ? current.filter(value => value !== id)
                    : [...current, id];
                writeFavourites(next);
                return next;
            });
        },
        [],
    );

    // Flattened for the keyboard: what the arrows walk is exactly what is drawn,
    // in exactly this order. Group headers are skipped because they are not rows.
    const { rows, favouritesFirst } = useMemo(() => {
        // Only a favourites group while the search is empty, otherwise a query
        // like "to" would show a Favourites heading with unrelated rows in it.
        if (favourites.length === 0 || items.length === 0) {
            return { rows: items, favouritesFirst: [] as SlashCommand[] };
        }
        const byId = new Map(items.map(item => [item.id, item]));
        const starred = favourites
            .map(id => byId.get(id))
            .filter((item): item is SlashCommand => !!item);
        return { rows: items, favouritesFirst: starred };
    }, [items, favourites]);

    const selectItem = (index: number) => {
        const item = rows[index];
        if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (rows.length === 0) return false;
            if (event.key === 'ArrowUp') {
                setSelected(current => (current + rows.length - 1) % rows.length);
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelected(current => (current + 1) % rows.length);
                return true;
            }
            if (event.key === 'Enter') {
                selectItem(selected);
                return true;
            }
            return false;
        },
    }));

    if (rows.length === 0) {
        return (
            <div className="slash-menu slash-menu--empty">
                <span className="slash-menu-empty">No matching blocks</span>
            </div>
        );
    }

    // Index of each row in the keyboard's flat order, so highlight and render
    // cannot drift apart.
    const flatIndex = new Map<string, number>();
    rows.forEach((item, index) => flatIndex.set(item.id, index));

    const renderRow = (item: SlashCommand) => {
        const index = flatIndex.get(item.id) ?? 0;
        const Icon = ICONS[item.icon] ?? Type;
        const isSelected = index === selected;
        const isStarred = favourites.includes(item.id);
        return (
            <button
                type="button"
                key={item.id}
                ref={isSelected ? activeRef : undefined}
                role="option"
                aria-selected={isSelected}
                className={`slash-menu-item${isSelected ? ' slash-menu-item--active' : ''}`}
                // mousedown rather than click: the editor must not lose its
                // selection before the command runs.
                onMouseDown={event => {
                    event.preventDefault();
                    selectItem(index);
                }}
                onMouseEnter={() => setSelected(index)}
            >
                <span className="slash-menu-icon">
                    <Icon size={15} strokeWidth={1.8} />
                </span>
                <span className="slash-menu-text">
                    <span className="slash-menu-title">{item.title}</span>
                    <span className="slash-menu-hint">{item.hint}</span>
                </span>
                <span
                    role="button"
                    tabIndex={-1}
                    className={`slash-menu-star${isStarred ? ' slash-menu-star--on' : ''}`}
                    title={isStarred ? 'Remove from favourites' : 'Add to favourites'}
                    onMouseDown={event => toggleFavourite(event, item.id)}
                >
                    <Star size={12} fill={isStarred ? 'currentColor' : 'none'} />
                </span>
            </button>
        );
    };

    return (
        <div className="slash-menu" role="listbox">
            {favouritesFirst.length > 0 && (
                <>
                    <div className="slash-menu-group">Favourites</div>
                    {favouritesFirst.map(renderRow)}
                </>
            )}

            {SLASH_GROUP_ORDER.map(group => {
                const groupItems = rows.filter(item => item.group === group);
                if (groupItems.length === 0) return null;
                return (
                    <React.Fragment key={group}>
                        <div className="slash-menu-group">{group}</div>
                        {groupItems.map(renderRow)}
                    </React.Fragment>
                );
            })}
        </div>
    );
});

SlashMenu.displayName = 'SlashMenu';

export default SlashMenu;
