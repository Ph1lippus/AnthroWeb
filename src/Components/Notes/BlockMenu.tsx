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
     *
     * Defaults to a shared constant, never a fresh `[]` -- see `NO_CONVERSIONS`.
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
    /**
     * Which side of this menu the block-type panel opens on.
     *
     * `right` normally; `left` when the right would run off the screen. The caller
     * decides, because the caller is what knows where the menu ended up.
     */
    submenuSide?: 'right' | 'left';
    /**
     * False where two panels will not fit side by side, in which case the
     * block-type panel stands in for this one instead of joining it.
     */
    split?: boolean;
    /**
     * Told whenever the block-type panel opens or closes.
     *
     * It changes how tall the taller panel is, and the caller pins the popup by its
     * height, so it has to be told rather than left to guess.
     */
    onSubmenuOpenChange?: (open: boolean) => void;
    /** Ref for the block-type panel, so the caller can measure it. */
    submenuRef?: React.Ref<HTMLDivElement>;
    onRequestClose?: () => void;
}

/** Which list the menu is currently drawing. */
type Panel = 'main' | 'sub';

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
 * The default for `conversions`, as a constant rather than a literal `[]`.
 *
 * A default parameter is evaluated on every render, so `conversions = []` handed
 * back a *new* array each time. That invalidated every memo downstream of it, and
 * with it the effect that resets the highlighted row whenever the list changes
 * shape -- which therefore fired after every render, including the one caused by
 * pressing an arrow key. The highlight went down one row and straight back to the
 * top: the arrow keys looked broken.
 *
 * "/" passes no conversions at all, so this is the value it actually gets.
 */
