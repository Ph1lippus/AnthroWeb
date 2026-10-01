import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
    CheckSquare,
    Code,
    Heading1,
    Heading2,
    Heading3,
    Image,
    List,
    ListOrdered,
    Minus,
    Quote,
    Type,
} from 'lucide-react';
import type { SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { SlashCommand } from '../../utils/noteEditorExtensions';

export type SlashIconName =
    | 'Type'
    | 'Heading1'
    | 'Heading2'
    | 'Heading3'
    | 'List'
    | 'ListOrdered'
    | 'CheckSquare'
    | 'Quote'
    | 'Code'
    | 'Minus'
    | 'Image';

const ICONS: Record<SlashIconName, React.ComponentType<{ size?: number | string; strokeWidth?: number }>> = {
    Type,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    CheckSquare,
    Quote,
    Code,
    Minus,
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

const MAX_VISIBLE = 8;

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

    // Reset the highlight whenever the filtered list changes shape, otherwise an
    // index from the previous query can point past the end of the new list.
    useEffect(() => {
        setSelected(0);
    }, [items]);

    const selectItem = (index: number) => {
        const item = items[index];
        if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (items.length === 0) return false;
            if (event.key === 'ArrowUp') {
                setSelected(current => (current + items.length - 1) % items.length);
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelected(current => (current + 1) % items.length);
                return true;
            }
            if (event.key === 'Enter') {
                selectItem(selected);
                return true;
            }
            return false;
        },
    }));

    if (items.length === 0) {
        return (
            <div className="slash-menu slash-menu--empty">
                <span className="slash-menu-empty">No matching blocks</span>
            </div>
        );
    }

    const visible = items.slice(0, MAX_VISIBLE);

    return (
        <div className="slash-menu" role="listbox">
            {visible.map((item, index) => {
                const Icon = ICONS[item.icon] ?? Type;
                const isSelected = index === selected;
                return (
                    <button
                        type="button"
                        key={item.title}
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
                    </button>
                );
            })}
            {items.length > MAX_VISIBLE && (
                <div className="slash-menu-more">+{items.length - MAX_VISIBLE} more</div>
            )}
        </div>
    );
});

SlashMenu.displayName = 'SlashMenu';

export default SlashMenu;
