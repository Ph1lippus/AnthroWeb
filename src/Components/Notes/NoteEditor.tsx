import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
// KaTeX ships its own stylesheet; without it the maths renders as unstyled
// fractions and radicals.
import 'katex/dist/katex.min.css';
import type { TableOfContentData } from '@tiptap/extension-table-of-contents';
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { GripVertical } from 'lucide-react';
import {
    buildNoteExtensions,
    blockConversions,
    canSplitSubmenu,
    slashMenuOpen,
    setBlockMenuKeyHandler,
} from '../../utils/noteEditorExtensions';
import type { BlockMenuKeyHandler, SlashCommand } from '../../utils/noteEditorExtensions';
import type { BlockTarget } from '../../utils/noteBlockActions';
import { resolveBlockTarget } from '../../utils/noteBlockActions';
import type { FormatAction } from '../../utils/noteBlockMenuItems';
import {
    buildActionCommands,
    buildFormatActions,
    buildTableCommands,
} from '../../utils/noteBlockMenuItems';
import { normalizeNoteHtml } from '../../utils/noteContent';
import BlockMenu from './BlockMenu';
import type { BlockMenuRef } from './BlockMenu';

interface NoteEditorProps {
    /** Stored HTML. Only used to seed the editor on first mount. */
    initialHtml: string;
    onChange: (html: string) => void;
    /** Put the caret in the body on mount. Used for blank pages only. */
    autoFocus?: boolean;
    /** Dim every block except the one holding the caret. */
    focusMode?: boolean;
    /** Reported whenever the headings change, so the pane can draw an outline. */
    onTocChange?: (items: TableOfContentData) => void;
}

/**
 * What the page header can ask of the editor.
 *
 * The block menu needs an entry point that does not depend on the drag gutter,
 * because the gutter is hidden on a phone and there is no hover to reveal it
 * there. Rather than leave a floating button to drift around the pane, the
 * header's own button opens the same menu against whatever block the caret is
 * in.
 */
export interface NoteEditorHandle {
    openBlockMenu: (anchor: DOMRect) => void;
}

/** Everything the block menu needs, resolved once at the moment it opens. */
interface MenuState {
    /** Distinguishes one opening from another, so it is only placed once. */
    id: number;
    anchor: DOMRect;
    /**
     * Which side of the main menu the "Turn into" panel opens on.
     *
     * `right` by default; `left` when the right would run off the screen. It is a
     * panel of block types, not an overlay, so it is allowed to sit over the note
     * if that is the only way to open it: a menu that cannot be reached is worse
     * than one that briefly covers a paragraph.
     */
    submenuSide: 'right' | 'left';
    /** Whether "Turn into" is open, and so drawn beside the main menu. */
    submenuOpen: boolean;
    /** Where the popup is pinned, in viewport coordinates. */
    left: number;
    top: number;
    target: BlockTarget;
    formats: FormatAction[];
    conversions: SlashCommand[];
    currentType: string;
    items: SlashCommand[];
    heading: string;
    language: string | null;
    source: 'handle' | 'selection';
}

/** Panel width, and so the space a placement has to find. Mirrors the CSS. */
const MENU_WIDTH = 268;
/** Gap between the anchor and the menu, and between the two menu panels. */
const MENU_GAP = 8;
/** Distance kept from the edge of the window. */
const MENU_MARGIN = 8;

/**
 * Places the main panel against its anchor, flipping rather than leaving the
 * window. The "Turn into" panel is positioned by CSS relative to this one, so
 * only the main panel's own box is placed here.
 *
 * `position: fixed`, because the anchor rect is viewport-relative and the editor
 * scrolls inside its own pane rather than moving the page. Hand-rolled rather
 * than floating-ui: the menu is short-lived and closes on the first scroll
 * anyway, and @floating-ui is only here as an undeclared transitive dependency
 * of TipTap.
 *
 * A selection opens beside the text, never over it. Which side is settled from
 * the anchor's own rect and the window -- not from the rendered popup -- so the
 * menu cannot be seen jumping from one side of the text to the other.
 *
 * `height` is the taller of the two panels when the submenu is open, because the
 * two share a top edge and the taller one is what decides whether they fit.
 */
