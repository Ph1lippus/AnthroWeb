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
    markTarget,
    moveBlocks,
    overTarget,
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

console.log('\n== a mark command hands the selection back as it was ==');
{
    // The reported bug: select, deselect, select something else, and the new
    // selection grows out of the old one. `overTarget` is the only code in the app
    // that reads a selection, puts a different one in place for the length of a
    // command, and puts one back -- so it is where a selection can be restored
    // wrongly. `from`/`to` cannot express which end the pointer went down on, and a
    // selection rebuilt from them is always forwards.
    const instance = await make('<p>First</p><p>Second</p><p>Third</p>');
    let first = -1;
    let second = -1;
    instance.state.doc.descendants((node, pos) => {
        if (node.textContent === 'First') first = pos;
        if (node.textContent === 'Second') second = pos;
    });
    // Backwards: dragged right to left across "First" and "Second", so $anchor is
    // the *later* of the two ends.
    instance.view.dispatch(
        instance.state.tr.setSelection(TextSelection.create(instance.state.doc, second + 1, first + 1)),
    );
    const backwards = instance.state.selection;
    check('the selection starts out backwards',
        backwards.$anchor.pos > backwards.$head.pos,
        `anchor ${backwards.$anchor.pos}, head ${backwards.$head.pos}`);

    const target = resolveBlockTarget(instance, -1);
    overTarget(instance, target, () => {});
    const after = instance.state.selection;
    check('and is still backwards afterwards',
        after.$anchor.pos > after.$head.pos,
        `anchor ${after.$anchor.pos}, head ${after.$head.pos}`);
    check('over the same two ends',
        after.from === backwards.from && after.to === backwards.to,
        `${after.from}-${after.to}, was ${backwards.from}-${backwards.to}`);

    // The same command on a forwards selection must not tip it the other way.
    instance.view.dispatch(
        instance.state.tr.setSelection(TextSelection.create(instance.state.doc, first + 1, second + 1)),
    );
    const forwards = instance.state.selection;
    overTarget(instance, resolveBlockTarget(instance, -1), () => {});
    const stillForwards = instance.state.selection;
    check('a forwards selection stays forwards',
        stillForwards.$anchor.pos < stillForwards.$head.pos,
        `anchor ${stillForwards.$anchor.pos}, head ${stillForwards.$head.pos}`);
    check('over the same two ends',
        stillForwards.from === forwards.from && stillForwards.to === forwards.to,
        `${stillForwards.from}-${stillForwards.to}, was ${forwards.from}-${forwards.to}`);

    // A collapsed caret has no direction to lose, and the mark strip is offered on a
    // bare caret too -- so a caret has to come back as a caret.
    instance.commands.setTextSelection(first + 1);
    overTarget(instance, resolveBlockTarget(instance, -1), () => {});
    check('a caret comes back as a caret',
        instance.state.selection.empty && instance.state.selection.from === first + 1,
        `${instance.state.selection.from}, was ${first + 1}`);
    instance.destroy();
}