const NO_CONVERSIONS: SlashCommand[] = [];

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
            conversions = NO_CONVERSIONS,
            command,
            variant = 'slash',
            heading,
            currentType = '',
            formats = [],
            codeLanguage,
            submenuSide = 'right',
            split = true,
            onSubmenuOpenChange,
            submenuRef,
            onRequestClose,
        },
        ref,
    ) => {
        const [selectedMain, setSelectedMain] = useState(0);
        const [selectedSub, setSelectedSub] = useState(0);
        const [query, setQuery] = useState('');
        // Whether the block-type panel is open. Not a "which panel am I drawing"
        // question: when there is room both panels are drawn at once, and this only
        // says whether the second one is there.
        const [turnIntoOpen, setTurnIntoOpen] = useState(false);
        // Which panel the arrow keys are walking. Hovering does not move it -- the
        // mouse is already saying what it wants -- but Right does, and Left comes
        // back.
        const [focus, setFocus] = useState<Panel>('main');
        const [favourites, setFavourites] = useState<string[]>(readFavourites);
        const activeRef = useRef<HTMLButtonElement>(null);
        const activeSubRef = useRef<HTMLButtonElement>(null);
        const filterRef = useRef<HTMLInputElement>(null);
        const closeTimerRef = useRef<number | null>(null);

        // Only the handle menu has a search box, so only it can have a query.
        const searching = variant !== 'slash' && query.trim() !== '';

        // A search flattens the whole catalogue into the one panel, because the
        // point of typing "todo" is to find the to-do, not to find which panel
        // holds it -- and because a search that left a second panel on screen
        // would show the same commands twice.
        const mainList = useMemo(
            () => (searching ? [...conversions, ...items] : items),
            [searching, conversions, items],
        );
        const subList = useMemo(
            () => (searching ? [] : conversions),
            [searching, conversions],
        );

        const showTurnIntoRow = variant !== 'slash' && !searching && conversions.length > 0;
        const beside = showTurnIntoRow && split;
        // Where the block types actually are: beside the menu when there is room,
        // in place of it when there is not.
        const submenuVisible = showTurnIntoRow && turnIntoOpen;
        const inSubmenu = submenuVisible && focus === 'sub';

        /**
         * Flattens one panel's list into the order it is drawn in: favourites
         * first, then each group in order.
         *
         * The order is the fix, not a nicety. Rows used to be indexed by their
         * position in the raw list while being *drawn* favourites-first, so a
         * starred command was highlighted at the position it would have had
         * without the star, and Enter ran whichever command sat at the highlighted
         * index -- a different row from the one under the cursor.
         */
        const buildRows = useCallback(
            (list: SlashCommand[]) => {
                const byId = new Map(list.map(item => [item.id, item]));
                const starred =
                    favourites.length === 0
                        ? []
                        : favourites
                              .map(id => byId.get(id))
                              .filter((item): item is SlashCommand => !!item);
                const starredIds = new Set(starred.map(item => item.id));
                const groupIndex = new Map(SLASH_GROUP_ORDER.map((g, i) => [g, i]));
                const rest = list
                    .filter(item => !starredIds.has(item.id))
                    .sort(
                        (a, b) =>
                            (groupIndex.get(a.group) ?? 99) - (groupIndex.get(b.group) ?? 99),
                    );
                return { rows: [...starred, ...rest].map(toRow) };
            },
            [favourites],
        );

        const filtered = useMemo(() => {
            if (!searching) return { mainList, subList };
            const q = query.toLowerCase().trim();
            return { mainList: mainList.filter(item => matches(item, q)), subList };
        }, [searching, query, mainList, subList]);

        const main = useMemo(() => buildRows(filtered.mainList), [buildRows, filtered]);
        const sub = useMemo(() => buildRows(filtered.subList), [buildRows, filtered]);

        const mainRows = useMemo(() => {
            // "Turn into" is the one row that is not a command, and it is drawn
            // first: it is the most-used entry in the menu and the reason the
            // twenty-odd block types behind it are not all on screen at once.
            if (!showTurnIntoRow) return main.rows;
            return [TURN_INTO_ROW, ...main.rows];
        }, [showTurnIntoRow, main.rows]);

        /**
         * What the arrow keys walk: the panel that is highlighted, in exactly the
         * order it is drawn. Group headers are skipped because they are not rows.
         */
        const rows = inSubmenu ? sub.rows : mainRows;

        const selected = inSubmenu ? selectedSub : selectedMain;
        const setSelected = inSubmenu ? setSelectedSub : setSelectedMain;

        /**
         * What the highlighted row is pointed at, as a string.
         *
         * The effect below has to know when the list has genuinely changed shape,
         * and an array cannot say that: a new array of the same commands is a
         * different object, and the effect would fire and put the highlight back
         * at the top -- including after the render caused by pressing an arrow key,
         * which is exactly the bug this replaces. Joined into a string it compares
         * by value, so it only fires when the set of rows really is different.
         */
        const rowsKey = `${showTurnIntoRow ? 't' : '-'}${rows.map(row => row.id).join()}`;

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

        const closeSubmenu = useCallback(() => {
            setTurnIntoOpen(false);
            setFocus('main');
            setSelectedSub(0);
        }, []);

        // The caller pins the popup by its height, and the block-type panel changes
        // that height, so it is reported rather than left to be inferred.
        useEffect(() => {
            onSubmenuOpenChange?.(submenuVisible);
        }, [submenuVisible, onSubmenuOpenChange]);

        // Hovering "Turn into" opens the panel beside the menu, the way a menu bar
        // works. Leaving closes it again -- but only after a moment, so the pointer
        // can cross the gap between the two panels without the panel vanishing from
        // under it on the way.
        const cancelClose = useCallback(() => {
            if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
            }
        }, []);
        const scheduleClose = useCallback(() => {
            cancelClose();
            closeTimerRef.current = window.setTimeout(() => {
                closeTimerRef.current = null;
                setTurnIntoOpen(false);
                setFocus('main');
            }, 140);
        }, [cancelClose]);
        useEffect(() => () => cancelClose(), [cancelClose]);

        const selectRow = (row: Row | undefined) => {
            if (!row) return;
            if (row.kind === 'turn-into') {
                setTurnIntoOpen(true);
                setFocus('sub');
                setSelectedSub(0);
                return;
            }
            command(row.command);
        };

        const handleKeyDown = (event: KeyboardEvent): boolean => {
            // Left and right mean "leave the submenu" to the menu, but they are
            // also how a text caret moves inside the search box. Deciding between
            // the two by asking where the keystroke came from is the only way to
            // avoid breaking both.
            const inSearchBox =
                variant === 'block' && event.target === filterRef.current;

            if (event.key === 'ArrowLeft' && !inSearchBox && inSubmenu) {
                event.preventDefault();
                // Beside the menu, Left only hands the arrows back -- the panel
                // stays open, which is what makes it possible to go back and forth.
                // Standing in for the menu, there is nothing to go back to, so it
                // closes.
                if (!beside) closeSubmenu();
                else setFocus('main');
                return true;
            }
            if (
                event.key === 'ArrowRight' &&
                !inSearchBox &&
                !inSubmenu &&
                rows[selected]?.kind === 'turn-into'
            ) {
                event.preventDefault();
                setTurnIntoOpen(true);
                setFocus('sub');
                setSelectedSub(0);
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
                selectRow(rows[selected]);
                return true;
            }
            if (event.key === 'Escape') {
                // Escape backs out of the block types before it closes the menu,
                // which is what lets a mistyped command be undone one step at a time.
                if (inSubmenu) {
                    closeSubmenu();
                    return true;
                }
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

        // Reset the highlights whenever the rows genuinely change, otherwise an
        // index from the previous query can point past the end of the new one.
        useEffect(() => {
            setSelectedMain(0);
            setSelectedSub(0);
        }, [rowsKey]);

        // Keep the highlighted row on screen. Arrow keys can move the selection
        // past the fold, and without this the list looks stuck while the keyboard
        // is clearly working.
        useEffect(() => {
            activeRef.current?.scrollIntoView({ block: 'nearest' });
        }, [selectedMain]);
        useEffect(() => {
            activeSubRef.current?.scrollIntoView({ block: 'nearest' });
        }, [selectedSub]);

        // The block menu is opened by a button, which takes focus with it. Take
        // it back explicitly so typing filters the menu rather than landing in the
        // document behind it. The selection menu must not do this -- taking
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
        // cannot drift apart. Built per panel because the two panels are walked
        // separately.
        const renderPanel = (
            panel: 'main' | 'sub',
            list: Row[],
            highlighted: number,
            activeRowRef: React.RefObject<HTMLButtonElement | null>,
            setHighlight: (index: number) => void,
        ) => {
            const flatIndex = new Map<string, number>();
            list.forEach((row, index) => flatIndex.set(row.id, index));

            const renderRow = (row: Row) => {
                const index = flatIndex.get(row.id) ?? 0;
                const isSelected = index === highlighted;

                if (row.kind === 'turn-into') {
                    return (
                        <button
                            type="button"
                            key={row.id}
                            ref={isSelected ? activeRowRef : undefined}
                            role="option"
                            aria-selected={isSelected}
                            aria-haspopup="menu"
                            aria-expanded={submenuVisible}
                            className={`slash-menu-item slash-menu-item--submenu${
                                isSelected ? ' slash-menu-item--active' : ''
                            }${submenuVisible ? ' slash-menu-item--open' : ''}`}
                            onMouseDown={event => {
                                event.preventDefault();
                                selectRow(row);
                            }}
                            onMouseEnter={() => {
                                cancelClose();
                                setTurnIntoOpen(true);
                                setSelectedMain(index);
                            }}
                        >
                            <span className="slash-menu-icon">
                                <Type size={14} strokeWidth={1.8} />
                            </span>
                            <span className="slash-menu-text">
                                <span className="slash-menu-title">Turn into</span>
                            </span>
                            <ChevronRight size={14} strokeWidth={1.8} />
                        </button>
                    );
                }

                const item = row.command;
                const Icon = ICONS[item.icon] ?? Type;
                const isStarred = favourites.includes(item.id);
                const isDanger = item.id === 'delete' || item.id.startsWith('delete-');
                // The block's own type, marked rather than described. This is what
                // the hint on this row used to say, and saying it in words cost
                // every row a second line; here it is state, and it belongs on the
                // row it is about.
                const isCurrent = item.title === currentType;
                return (
                    <button
                        type="button"
                        key={item.id}
                        ref={isSelected ? activeRowRef : undefined}
                        role="option"
                        aria-selected={isSelected}
                        className={`slash-menu-item${isSelected ? ' slash-menu-item--active' : ''}${
                            isDanger ? ' slash-menu-item--danger' : ''
                        }${isCurrent ? ' slash-menu-item--current' : ''}`}
                        // mousedown rather than click: the editor must not lose its
                        // selection before the command runs.
                        onMouseDown={event => {
                            event.preventDefault();
                            selectRow(row);
                        }}
                        onMouseEnter={() => {
                            // Menu-bar behaviour: the panel belongs to the "Turn
                            // into" row, so it closes when the pointer moves off
                            // that row onto anything else in the main panel. Moving
                            // within the panel itself must not close it, which is
                            // also what stops a close already on its way from
                            // landing as the pointer crosses the gap.
                            if (panel === 'sub') cancelClose();
                            else if (submenuVisible) scheduleClose();
                            setHighlight(index);
                        }}
                    >
                        <span className="slash-menu-icon">
                            <Icon size={14} strokeWidth={1.8} />
                        </span>
                        <span className="slash-menu-text">
                            <span className="slash-menu-title">{item.title}</span>
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

            const favouritesRows = list.filter(
                row =>
                    row.kind === 'command' &&
                    favourites.includes(row.command.id),
            );
            const ordered = list.filter(row => row.kind === 'command');

            return (
                <>
                    {list.length === 0 ? (
                        <span className="slash-menu-empty">No matching blocks</span>
                    ) : (
                        <>
                            {/* Drawn above the groups rather than among them: it is not
                                a block type, it is the way to the block types, so it
                                does not belong under any group heading. */}
                            {list.map(row =>
                                row.kind === 'turn-into' ? renderRow(row) : null,
                            )}

                            {favouritesRows.length > 0 && (
                                <>
                                    <div className="slash-menu-group">Favourites</div>
                                    {favouritesRows.map(renderRow)}
                                </>
                            )}

                            {SLASH_GROUP_ORDER.map(group => {
                                // Starred commands live in the Favourites group
                                // only -- see `buildRows`.
                                const groupItems = ordered.filter(
                                    row =>
                                        row.kind === 'command' &&
                                        row.command.group === group &&
                                        !favourites.includes(row.command.id),
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
                </>
            );
        };

        return (
            <div
                className="slash-menu-shell"
                role="dialog"
                aria-label="Block menu"
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
                onKeyDown={event => {
                    if (handleKeyDown(event.nativeEvent)) {
                        // Not calling preventDefault unconditionally: the
                        // suggestion plugin relies on the keystroke still
                        // reaching the editor after the menu declines it.
                        if (variant === 'block') event.preventDefault();
                    }
                }}
            >
                {/* Beside the block types or instead of them: when the submenu is
                    standing in for this panel there is nothing here to draw. */}
                {(!submenuVisible || beside) && (
                    <div
                        className={`slash-menu slash-menu--${variant}`}
                        data-panel="main"
                        role="listbox"
                        aria-label="Block actions"
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

                        {renderPanel('main', mainRows, selectedMain, activeRef, setSelectedMain)}

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
                )}

                {submenuVisible && (
                    <div
                        ref={submenuRef}
                        className={`slash-menu slash-menu--submenu slash-menu--submenu-${submenuSide}`}
                        data-panel="submenu"
                        role="listbox"
                        aria-label="Block types"
                    >
                        {/* The way out, where there is nowhere else to go: with the
                            panel beside the menu, Left and Escape are available to a
                            keyboard but a mouse has neither. */}
                        {!beside && (
                            <button
                                type="button"
                                className="slash-menu-back"
                                onMouseDown={event => {
                                    event.preventDefault();
                                    closeSubmenu();
                                }}
                            >
                                <ChevronLeft size={14} strokeWidth={1.8} />
                                Turn into
                            </button>
                        )}
                        {renderPanel('sub', sub.rows, selectedSub, activeSubRef, setSelectedSub)}
                    </div>
                )}
            </div>
        );
    },
);

BlockMenu.displayName = 'BlockMenu';

export default BlockMenu;