const placeMenu = (
    anchor: DOMRect,
    width: number,
    height: number,
): { left: number; top: number } => {
    // Right is the preference: that is the side the panel's own chevrons point,
    // and the side with the menu icon already on it.
    const roomRight = window.innerWidth - MENU_MARGIN - anchor.right - MENU_GAP;
    const roomLeft = anchor.left - MENU_MARGIN - MENU_GAP;
    const useRight = roomRight >= width || roomRight >= roomLeft;

    const preferred = useRight
        ? anchor.right + MENU_GAP
        : anchor.left - width - MENU_GAP;
    // A block narrower than the menu, or a viewport narrower than the menu: clamp
    // to the margin rather than letting it hang off the edge.
    const left = Math.max(
        MENU_MARGIN,
        Math.min(preferred, window.innerWidth - width - MENU_MARGIN),
    );

    // Top-aligned with the anchor's first line, then pulled inside the window.
    // Together with the side placement, that is what keeps the menu off the text:
    // it can sit beside it, above it or below it, never across it.
    const top = Math.max(
        MENU_MARGIN,
        Math.min(anchor.top, window.innerHeight - height - MENU_MARGIN),
    );

    return { left, top };
};

/**
 * Which side of the main menu the block-type panel goes on.
 *
 * Right by default; left when the right would run off the screen. Never "do not
 * open it": the panel is narrow, and it is allowed to overlap the note rather
 * than become unreachable.
 */
const submenuSideFor = (mainLeft: number, mainWidth: number): 'right' | 'left' => {
    const needed = MENU_WIDTH + MENU_GAP;
    if (mainLeft + mainWidth + needed <= window.innerWidth - MENU_MARGIN) return 'right';
    if (mainLeft - needed >= MENU_MARGIN) return 'left';
    return 'right';
};

/**
 * The drag handle's positioning types, taken from the component's own props.
 *
 * `@floating-ui/dom` is reachable from here -- the drag handle is built on it --
 * but it is not a declared dependency of this project, only a transitive one, so
 * importing from it directly would tie the build to a package that a future
 * dependency change could hoist away. Reaching the types through the prop keeps
 * them honest without naming the package.
 */
type HandlePositionConfig = NonNullable<
    ComponentProps<typeof DragHandle>['computePositionConfig']
>;
type HandleMiddleware = NonNullable<HandlePositionConfig['middleware']>[number];

/**
 * Nudges the drag handle down so its dots line up with the block's first line.
 *
 * `placement: 'left-start'` lines the handle's top edge up with the block's top
 * edge, and the handle is a fixed 24px tall. That is only centred when the first
 * line happens to be 24px. The prose line box here is 26.6px and a heading's is
 * larger still, so the dots sat a few pixels high -- about 4px on an `h1`, which
 * is enough to read as "not lined up" beside a row of text.
 *
 * The correction is half the difference between the first line's height and the
 * handle's, so it is zero when they already agree and grows with the heading
 * level. The first line is the block's own `line-height` rather than its full
 * height, because a paragraph of five lines has to keep its grip beside the
 * *first* one rather than drifting to the middle of the paragraph.
 *
 * `line-height` is read rather than assumed: elements that set none of their own
 * -- a `<ul>`, a flex row -- report `normal`, which does not parse as a number,
 * and fall back to the element's own height.
 */
const centreOnFirstLine: HandleMiddleware = {
    name: 'centreOnFirstLine',
    fn: state => {
        const handle = state.elements.floating;
        if (!(handle instanceof HTMLElement)) return {};
        const reference = state.rects.reference;
        const element = state.elements.reference;
        const declared =
            element instanceof Element ? parseFloat(getComputedStyle(element).lineHeight) : NaN;
        const firstLine = Number.isFinite(declared)
            ? Math.min(reference.height, declared)
            : reference.height;
        return { y: state.y + (firstLine - handle.offsetHeight) / 2 };
    },
};

/**
 * The rectangle a text selection covers on screen.
 *
 * ProseMirror's coords are viewport-relative, which is what `placeMenu` wants.
 * The selection's two ends are unioned rather than just taking the first: a
 * selection spanning three lines has to put the menu beside the *first* of them,
 * and that only works if the top edge is the topmost of the two.
 *
 * Returns null for a collapsed selection, which is the caller's signal that there
 * is nothing to show a menu about.
 */