console.log('\n== a mark acts on the selection, not on the block ==');
{
    // The reported bug, and the reason `markTarget` exists.
    //
    // `resolveBlockTarget` is block-aligned on purpose: it is what makes Delete
    // from a grip three lines into a paragraph take the paragraph. Every action in
    // the block menu used that range, including the inline marks -- so selecting
    // two words in a long paragraph and pressing Italic italicised the whole
    // paragraph, and selecting across three paragraphs italicised all three.

    /**
     * The document range covering `needle` inside the block whose text is `text`.
     *
     * Worked out from the document rather than written down as a number. Hand-
     * counted positions across a three-paragraph document are how this test ends
     * up asserting the wrong range and passing for the wrong reason.
     */
    const spanOf = (instance, text, needle) => {
        let blockPos = -1;
        let content = '';
        instance.state.doc.descendants((node, pos) => {
            if (node.isTextblock && node.textContent === text) {
                blockPos = pos;
                content = node.textContent;
            }
        });
        if (blockPos < 0) throw new Error(`no block holding ${JSON.stringify(text)}`);
        const offset = content.indexOf(needle);
        if (offset < 0) throw new Error(`${JSON.stringify(text)} does not hold ${JSON.stringify(needle)}`);
        // A paragraph's own text starts one position after the paragraph.
        return { from: blockPos + 1 + offset, to: blockPos + 1 + offset + needle.length };
    };

    const instance = await make('<p>The quick brown fox jumps over the lazy dog</p>');

    // "brown" alone: a partial selection inside one block.
    const { from, to } = spanOf(instance, 'The quick brown fox jumps over the lazy dog', 'brown');
    instance.view.dispatch(
        instance.state.tr.setSelection(TextSelection.create(instance.state.doc, from, to)),
    );

    const block = resolveBlockTarget(instance, -1);
    check('the block target is still the whole paragraph',
        block.blocks === 1 && block.from < from && block.to > to, JSON.stringify(block));

    const marks = markTarget(instance, block, 'selection');
    check('and the mark target is just the selection',
        marks.from === from && marks.to === to, JSON.stringify(marks));

    overTarget(instance, marks, () => instance.chain().focus().toggleMark('italic').run());
    check('Italic marks the word and nothing else',
        instance.getHTML() === '<p>The quick <em>brown</em> fox jumps over the lazy dog</p>',
        instance.getHTML());
    check('and leaves the selection where it was',
        instance.state.selection.from === from && instance.state.selection.to === to,
        `${instance.state.selection.from}-${instance.state.selection.to}`);

    // A selection spanning several paragraphs is one range, and it is the range
    // the reader highlighted. It was previously widened to whole blocks, which at
    // either end meant words they had not selected becoming styled.
    const wide = await make('<p>First line of one</p><p>Second line of two</p><p>Third line</p>');
    // From "line" in the first paragraph to "Third" in the third: deliberately not
    // aligned to any block edge, so a widened range could not produce this.
    const start = spanOf(wide, 'First line of one', 'line');
    const end = spanOf(wide, 'Third line', 'Third');
    wide.commands.setTextSelection({ from: start.from, to: end.to });

    const wideBlock = resolveBlockTarget(wide, -1);
    check('three selected lines are still three blocks', wideBlock.blocks === 3, JSON.stringify(wideBlock));
    const wideMarks = markTarget(wide, wideBlock, 'selection');
    check('and the mark target is exactly the selection, not the block edges',
        wideMarks.from === start.from && wideMarks.to === end.to, JSON.stringify(wideMarks));
    overTarget(wide, wideMarks, () => wide.chain().focus().toggleMark('italic').run());
    const wideHtml = wide.getHTML();
    check('the ends of the selection are not padded out to their blocks',
        wideHtml === '<p>First <em>line of one</em></p>'
            + '<p><em>Second line of two</em></p>'
            + '<p><em>Third</em> line</p>',
        wideHtml);
    wide.destroy();

    // A collapsed caret has no selection to narrow to, so the block stays the unit
    // -- which is right, because a mark on a caret is a pending mark and the next
    // character typed comes out styled.
    instance.commands.setTextSelection(from);
    const caretMarks = markTarget(instance, resolveBlockTarget(instance, -1), 'selection');
    check('a collapsed caret falls back to the block',
        caretMarks.from === block.from && caretMarks.to === block.to, JSON.stringify(caretMarks));

    // The other entry point, and the reason `markTarget` takes `source`. Clicking
    // a button outside the editor does not collapse the selection, so a grip can be
    // clicked while a selection sits elsewhere in the document. Marking *that*
    // would be a worse bug than the block-wide one being fixed here.
    instance.view.dispatch(
        instance.state.tr.setSelection(TextSelection.create(instance.state.doc, from, to)),
    );
    const grip = resolveBlockTarget(instance, 0);
    check('the grip resolves the block under it, not the selection',
        grip.blocks === 1 && grip.from === 0 && grip.to === 45, JSON.stringify(grip));
    check('and a handle menu marks that block rather than the stale selection',
        (() => {
            const overHandle = markTarget(instance, grip, 'handle');
            return overHandle.from === 0 && overHandle.to === 45;
        })(), JSON.stringify(markTarget(instance, grip, 'handle')));

    instance.destroy();
}

console.log(`\n${fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`}`);
process.exit(fail === 0 ? 0 : 1);