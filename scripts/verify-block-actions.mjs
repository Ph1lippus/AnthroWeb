/**
 * Checks that the block menu acts on the block the reader pointed at, inside a toggle.
 *
 * The target the menu works from was resolved by scanning the document's top-level
 * children and taking every one that overlapped the position. A line inside a
 * toggle is not a top-level child -- the toggle is -- so every action aimed at the
 * toggle instead of the line:
 *
 *   Delete removed the label and every other line in the body, and left the caret
 *   somewhere else entirely, which read as the delete having done something other
 *   than what was asked for.
 *   Duplicate copied the whole toggle, label and all.
 *   Move up on a line in the middle of the body swapped the toggle with the block
 *   above it, in the document.
 *
 * The target is now resolved at the level of the position's own block container,
 * which is the document everywhere except inside a toggle's body. What is asserted
 * here is the resulting document and caret for each action, because that is what a
 * reader sees; the menu's internals are not reached into.
 *
 * Runs a real editor -- jsdom for the DOM, the real node and the real actions -- so
 * a schema violation shows up as one rather than as a passing check.
 */
import { JSDOM } from 'jsdom';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) {
        pass++;
        console.log(`  ok   ${name}`);
    } else {
        fail++;
        console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
    }
};

const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', {
    pretendToBeVisual: true,
});
for (const key of [
    'window', 'document', 'Node', 'HTMLElement', 'Element', 'Event',
    'KeyboardEvent', 'MouseEvent', 'DOMParser', 'MutationObserver',
    'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
]) {
    globalThis[key] = dom.window[key];
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
});

/**
 * Makes `offsetParent` non-null, which jsdom otherwise never reports.
 *
 * `@tiptap/extension-details` tests a position's visibility with
 * `element.offsetParent !== null`, and its `appendTransaction` plugin moves any
 * selection it thinks is in a hidden body back out of the toggle. jsdom reports a
 * null `offsetParent` on every element, so that plugin fires on every transaction
 * inside a toggle and drags the caret out to the next block in the document --
 * which is indistinguishable from the bug being checked for. A getter on the
 * prototype, because `offsetParent` has no setter.
 */
Object.defineProperty(dom.window.Element.prototype, 'offsetParent', {
    configurable: true,
    get() {
        return this.parentElement ?? dom.window.document.body;
    },
});

const { Editor } = await import('@tiptap/core');
const { TextSelection } = await import('@tiptap/pm/state');
const StarterKit = (await import('@tiptap/starter-kit')).default;
const { DetailsContent, DetailsSummary } = await import('@tiptap/extension-details');
const { LiftToggleOnBackspace, ToggleDetails } = await import('../src/utils/noteToggle.ts');
const {
    deleteBlocks,
    duplicateBlocks,
    moveBlocks,
    resolveBlockTarget,
} = await import('../src/utils/noteBlockActions.ts');

/**
 * An editor holding `content`, with its toggles actually open.
 *
 * The wait is load-bearing. `addNodeView` unhides a toggle's body from a
 * `setTimeout`, and until that runs the body is `hidden`, so a selection put inside
 * it is one the extension's own plugin moves straight back out again. Every
 * assertion here is about where the caret lands relative to a toggle, and against a
 * closed one the answer is always "outside it" no matter what the code under test
 * does.
 *
 * `open` is on a real `<details>` element too: the attribute is parsed off that tag
 * and off nothing else, so `div[data-type="details"] open` parses closed.
 */