const selectionRect = (instance: Editor): DOMRect | null => {
    const { from, to } = instance.state.selection;
    if (from === to) return null;
    const start = instance.view.coordsAtPos(from);
    const end = instance.view.coordsAtPos(to);
    const left = Math.min(start.left, end.left);
    const right = Math.max(start.right, end.right);
    const top = Math.min(start.top, end.top);
    const bottom = Math.max(start.bottom, end.bottom);
    return new DOMRect(left, top, right - left, bottom - top);
};

/**
 * The note body editor.
 *
 * Always editable and always mounted: there is no read mode and no edit toggle,
 * so opening a note puts you in a live document. Uncontrolled by design -- the
 * parent owns the stored HTML but this component owns the live document, and the
 * two are reconciled once on mount rather than on every render.
 */
const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
    {
        initialHtml,
        onChange,
        autoFocus = false,
        focusMode = false,
        onTocChange,
    },
    ref,
) {
    // The outline is reported upward rather than rendered here, because the
    // control that shows and hides it lives in the page header.
    const [tocItems, setTocItems] = useState<TableOfContentData>([]);
    const [menu, setMenu] = useState<MenuState | null>(null);
    // The popup's own position in the DOM, so the dismiss handlers can tell a
    // click on the menu from a click outside it. The block-type panel is a child
    // of this element, positioned off to one side of it, so this measures the main
    // panel and contains both.
    const menuRef = useRef<HTMLDivElement>(null);
    // The block-type panel alone, so its height is known: it shares the main
    // panel's top edge, and it is often the taller of the two.
    const submenuRef = useRef<HTMLDivElement>(null);
    // The BlockMenu component itself, for the variant that cannot hold focus and
    // therefore has to be driven through ProseMirror.
    const menuComponentRef = useRef<BlockMenuRef>(null);

    const editor = useEditor({
        extensions: buildNoteExtensions({
            placeholder: "Type '/' for blocks...",
            onTocUpdate: setTocItems,
        }),
        content: normalizeNoteHtml(initialHtml),
        // Notion-style pages are not a form field: nothing should submit them and
        // nothing should be stripped out of them.
        editorProps: {
            attributes: {
                class: 'note-prose',
                spellcheck: 'true',
            },
        },
        // Reported on every document change so the parent can debounce, rather
        // than saving inside this component, so autosave stays in one place.
        onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    });

    // Only a blank page pulls the caret into the body, so opening an existing
    // note leaves the scroll where you left it instead of jumping to the bottom.
    useEffect(() => {
        // isDestroyed, not just a truthiness check: under StrictMode React mounts,
        // unmounts and remounts effects in dev. TipTap tears the editor down in
        // between, which leaves `editor` truthy but its view null -- so
        // `editor.commands` throws on a destroyed instance rather than on a null
        // one. Only touch commands on a live editor.
        if (!autoFocus || !editor || editor.isDestroyed) return;
        editor.commands.focus('end');
    }, [editor, autoFocus]);

    // Hand the outline up whenever it is recomputed. Guarded so a destroyed
    // editor cannot warn about setting state on an unmounted component.
    useEffect(() => {
        if (editor && !editor.isDestroyed) onTocChange?.(tocItems);
    }, [editor, tocItems, onTocChange]);

// The block the drag handle is pointing at, and the one the menu acts on if
    // it is opened some other way. A ref rather than state: it changes on every
    // mouse move across the document, and re-rendering the editor that often
    // would be a lot of work for nothing.
    const handlePosRef = useRef(-1);
    const nextMenuIdRef = useRef(0);
    const placedMenuIdRef = useRef(-1);
    // Mirrors of the open menu, readable from ProseMirror's transaction handler
    // without making that handler depend on a re-render.
    const menuSourceRef = useRef<'handle' | 'selection' | null>(null);
    // Whether the selection was empty the last time it changed, which is how
    // "a new selection was made" is told from "the existing one was adjusted".
    const selectionWasEmptyRef = useRef(true);
    // A selection made while the left button was still down. The menu waits on it
    // rather than opening mid-drag -- see the effect on the transaction handler.
    const pointerDownRef = useRef(false);
    // Set when that happened, so the pointerup handler knows there is something
    // waiting for it even if the selection has not changed again since.
    const pendingSelectionRef = useRef(false);

    const closeMenu = useCallback(() => {
        menuSourceRef.current = null;
        pendingSelectionRef.current = false;
        setMenu(null);
    }, []);

    const openMenu = useCallback(
        (instance: Editor, anchor: DOMRect, handlePos: number, source: 'handle' | 'selection') => {
            if (instance.isDestroyed) return;

            const target = resolveBlockTarget(instance, handlePos);
            if (!target) return;

            const inCodeBlock = instance.isActive('codeBlock');
            const conversions = blockConversions();
            // Read off the same list the submenu draws from, so the label and the
            // rows it labels can never disagree about which type is current.
            const current = conversions.find(command => command.isActive?.(instance));
            // Placed from the anchor's own rect and an assumed panel size, so the
            // popup never renders a frame at the top-left corner while it waits to
            // be measured for real.
            const assumed = placeMenu(anchor, MENU_WIDTH, 380);

            nextMenuIdRef.current += 1;
            menuSourceRef.current = source;
            setMenu({
                id: nextMenuIdRef.current,
                anchor,
                submenuSide: submenuSideFor(assumed.left, MENU_WIDTH),
                submenuOpen: false,
                left: assumed.left,
                top: assumed.top,
                source,
                target,
                // Always offered. With a collapsed caret these set the mark for
                // whatever is typed next, which is what every editor does with them;
                // hiding them there only taught that the buttons were unreliable.
                formats: inCodeBlock ? [] : buildFormatActions(instance),
                conversions,
                currentType: current?.title ?? '',
                items: [
                    ...buildActionCommands(instance, target),
                    ...(instance.isActive('table') ? buildTableCommands(instance) : []),
                ],
                heading: target.blocks > 1 ? `${target.blocks} blocks selected` : '',
                language: inCodeBlock
                    ? ((instance.getAttributes('codeBlock').language as string | null) ??
                      'plaintext')
                    : null,
            });
        },
        [],
    );

    /**
     * Re-settles the placement after the panels have been measured.
     *
     * Called once per opening and again whenever "Turn into" opens or closes,
     * because that changes how tall the taller panel is. Writing `left`/`top` back
     * is safe here even though the effect reads the object it writes into: the
     * measurement is idempotent, so a second pass computes the same numbers and
     * React bails out of the re-render.
     */
    const remeasure = useCallback((which: 'open' | 'submenu', id: number) => {
        setMenu(current => {
            if (!current || current.id !== id) return current;
            if (which === 'open' && placedMenuIdRef.current === current.id) return current;
            if (which === 'open') placedMenuIdRef.current = current.id;

            const width = menuRef.current?.offsetWidth || MENU_WIDTH;
            const mainHeight = menuRef.current?.offsetHeight || 380;
            // Only counted when the panel is actually drawn beside the menu. Below
            // the split width it stands in for the menu instead, and there is only
            // one panel on screen.
            const beside = current.submenuOpen && canSplitSubmenu();
            const subHeight = beside ? submenuRef.current?.offsetHeight || 0 : 0;
            // The two panels share a top edge, so it is the taller one that decides
            // whether they clear the bottom of the window.
            const height = beside ? Math.max(mainHeight, subHeight) : mainHeight;
            const { left, top } = placeMenu(current.anchor, width, height);
            const submenuSide = submenuSideFor(left, width);
            if (
                left === current.left &&
                top === current.top &&
                submenuSide === current.submenuSide
            ) {
                return current;
            }
            return { ...current, left, top, submenuSide };
        });
    }, []);

    const setSubmenuOpen = useCallback((open: boolean) => {
        setMenu(current =>
            !current || current.submenuOpen === open ? current : { ...current, submenuOpen: open },
        );
    }, []);

    // Read out as primitives rather than off the object, so the effects below key
    // on what they actually care about and do not re-run on every state write.
    const menuId = menu?.id ?? null;
    const submenuOpen = menu?.submenuOpen ?? false;

    // Measured after the menu renders, so its real size is known.
    useEffect(() => {
        if (menuId !== null) remeasure('open', menuId);
    }, [menuId, remeasure]);

    // Opening or closing "Turn into" changes how tall the taller panel is, and the
    // two panels share a top edge, so the top has to be re-clamped against the
    // window. Also runs on a fresh opening, which is free: `remeasure` is
    // idempotent.
    useEffect(() => {
        if (menuId !== null) remeasure('submenu', menuId);
    }, [menuId, submenuOpen, remeasure]);

    // Opening the menu on a text selection.
    //
    // Two rules, and both of them are about *when*.
    //
    // Every selection change arrives here, including the ones that are just the
    // document settling, so the trigger is narrow on purpose: the selection has to
    // have just gone from empty to not empty, and the transaction that did it must
    // not have changed the document. That is what a drag or a Shift+Arrow looks
    // like, and it excludes typing -- which also collapses the selection and would
    // otherwise open the menu on every keystroke of a held-down arrow key.
    //
    // And a drag has to be over first. ProseMirror reports the selection growing
    // on every pointer move, so opening on the first one put the menu down in the
    // middle of the text being selected -- on top of the caret, in front of the
    // words the user was still dragging towards. So while the left button is held
    // down the open is only noted, and `pointerup` is what actually opens it. A
    // selection made with the keyboard has no button to wait for and opens at once.
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const instance = editor;

        const openForSelection = (current: Editor) => {
            if (current.isDestroyed) return;
            // Only ever one menu. "/" owns the caret already, and the handle menu
            // was opened deliberately against a block the reader already chose.
            if (slashMenuOpen.current || menuSourceRef.current === 'handle') return;
            if (current.isActive('codeBlock')) return;
            const { from, to } = current.state.selection;
            if (from === to) return;
            const anchor = selectionRect(current);
            if (!anchor) return;
            openMenu(current, anchor, -1, 'selection');
        };

        const onTransaction = ({
            editor: current,
            transaction,
        }: {
            editor: Editor;
            transaction: Transaction;
        }) => {
            const { from, to } = current.state.selection;
            const nonEmpty = from !== to;

            if (!nonEmpty) {
                selectionWasEmptyRef.current = true;
                // A collapsed selection means the thing the menu was opened for is
                // no longer there, whether because the user clicked away or because
                // a command rearranged the document.
                pendingSelectionRef.current = false;
                if (menuSourceRef.current === 'selection') closeMenu();
                return;
            }

            const justMade = selectionWasEmptyRef.current;
            selectionWasEmptyRef.current = false;
            if (!justMade || transaction.docChanged) return;
            if (slashMenuOpen.current || menuSourceRef.current === 'handle') return;

            if (pointerDownRef.current) {
                pendingSelectionRef.current = true;
                return;
            }
            openForSelection(current);
        };

        const onDown = () => {
            pointerDownRef.current = true;
        };
        const onUp = () => {
            pointerDownRef.current = false;
            if (!pendingSelectionRef.current) return;
            pendingSelectionRef.current = false;
            openForSelection(instance);
        };
        // A pointer that leaves the window, or a window that loses focus, ends the
        // drag without a `pointerup`. Without this the button would look stuck down
        // and every later selection would wait forever for a release that has
        // already happened.
        const onCancel = () => {
            pointerDownRef.current = false;
            pendingSelectionRef.current = false;
        };

        instance.on('transaction', onTransaction);
        // Capture phase: the editor stops propagation on some of these, and a
        // missed `pointerup` would leave the menu permanently unopened.
        window.addEventListener('pointerdown', onDown, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onCancel, true);
        window.addEventListener('blur', onCancel);
        return () => {
            instance.off('transaction', onTransaction);
            window.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onCancel, true);
            window.removeEventListener('blur', onCancel);
        };
    }, [editor, closeMenu, openMenu]);

    // The popup is pinned to fixed coordinates, so it has to leave when the page
    // moves under it. Scrolling is caught in the capture phase because the editor
    // scrolls its own pane, and the menu's own overflow has to be let through --
    // scrolling the highlighted row into view would otherwise close the menu on
    // the very keystroke that opened it.
    useEffect(() => {
        if (!menu) return;
        const onScroll = (event: Event) => {
            const target = event.target;
            if (target instanceof Node && menuRef.current?.contains(target)) return;
            closeMenu();
        };
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && menuRef.current?.contains(target)) return;
            closeMenu();
        };
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [menu, closeMenu]);

    // The menu opened on a selection cannot hold focus, or the selection it acts
    // on would collapse. So its keys are forwarded through ProseMirror instead --
    // see `BlockMenuKeys`. The wrapper reads the live imperative handle on every
    // keystroke rather than capturing one, because the handle is replaced on each
    // render and a captured copy would be frozen on whatever row was highlighted
    // when the menu opened.
    const forwardMenuKeys = useCallback<BlockMenuKeyHandler>(
        event => menuComponentRef.current?.onRawKeyDown?.(event) ?? false,
        [],
    );

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const instance = editor;
        setBlockMenuKeyHandler(
            instance,
            menu?.source === 'selection' ? forwardMenuKeys : null,
        );
        return () => {
            if (!instance.isDestroyed) setBlockMenuKeyHandler(instance, null);
        };
    }, [editor, menu?.id, menu?.source, forwardMenuKeys]);

    const runMenuCommand = useCallback(
        (item: SlashCommand) => {
            if (!editor || editor.isDestroyed) return;
            item.run(editor);
            // Every command here rebuilds the document around the range the menu
            // was resolved against, so the popup closes rather than re-aiming
            // itself at positions that no longer mean what they did.
            closeMenu();
        },
        [editor, closeMenu],
    );

    // Memoised because the drag handle wrapper lists it as a `useEffect`
    // dependency: an inline object would unregister and re-register the plugin on
    // every render. The negative offset is what puts the grip in the gutter
    // instead of on top of the block's first character.
    const handlePositionConfig = useMemo<HandlePositionConfig>(
        () => ({
            placement: 'left-start',
            strategy: 'absolute',
            offset: -8,
            // floating-ui runs these after the placement is computed, which is
            // where the vertical correction belongs. Its own `flip` and `shift`
            // are deliberately absent: the grip belongs beside its block, even
            // where that means sitting over the margin.
            middleware: [centreOnFirstLine],
        }),
        [],
    );

    useImperativeHandle(
        ref,
        () => ({
            openBlockMenu: anchor => {
                // No handle position, so the menu resolves the caret's own block.
                if (editor && !editor.isDestroyed) openMenu(editor, anchor, -1, 'handle');
            },
        }),
        [editor, openMenu],
    );

    if (!editor) {
        return <div className="note-prose-loading" />;
    }

    return (
        <div className={`note-editor-shell${focusMode ? ' note-editor-shell--focus' : ''}`}>
            {/* Grip to the left of a block for reordering it, and the way into that
                block's menu. Only mounted on a live editor, since it reaches into
                the editor's node positions. */}
            <DragHandle
                editor={editor}
                className="note-drag-handle"
                computePositionConfig={handlePositionConfig}
                onNodeChange={({ node, pos }) => {
                    handlePosRef.current = node ? pos : -1;
                }}
            >
                <button
                    type="button"
                    className="note-drag-handle-btn"
                    aria-label="Block actions"
                    title="Drag to move, click for block actions"
                    onClick={event =>
                        openMenu(
                            editor,
                            event.currentTarget.getBoundingClientRect(),
                            handlePosRef.current,
                            'handle',
                        )
                    }
                >
                    <GripVertical size={14} />
                </button>
            </DragHandle>

            {menu &&
                createPortal(
                    <div
                        className="block-menu-anchor"
                        ref={menuRef}
                        style={{ left: `${menu.left}px`, top: `${menu.top}px` }}
                    >
                        <BlockMenu
                            ref={menuComponentRef}
                            variant={menu.source === 'selection' ? 'selection' : 'block'}
                            items={menu.items}
                            conversions={menu.conversions}
                            heading={menu.heading}
                            currentType={menu.currentType}
                            formats={menu.formats}
                            submenuSide={menu.submenuSide}
                            split={canSplitSubmenu()}
                            onSubmenuOpenChange={setSubmenuOpen}
                            submenuRef={submenuRef}
                            codeLanguage={
                                menu.language === null
                                    ? undefined
                                    : {
                                          value: menu.language,
                                          onChange: value => {
                                              editor
                                                  .chain()
                                                  .focus()
                                                  .updateAttributes('codeBlock', { language: value })
                                                  .run();
                                          },
                                      }
                            }
                            command={runMenuCommand}
                            onRequestClose={closeMenu}
                        />
                    </div>,
                    document.body,
                )}

            <EditorContent editor={editor} />
        </div>
    );
});

export default NoteEditor;
