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
    ArrowDown,
    ArrowUp,
    Bold,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    Code,
    Columns,
    Copy,
    Heading,
    Heading1,
    Heading2,
    Heading3,
    Highlighter,
    Image,
    Info,
    Italic,
    Languages,
    Link2,
    Link2Off,
    List,
    ListOrdered,
    Minus,
    Quote,
    Rows,
    Sigma,
    Star,
    Strikethrough,
    Subscript,
    Superscript,
    Table,
    Trash2,
    Type,
    Underline,
} from 'lucide-react';
import type { SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { SlashCommand, SlashIconName } from '../../utils/noteEditorExtensions';
import {
    SLASH_GROUP_ORDER,
    readFavourites,
    slashMenuOpen,
    writeFavourites,
} from '../../utils/noteEditorExtensions';
import type { FormatAction } from '../../utils/noteBlockMenuItems';

const ICONS: Record<
    SlashIconName,
    React.ComponentType<{ size?: number | string; strokeWidth?: number }>
> = {
    Type,
    Heading1,
    Heading2,
    Heading3,
    Heading,
    ChevronRight,
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
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Highlighter,
    Subscript,
    Superscript,
    Link: Link2,
    LinkOff: Link2Off,
    Copy,
    Trash: Trash2,
    ArrowUp,
    ArrowDown,
    Rows,
    Columns,
};

/** Languages offered in the code block picker. Kept short on purpose: a full
 *  language list is mostly noise, and highlight.js covers the rest if a language
 *  is typed by hand. */
const LANGUAGES = [
    'javascript',
    'typescript',
    'python',
    'html',
    'css',
    'json',
    'sql',
    'bash',
    'rust',
    'go',
    'java',
    'csharp',
    'php',
    'ruby',
    'swift',
    'kotlin',
    'diff',
    'plaintext',
];

/* ------------------------------------------------------------------ *
 * The menu
 * ------------------------------------------------------------------ */

/** The handle TipTap's suggestion plugin calls for keystrokes. */
export interface BlockMenuRef {
    onKeyDown: (props: SuggestionKeyDownProps) => boolean;
    /**
     * The same handler for a menu that does not hold DOM focus.
     *
     * The selection-triggered menu has to leave the caret in the document or the
     * selection it is acting on disappears, so its keys arrive through
     * ProseMirror instead of through React. See `setBlockMenuKeyHandler`.
     */
    onRawKeyDown?: (event: KeyboardEvent) => boolean;
}

interface BlockMenuProps {
    /** Rows for the current panel: actions, and table controls when in a table. */
    items: SlashCommand[];
    /**
     * The block types offered under "Turn into".
     *
     * Separate from `items` rather than filtered out of it, because the two sets
     * are drawn differently: conversions live in their own panel, and searching
     * is the one mode where they are flattened back together.
     */
    conversions?: SlashCommand[];
    command: (item: SlashCommand) => void;
    /**
     * How the menu was opened.
     *
     * `slash` is "/" at the caret: the editor keeps focus, keystrokes arrive
     * through the imperative handle, and the popup is positioned by TipTap. It is
     * a catalogue -- everything, searchable, flat.
     *
     * `block` is the handle click: the menu takes focus so that typing filters
     * and the arrow keys work without ProseMirror eating them first, and the
     * caller positions it. Focus moving off the editor is safe because the
     * caller resolved the target range before opening.
     *
     * `selection` is the same menu opened by selecting text. Identical to `block`
     * except that it has no search box and never takes focus, so it cannot be
     * driven by typing.
     */
    variant?: 'slash' | 'block' | 'selection';
    /** A line above everything else, e.g. "3 blocks selected". */
    heading?: string;
    /** Title of the block's current type, shown on the "Turn into" row. */
    currentType?: string;
    formats?: FormatAction[];
    /** Language picker, only while the caret is in a code block. */
    codeLanguage?: { value: string; onChange: (value: string) => void };
    onRequestClose?: () => void;
}

/** Which list the menu is currently drawing. */
type Panel = 'main' | 'turn-into';

/** A highlighted row: either a real command or the way into "Turn into". */
type Row = { kind: 'command'; id: string; command: SlashCommand } | { kind: 'turn-into'; id: string };

const TURN_INTO_ROW: Row = { kind: 'turn-into', id: 'turn-into' };

/** Whether a command matches a lowercased search term. */
const matches = (item: SlashCommand, query: string): boolean =>
    item.title.toLowerCase().includes(query) ||
    item.keywords.some(keyword => keyword.includes(query));

const toRow = (command: SlashCommand): Row => ({
    kind: 'command',
    id: command.id,
    command,
});

/**
 * The block menu: one popup behind all three entry points.
 *
 * Opened by "/" at the caret, by clicking the dots to the left of a block, or by
 * selecting text. All three reach the same rows for the same reasons -- the
 * commands are the same commands, and the ones that act on a block resolve their
 * target from whichever entry point opened the menu. The one difference is what
 * is on top: the inline marks, because a menu opened on selected text and one
 * opened on an empty block should not look the same.
 */
const BlockMenu = forwardRef<BlockMenuRef, BlockMenuProps>(
    (
        {
            items,
            conversions = [],
            command,
            variant = 'slash',
            heading,
            currentType = '',
            formats = [],
            codeLanguage,
            onRequestClose,
        },
        ref,
    ) => {
        const [selected, setSelected] = useState(0);
        const [query, setQuery] = useState('');
        const [panel, setPanel] = useState<Panel>('main');
        const [favourites, setFavourites] = useState<string[]>(readFavourites);
        const activeRef = useRef<HTMLButtonElement>(null);
        const filterRef = useRef<HTMLInputElement>(null);

        // Only the handle menu has a search box, so only it can have a query.
        const searching = variant !== 'slash' && query.trim() !== '';

        // "/" shows the whole catalogue. The handle menu shows "Turn into" plus
        // the actions, and the "Turn into" panel shows the conversions on their
        // own. Searching flattens all of it back into one list, because the point
        // of typing "todo" is to find the to-do, not to find which panel holds it.
        const panelCommands = useMemo(() => {
            if (variant === 'slash' || searching) return [...conversions, ...items];
            if (panel === 'turn-into') return conversions;
            return items;
        }, [variant, searching, panel, conversions, items]);

        const visible = useMemo(() => {
            if (!searching) return panelCommands;
            const q = query.toLowerCase().trim();
            return panelCommands.filter(item => matches(item, q));
        }, [panelCommands, searching, query]);

        const toggleFavourite = useCallback(
            (event: React.MouseEvent, id: string) => {
                // The star sits inside the row, so the row's own select must not
                // fire.
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

        // Flattened for the keyboard: what the arrows walk is exactly what is
        // drawn, in exactly this order. Group headers are skipped because they
        // are not rows.
        const { rows, favouritesFirst, starredIds } = useMemo(() => {
            const byId = new Map(visible.map(item => [item.id, item]));
            const starred =
                favourites.length === 0
                    ? []
                    : favourites
                          .map(id => byId.get(id))
                          .filter((item): item is SlashCommand => !!item);
            const starredIds = new Set(starred.map(item => item.id));

            // Starred commands are promoted into the Favourites group rather than
            // repeated in their own group below, and the rows are built in the
            // order the menu actually draws them: favourites, then each group in
            // order.
            //
            // This ordering is the fix, not a nicety. The rows were previously
            // indexed by their position in `items` while being *drawn*
            // favourites-first, so a starred command was highlighted at the
            // position it would have had without the star, and Enter ran whichever
            // command sat at the highlighted index -- a different row from the one
            // under the cursor.
            const groupIndex = new Map(SLASH_GROUP_ORDER.map((g, i) => [g, i]));
            const rest = visible
                .filter(item => !starredIds.has(item.id))
                .sort((a, b) => (groupIndex.get(a.group) ?? 99) - (groupIndex.get(b.group) ?? 99));

            // "Turn into" is the one row that is not a command, and it is drawn
            // first: it is the most-used entry in the menu and the reason the
            // twenty-odd block types behind it are not all on screen at once.
            const turnInto =
                variant !== 'slash' && !searching && panel === 'main' && conversions.length > 0
                    ? [TURN_INTO_ROW]
                    : [];

            return {
                rows: [...turnInto, ...starred.map(toRow), ...rest.map(toRow)],
                favouritesFirst: starred,
                starredIds,
            };
        }, [visible, favourites, variant, searching, panel, conversions.length]);

        const selectRow = (index: number) => {
            const row = rows[index];
            if (!row) return;
            if (row.kind === 'turn-into') {
                setPanel('turn-into');
                setSelected(0);
                return;
            }
            command(row.command);
        };

        const leavePanel = (): boolean => {
            if (variant === 'slash' || searching || panel === 'main') return false;
            setPanel('main');
            setSelected(0);
            return true;
        };

        const handleKeyDown = (event: KeyboardEvent): boolean => {
            // Left and right mean "leave the submenu" to the menu, but they are
            // also how a text caret moves inside the search box. Deciding between
            // the two by asking where the keystroke came from is the only way to
            // avoid breaking both.
            const inSearchBox =
                variant === 'block' && event.target === filterRef.current;

            if (event.key === 'ArrowLeft' && !inSearchBox && leavePanel()) {
                event.preventDefault();
                return true;
            }
            if (
                event.key === 'ArrowRight' &&
                !inSearchBox &&
                rows[selected]?.kind === 'turn-into'
            ) {
                event.preventDefault();
                setPanel('turn-into');
                setSelected(0);
                return true;
            }
            if (rows.length === 0) {
                if (event.key === 'Escape' && onRequestClose) {
                    event.preventDefault();
                    onRequestClose();
                    return true;
                }
                return false;
            }
            if (event.key === 'ArrowUp') {
                setSelected(current => (current + rows.length - 1) % rows.length);
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelected(current => (current + 1) % rows.length);
                return true;
            }
            if (event.key === 'Enter') {
                selectRow(selected);
                return true;
            }
            if (event.key === 'Escape') {
                // Escape backs out of a submenu before it closes the menu, which
                // is what lets a mistyped command be undone one step at a time.
                if (leavePanel()) return true;
                if (onRequestClose) {
                    onRequestClose();
                    return true;
                }
            }
            return false;
        };

        useImperativeHandle(ref, () => ({
            onKeyDown: ({ event }) => handleKeyDown(event as unknown as KeyboardEvent),
            onRawKeyDown: event => handleKeyDown(event),
        }));

        // Reset the highlight whenever the filtered list changes shape, otherwise
        // an index from the previous query can point past the end of the new one --
        // and switching panels changes the list just as a query does.
        useEffect(() => {
            setSelected(0);
        }, [visible, panel]);

        // Keep the highlighted row on screen. Arrow keys can move the selection
        // past the fold, and without this the list looks stuck while the keyboard
        // is clearly working.
        useEffect(() => {
            activeRef.current?.scrollIntoView({ block: 'nearest' });
        }, [selected]);

        // The block menu is opened by a button, which takes focus with it. Take
        // it back explicitly so typing filters the menu rather than landing in
        // the document behind it. The selection menu must not do this -- taking
        // focus is exactly what it is avoiding.
        useEffect(() => {
            if (variant === 'block') filterRef.current?.focus();
        }, [variant]);

        // Announce that the "/" menu is on screen, for as long as it is. The
        // editor watches this so that selecting text while "/" is open does not
        // open a second menu on top of it. Tying it to this component's real
        // lifetime rather than to the suggestion plugin's callbacks is what keeps
        // it from being left on when the editor is torn down mid-menu.
        useEffect(() => {
            if (variant !== 'slash') return;
            slashMenuOpen.current = true;
            return () => {
                slashMenuOpen.current = false;
            };
        }, [variant]);

        // Index of each row in the keyboard's flat order, so highlight and render
        // cannot drift apart.
        const flatIndex = new Map<string, number>();
        rows.forEach((row, index) => flatIndex.set(row.id, index));

        const renderRow = (row: Row) => {
            const index = flatIndex.get(row.id) ?? 0;
            const isSelected = index === selected;

            if (row.kind === 'turn-into') {
                return (
                    <button
                        type="button"
                        key={row.id}
                        ref={isSelected ? activeRef : undefined}
                        role="option"
                        aria-selected={isSelected}
                        className={`slash-menu-item slash-menu-item--submenu${
                            isSelected ? ' slash-menu-item--active' : ''
                        }`}
                        onMouseDown={event => {
                            event.preventDefault();
                            selectRow(index);
                        }}
                        onMouseEnter={() => setSelected(index)}
                    >
                        <span className="slash-menu-icon">
                            <Type size={15} strokeWidth={1.8} />
                        </span>
                        <span className="slash-menu-text">
                            <span className="slash-menu-title">Turn into</span>
                            <span className="slash-menu-hint">
                                {currentType ? `Currently ${currentType}` : "Change this block's type"}
                            </span>
                        </span>
                        <ChevronRight size={14} strokeWidth={1.8} />
                    </button>
                );
            }

            const item = row.command;
            const Icon = ICONS[item.icon] ?? Type;
            const isStarred = favourites.includes(item.id);
            const isDanger = item.id === 'delete' || item.id.startsWith('delete-');
            return (
                <button
                    type="button"
                    key={item.id}
                    ref={isSelected ? activeRef : undefined}
                    role="option"
                    aria-selected={isSelected}
                    className={`slash-menu-item${isSelected ? ' slash-menu-item--active' : ''}${
                        isDanger ? ' slash-menu-item--danger' : ''
                    }`}
                    // mousedown rather than click: the editor must not lose its
                    // selection before the command runs.
                    onMouseDown={event => {
                        event.preventDefault();
                        selectRow(index);
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

        const inTurnInto = variant !== 'slash' && !searching && panel === 'turn-into';
        const ordered = rows.filter(row => row.kind === 'command');
        // Drawn above the groups rather than among them: it is not a block type, it
        // is the way to the block types, so it does not belong under any of the
        // group headings. It is still in `rows`, because the arrows walk what is on
        // screen and this is on screen.
        const turnIntoRow = rows.find(row => row.kind === 'turn-into');

        return (
            <div
                className={`slash-menu slash-menu--${variant}`}
                role="dialog"
                aria-label="Block menu"
                onKeyDown={event => {
                    if (handleKeyDown(event.nativeEvent)) {
                        // Not calling preventDefault unconditionally: the
                        // suggestion plugin relies on the keystroke still
                        // reaching the editor after the menu declines it.
                        if (variant === 'block') event.preventDefault();
                    }
                }}
            >
                {heading && <div className="slash-menu-heading">{heading}</div>}

                {formats.length > 0 && (
                    <div className="slash-menu-formats" role="toolbar" aria-label="Text formatting">
                        {formats.map(format => {
                            const Icon = ICONS[format.icon] ?? Type;
                            return (
                                <button
                                    type="button"
                                    key={format.id}
                                    className={`slash-menu-format${format.active ? ' slash-menu-format--on' : ''}`}
                                    title={format.label}
                                    aria-label={format.label}
                                    aria-pressed={format.active ?? false}
                                    onMouseDown={event => {
                                        event.preventDefault();
                                        format.run();
                                    }}
                                >
                                    <Icon size={14} strokeWidth={1.8} />
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Only the handle menu filters, because only the handle menu can
                    afford to hold focus: "/" leaves the caret in the document,
                    where a printed character is a character, and so does the
                    selection menu, which has to keep the text it acts on
                    selected. */}
                {variant === 'block' && (
                    <div className="slash-menu-search">
                        <input
                            ref={filterRef}
                            className="slash-menu-input"
                            value={query}
                            placeholder="Search blocks"
                            aria-label="Search blocks"
                            spellCheck={false}
                            autoComplete="off"
                            onChange={event => setQuery(event.target.value)}
                        />
                    </div>
                )}

                {inTurnInto && (
                    <button
                        type="button"
                        className="slash-menu-back"
                        onMouseDown={event => {
                            event.preventDefault();
                            leavePanel();
                        }}
                    >
                        <ChevronLeft size={14} strokeWidth={1.8} />
                        Turn into
                    </button>
                )}

                {rows.length === 0 ? (
                    <span className="slash-menu-empty">No matching blocks</span>
                ) : (
                    <>
                        {turnIntoRow && renderRow(turnIntoRow)}

                        {favouritesFirst.length > 0 && (
                            <>
                                <div className="slash-menu-group">Favourites</div>
                                {favouritesFirst.map(item => renderRow(toRow(item)))}
                            </>
                        )}

                        {SLASH_GROUP_ORDER.map(group => {
                            // Starred commands live in the Favourites group
                            // only -- see the memo above.
                            const groupItems = ordered.filter(
                                row =>
                                    row.kind === 'command' &&
                                    row.command.group === group &&
                                    !starredIds.has(row.command.id),
                            );
                            if (groupItems.length === 0) return null;
                            return (
                                <React.Fragment key={group}>
                                    <div className="slash-menu-group">{group}</div>
                                    {groupItems.map(renderRow)}
                                </React.Fragment>
                            );
                        })}
                    </>
                )}

                {codeLanguage && (
                    <div className="slash-menu-footer">
                        <Languages size={12} />
                        <select
                            className="note-code-language"
                            value={codeLanguage.value}
                            aria-label="Code language"
                            onChange={event => codeLanguage.onChange(event.target.value)}
                        >
                            {LANGUAGES.map(language => (
                                <option key={language} value={language}>
                                    {language}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>
        );
    },
);

BlockMenu.displayName = 'BlockMenu';

export default BlockMenu;
