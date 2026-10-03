import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
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
     * Which edge of the anchor to sit against.
     *
     * `right` beside the drag handle's button, because a gutter is narrow and the
     * popup has to be out of the way of the text it is about to change. `above`
     * over a text selection, which is where the popup belongs when the thing it
     * acts on is the thing the reader is already looking at.
     */
    side: 'right' | 'above';
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

/**
 * Places the popup against its anchor, flipping rather than leaving the window.
 *
 * `position: fixed`, because the anchor rect is viewport-relative and the editor
 * scrolls inside its own pane rather than moving the page. Hand-rolled rather
 * than floating-ui: the menu is short-lived and closes on the first scroll
 * anyway, and @floating-ui is only here as an undeclared transitive dependency
 * of TipTap.
 */
const placeMenu = (
    anchor: DOMRect,
    menu: HTMLElement | null,
    side: 'right' | 'above',
): { left: number; top: number } => {
    const width = menu?.offsetWidth ?? 260;
    const height = menu?.offsetHeight ?? 360;
    const gap = 8;
    const margin = 8;
    const clampX = (value: number) =>
        Math.max(margin, Math.min(value, window.innerWidth - width - margin));

    let left: number;
    let top: number;

    if (side === 'above') {
        left = clampX((anchor.left + anchor.right) / 2 - width / 2);
        top = anchor.top - height - gap;
        // Above the selection is the first choice, not a guarantee: the selection
        // may be in the last few pixels of the viewport. Flip under it, and only
        // clamp to the margin if flipping does not fit either.
        if (top < margin) top = anchor.bottom + gap;
        if (top + height > window.innerHeight - margin) {
            top = Math.max(margin, window.innerHeight - height - margin);
        }
    } else {
        left = anchor.right + gap;
        if (left + width > window.innerWidth - margin) {
            const flipped = anchor.left - width - gap;
            // Prefer the flipped side only when it fits. Otherwise the popup is simply
            // wider than the space beside the block and has to overlap it.
            left = flipped >= margin ? flipped : clampX(window.innerWidth - width - margin);
        }
        // Taller than the window is possible on a phone with the list open, so this
        // clamps to the margin rather than to a negative top.
        top = Math.max(margin, Math.min(anchor.top, window.innerHeight - height - margin));
    }

    return { left, top };
};

/**
 * The rectangle a text selection covers on screen.
 *
 * ProseMirror's coords are viewport-relative, which is what `placeMenu` wants.
 * The selection's two ends are unioned rather than just taking the first: a
 * selection spanning three lines has to anchor the popup above the *first* line,
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
    // click on the menu from a click outside it, and so the menu's size can be
    // measured for placement.
    const menuRef = useRef<HTMLDivElement>(null);
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

    const closeMenu = useCallback(() => {
        menuSourceRef.current = null;
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
            const side = source === 'selection' ? 'above' : 'right';
            // Placed against the anchor's assumed size first, so the popup never
            // renders a frame at the top-left corner while it waits to be measured.
            const { left, top } = placeMenu(anchor, null, side);

            nextMenuIdRef.current += 1;
            menuSourceRef.current = source;
            setMenu({
                id: nextMenuIdRef.current,
                anchor,
                side,
                left,
                top,
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

    // Measured after the menu renders, so its real size is known. Keyed on the
    // opening id, because writing the result back into the state this effect
    // depends on would otherwise loop.
    useEffect(() => {
        if (!menu || placedMenuIdRef.current === menu.id) return;
        placedMenuIdRef.current = menu.id;
        const { left, top } = placeMenu(menu.anchor, menuRef.current, menu.side);
        setMenu(current => (current?.id === menu.id ? { ...current, left, top } : current));
    }, [menu]);

    // Opening the menu on a text selection.
    //
    // Every selection change comes through here, including the ones that are just
    // the document settling, so the trigger is narrow on purpose: the selection
    // has to have just gone from empty to not empty, and the transaction that did
    // it must not have changed the document. That is what a drag or a Shift+Arrow
    // looks like, and it excludes typing -- which also collapses the selection and
    // would otherwise open the menu on every keystroke of a held-down arrow key.
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const instance = editor;

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
                if (menuSourceRef.current === 'selection') closeMenu();
                return;
            }

            const justMade = selectionWasEmptyRef.current;
            selectionWasEmptyRef.current = false;
            if (!justMade || transaction.docChanged) return;
            // Only ever one menu. "/" owns the caret already, and the handle menu
            // was opened deliberately against a block the reader already chose.
            if (slashMenuOpen.current || menuSourceRef.current === 'handle') return;
            if (current.isActive('codeBlock')) return;

            const anchor = selectionRect(current);
            if (!anchor) return;
            openMenu(current, anchor, -1, 'selection');
        };

        instance.on('transaction', onTransaction);
        return () => {
            instance.off('transaction', onTransaction);
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
    const handlePositionConfig = useMemo(
        () => ({ placement: 'left-start' as const, strategy: 'absolute' as const, offset: -8 }),
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