const make = async content => {
    const instance = new Editor({
        element: dom.window.document.getElementById('editor'),
        // The app's own settings on the two that matter here: the toggle node, and
        // no guaranteed trailing paragraph after the last block.
        extensions: [
            StarterKit.configure({ codeBlock: false, trailingNode: false }),
            ToggleDetails.configure({ persist: true, openClassName: 'is-open' }),
            DetailsSummary.configure({ HTMLAttributes: { class: 'note-toggle-summary' } }),
            DetailsContent.configure({ HTMLAttributes: { class: 'note-toggle-content' } }),
            LiftToggleOnBackspace,
        ],
        content,
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const hidden = instance.view.dom.querySelector('[data-type="detailsContent"][hidden]');
    if (hidden) throw new Error('a toggle body is still hidden, so nothing here would be on screen');
    return instance;
};

/** A toggle with `inner` as its body. */
const toggle = inner =>
    '<details open data-type="details"><summary>Label</summary>' +
    `<div data-type="detailsContent">${inner}</div></details>`;

/**
 * Puts the caret at the start of the line holding `text`.
 *
 * `at + 1` rather than a resolved position's own parent: this is the position the
 * caret has when it is at the start of a line, which is what the browser produces
 * and therefore what the target resolution has to cope with. At a boundary between
 * two nodes ProseMirror resolves to the shallower one, so for the first line of a
 * body that is the body itself rather than the paragraph.
 */
const caretOn = (instance, text) => {
    let at = -1;
    instance.state.doc.descendants((node, pos) => {
        if (node.textContent === text && at === -1) at = pos;
    });
    if (at === -1) throw new Error(`no line holding ${JSON.stringify(text)}`);
    instance.view.dispatch(
        instance.state.tr.setSelection(TextSelection.create(instance.state.doc, at + 1)),
    );
};

/** The document, without the classes the node views add so it can be matched on. */
const htmlOf = instance =>
    instance.getHTML()
        .replace(/ class="note-toggle-summary"/g, '')
        .replace(/ class="note-toggle-content"/g, '');

/** Where the caret ended up, as a path and the text of the block holding it. */
const caretAt = instance => {
    const { $from } = instance.state.selection;
    const path = [];
    for (let depth = 0; depth <= $from.depth; depth++) path.push($from.node(depth).type.name);
    return `${path.join('/')} ${JSON.stringify($from.parent.textContent)}@${$from.parentOffset}`;
};

/**
 * The position of the top-level block holding the line `text`.
 *
 * Stands in for the drag handle, which is mounted without `nested` and therefore
 * reports the outermost node whatever is under the pointer. A toggle is always the
 * answer it gives, for its label and for every line in its body alike.
 */
const handlePosOn = (instance, text) => {
    let at = -1;
    instance.state.doc.descendants((node, pos) => {
        if (node.textContent === text && at === -1) at = pos;
    });
    const $at = instance.state.doc.resolve(at);
    let outer = at;
    for (let depth = $at.depth; depth > 0; depth--) outer = $at.before(depth);
    return outer;
};

/** Runs one action and reports the document and the caret afterwards. */
const act = async (content, { caretOn: caretText, handlePos, run }) => {
    const instance = await make(content);
    caretOn(instance, caretText);
    const target = resolveBlockTarget(
        instance,
        handlePos === undefined ? -1 : handlePosOn(instance, handlePos),
    );
    if (!target) throw new Error('no target resolved');
    run(instance, target);
    const out = { html: htmlOf(instance), caret: caretAt(instance) };
    instance.destroy();
    return out;
};

const TWO_LINES = `<p>Above</p>${toggle('<p>First</p><p>Second</p>')}<p>Below</p>`;
const ONE_LINE = `<p>Above</p>${toggle('<p>Only</p>')}<p>Below</p>`;

console.log('\n== Delete: the line, not the toggle ==');
{
    // Every one of these removed the whole toggle before.
    const first = await act(TWO_LINES, {
        caretOn: 'First',
        run: deleteBlocks,
    });
    check('on the first line it removes that line',
        first.html.includes('<p>Second</p>') && !first.html.includes('First'), first.html);
    check('and the toggle and its label survive',
        first.html.includes('<summary>Label</summary>'), first.html);
    check('and the caret is left on the line that took its place',
        first.caret.includes('detailsContent') && first.caret.includes('"Second"'), first.caret);
    check('and the blocks around the toggle are untouched',
        first.html.includes('<p>Above</p>') && first.html.includes('<p>Below</p>'), first.html);

    const second = await act(TWO_LINES, { caretOn: 'Second', run: deleteBlocks });
    check('on the second line it removes that line',
        second.html.includes('<p>First</p>') && !second.html.includes('Second'), second.html);
    check('and leaves the caret on the line above it',
        second.caret.includes('detailsContent') && second.caret.includes('"First"'), second.caret);

    // `detailsContent` is `block+`, so an emptied body has to take the toggle with
    // it. Before, this case could not arise: the toggle was already the target.
    const only = await act(ONE_LINE, { caretOn: 'Only', run: deleteBlocks });
    check('on the only line it takes the toggle with it',
        !only.html.includes('<summary') && !only.html.includes('Only')
        && only.html.includes('<p>Above</p><p>Below</p>'), only.html);

    const label = await act(ONE_LINE, { caretOn: 'Label', run: deleteBlocks });
    check('on the label it still removes the whole toggle',
        !label.html.includes('<summary') && label.html.includes('<p>Above</p><p>Below</p>'),
        label.html);
}

console.log('\n== the grip, which can only report the toggle ==');
{
    // The grip is the only affordance that targets a block, and it is drawn one per
    // toggle. So it is the path this bug was most reachable through.
    const inBody = await act(TWO_LINES, {
        caretOn: 'Second',
        handlePos: 'First',
        run: deleteBlocks,
    });
    check('grip on a toggle, caret in its body: the caret line is the target',
        inBody.html.includes('<p>First</p>') && !inBody.html.includes('Second')
        && inBody.html.includes('<summary>Label</summary>'), inBody.html);

    const onLabel = await act(ONE_LINE, {
        caretOn: 'Label',
        handlePos: 'Only',
        run: deleteBlocks,
    });
    check('grip on a toggle, caret on its label: the whole toggle is the target',
        !onLabel.html.includes('<summary') && onLabel.html.includes('<p>Above</p><p>Below</p>'),
        onLabel.html);

    // Caret elsewhere entirely: the grip is the only pointer, so it decides.
    const elsewhere = await act(
        `<p>Above</p><p>Carets here</p>${toggle('<p>First</p><p>Second</p>')}<p>Below</p>`,
        { caretOn: 'Carets here', handlePos: 'First', run: deleteBlocks },
    );
    check('grip on a toggle, caret outside it: the toggle is the target',
        !elsewhere.html.includes('<summary')
        && elsewhere.html.includes('<p>Above</p><p>Carets here</p><p>Below</p>'),
        elsewhere.html);
}

console.log('\n== a selection of several lines inside a toggle ==');
{
    const instance = await make(
        `<p>Above</p>${toggle('<p>First</p><p>Second</p><p>Third</p>')}<p>Below</p>`,
    );
    let first = -1;
    let third = -1;
    instance.state.doc.descendants((node, pos) => {
        if (node.textContent === 'First') first = pos;
        if (node.textContent === 'Third') third = pos;
    });
    instance.view.dispatch(
        instance.state.tr.setSelection(TextSelection.create(instance.state.doc, first + 1, third + 6)),
    );
    const target = resolveBlockTarget(instance, -1);
    check('three selected body lines are three blocks', target.blocks === 3, JSON.stringify(target));
    deleteBlocks(instance, target);
    // Emptying the body takes the toggle with it, whichever way it was emptied.
    const html = htmlOf(instance);
    check('and deleting them all takes the toggle too',
        !html.includes('<summary') && !html.includes('First') && !html.includes('Third'), html);
    check('and leaves the blocks around it alone',
        html.includes('<p>Above</p><p>Below</p>'), html);
    instance.destroy();
}

console.log('\n== Duplicate and Move, which had the same target ==');
{
    const copy = await act(TWO_LINES, { caretOn: 'First', run: duplicateBlocks });
    check('Duplicate on a body line copies that line',
        copy.html.includes('<p>First</p><p>First</p><p>Second</p>'), copy.html);
    check('and copies only one toggle', copy.html.split('<summary').length === 2, copy.html);

    const up = await act(TWO_LINES, {
        caretOn: 'Second',
        run: (instance, target) => moveBlocks(instance, target, -1),
    });
    check('Move up on a later body line swaps it with the one above',
        up.html.includes('<p>Second</p><p>First</p>'), up.html);
    check('and leaves the toggle where it was',
        up.html.includes('<p>Above</p><details') && up.html.includes('</details><p>Below</p>'),
        up.html);

    // At the ends of the body there is no sibling left to swap with, and the block
    // leaves the toggle -- the same place Backspace and Delete put it there.
    const outOfTop = await act(TWO_LINES, {
        caretOn: 'First',
        run: (instance, target) => moveBlocks(instance, target, -1),
    });
    check('Move up on the first body line lifts it out above the toggle',
        outOfTop.html.includes('<p>Above</p><p>First</p><details'), outOfTop.html);
    check('and keeps the rest of the body inside',
        outOfTop.html.includes('<p>Second</p>'), outOfTop.html);

    const outOfBottom = await act(TWO_LINES, {
        caretOn: 'Second',
        run: (instance, target) => moveBlocks(instance, target, 1),
    });
    check('Move down on the last body line lifts it out below the toggle',
        outOfBottom.html.includes('</details><p>Second</p>'), outOfBottom.html);

    const emptied = await act(ONE_LINE, {
        caretOn: 'Only',
        run: (instance, target) => moveBlocks(instance, target, -1),
    });
    check('moving the only body line out leaves the body its schema requires',
        /detailsContent"><p><\/p>/.test(emptied.html), emptied.html);
}

console.log('\n== top-level blocks are unchanged ==');
{
    const plain = await act('<p>Above</p><p>Target</p><p>Below</p>', {
        caretOn: 'Target',
        run: deleteBlocks,
    });
    check('Delete on a paragraph removes it',
        plain.html === '<p>Above</p><p>Below</p>', plain.html);

    // Backwards, because the caret has nowhere forward to go: the old answer was a
    // forward search from a position past the end of the document, which stepped
    // out of the toggle on the line the reader had just emptied.
    const last = await act('<p>Above</p><p>Target</p>', { caretOn: 'Target', run: deleteBlocks });
    check('Delete on the last block leaves the caret on the one above',
        last.html === '<p>Above</p>' && last.caret === 'doc/paragraph "Above"@5', last.caret);

    const noop = await act('<p>First</p><p>Second</p>', {
        caretOn: 'First',
        run: (instance, target) => moveBlocks(instance, target, -1),
    });
    check('Move up on the first block of the document does nothing',
        noop.html === '<p>First</p><p>Second</p>', noop.html);

    const swap = await act('<p>First</p><p>Second</p>', {
        caretOn: 'Second',
        run: (instance, target) => moveBlocks(instance, target, -1),
    });
    check('Move up on a later block swaps it with the one above',
        swap.html === '<p>Second</p><p>First</p>', swap.html);
}

console.log('\n== a list inside a body ==');
{
    // The list stays the unit, exactly as it was at the top level: its items are
    // not blocks this menu acts on individually.
    const content = `<p>Above</p>${toggle('<ul><li><p>Item</p></li></ul><p>Tail</p>')}<p>Below</p>`;
    const list = await act(content, { caretOn: 'Item', run: deleteBlocks });
    check('Delete on a list in a body removes the list',
        !list.html.includes('Item') && list.html.includes('<summary>Label</summary>'), list.html);
    check('and leaves the rest of the body',
        list.html.includes('<p>Tail</p>'), list.html);

    // Move up on the first block of a body lifts it out of the toggle, but only for
    // a textblock. A list is not one: it has its own rules about leaving a container,
    // and the keyboard leaves those to it -- Backspace inside a list in a body is the
    // list's keystroke, not the toggle's. So this is a no-op, and the document must be
    // byte-for-byte what it was.
    const before = await make(content);
    const untouched = htmlOf(before);
    before.destroy();

    const item = await act(content, {
        caretOn: 'Item',
        run: (instance, target) => moveBlocks(instance, target, -1),
    });
    check('Move up on a list in a body is left to the list, not lifted out',
        item.html === untouched, `${item.html}\n      was: ${untouched}`);
}

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);