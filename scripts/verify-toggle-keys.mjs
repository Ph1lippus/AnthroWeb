import { JSDOM } from 'jsdom';

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
globalThis.window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

/**
 * Makes `offsetParent` non-null everywhere, which jsdom otherwise never reports.
 *
 * `@tiptap/extension-details` decides whether a position is visible with
 * `element.offsetParent !== null`, and its `appendTransaction` plugin moves any
 * selection it believes is in a hidden body back out of the toggle. Under jsdom
 * every element reports a null `offsetParent`, so that plugin fires on every
 * keystroke inside a toggle and pulls the caret out to the next block in the
 * document -- which reads as "the delete sent the caret somewhere else".
 *
 * So without this, no assertion about where the caret lands inside a toggle can
 * mean anything: it is measuring the harness, not the handler. It is defined on
 * `Element.prototype` because `offsetParent` is a getter there with no setter.
 */
Object.defineProperty(dom.window.Element.prototype, 'offsetParent', {
    configurable: true,
    get() {
        return this.parentElement ?? dom.window.document.body;
    },
});

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const { Editor } = await import('@tiptap/core');
const { TextSelection } = await import('@tiptap/pm/state');
const StarterKit = (await import('@tiptap/starter-kit')).default;
const { DetailsContent, DetailsSummary } = await import('@tiptap/extension-details');
const { LiftToggleOnBackspace, ToggleDetails } = await import('../src/utils/noteToggle.ts');
const { resolveBlockTarget, deleteBlocks } = await import('../src/utils/noteBlockActions.ts');

// The `open` attribute is only parsed off a real `<details>` element; on a plain
// `div[data-type]` it is ignored and the toggle parses closed.
const T = inner =>
    '<details open data-type="details"><summary>Label</summary>' +
    `<div data-type="detailsContent">${inner}</div></details>`;

const strip = html => html
    .replace(/ class="note-toggle-summary"/g, '')
    .replace(/ class="note-toggle-content"/g, '');

/**
 * An editor with an open toggle in it, once the node view has drawn it.
 *
 * The wait is load-bearing and was the reason this bug survived a round of checks.
 * `addNodeView` unhides the body from a `setTimeout`, and until it runs the
 * extension's own `appendTransaction` moves any selection sitting in hidden content
 * back out of the toggle. Every keystroke dispatched in that first tick is
 * therefore answered by the toggle closing over the caret rather than by whatever
 * was supposed to handle it -- so the old behaviour asserted green against a toggle
 * whose body was never on screen.
 */
const opened = async content => {
    const instance = new Editor({
        element: dom.window.document.getElementById('editor'),
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
    const body = instance.view.dom.querySelector('[data-type="detailsContent"]');
    if (body?.hasAttribute('hidden')) {
        throw new Error('the toggle body is still hidden, so nothing here would be visible');
    }
    return instance;
};

const caretAt = (instance, text, into = 0) => {
    let at = -1;
    instance.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph' && node.textContent === text && at === -1) at = pos;
    });
    if (at === -1) throw new Error(`no line holding ${text}`);
    instance.view.dispatch(
        instance.state.tr.setSelection(TextSelection.create(instance.state.doc, at + 1 + into)),
    );
};

const where = instance => {
    const { $from } = instance.state.selection;
    const chain = [];
    for (let depth = 0; depth <= $from.depth; depth++) chain.push($from.node(depth).type.name);
    return `${chain.join('/')} "${$from.parent.textContent}"`;
};

/**
 * Presses a key through the real plugin chain, without TipTap replaying the steps.
 *
 * `editor.commands.keyboardShortcut` captures the transaction its handler produces
 * and then copies the captured steps onto its own `tr`, which it dispatches as a
 * *second* transaction -- and that copy carries the handler's original selection,
 * not the one the handler computed after mapping through the document change. The
 * result is a caret that lands where the handler would have put it before the edit,
 * which for a deletion inside a toggle is the block after the toggle. Every
 * keystroke therefore looks like "it jumped out of the toggle", whether or not the
 * handler did that.
 *
 * Dispatching the keydown to `handleKeyDown` is what the browser does, and it runs
 * exactly one transaction -- the handler's own -- so the resulting caret is the one
 * the handler asked for. `view.someProp` is how ProseMirror reaches the plugin
 * chain, and `keymap` is a `handleKeyDown` prop, so this is the same route a real
 * key press takes.
 */
const press = (instance, text, into, key) => {
    caretAt(instance, text, into);
    instance.view.someProp('handleKeyDown', handler => handler(
        instance.view,
        new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    ));
    return strip(instance.getHTML());
};

const TWO = `<p>Above</p>${T('<p>First</p><p>Second</p>')}<p>Below</p>`;
const ONE = `<p>Above</p>${T('<p>Only</p>')}<p>Below</p>`;
const THREE = `<p>Above</p>${T('<p>First</p><p>Second</p><p>Third</p>')}<p>Below</p>`;

console.log('\n== the toggle under test is real ==');
{
    const e = await opened(TWO);
    // `nodeAt`, not `getAttributes`: the latter answers for the block the caret is
    // in, which is not the toggle before the caret goes into it.
    const attrs = e.state.doc.descendants(node => node.type.name === 'details' ? node.attrs : null);
    let seen = null;
    e.state.doc.descendants(node => {
        if (node.type.name === 'details') seen = node.attrs;
    });
    check('the toggle parses as open', seen?.open === true, JSON.stringify(seen ?? attrs));
    caretAt(e, 'First');
    check('and the caret goes into its body',
        where(e) === 'doc/details/detailsContent/paragraph "First"', where(e));
    e.destroy();
}

console.log('\n== Backspace at the start of the first body line ==');
{
    // Was: the line was LIFTED out above the toggle. Nothing deleted, the block
    // moved, the caret went with it -- "it jumps to the line above the toggle".
    const e = await opened(TWO);
    const html = press(e, 'First', 0, 'Backspace');
    check('it removes the line', !html.includes('First'), html);
    check('leaves the toggle and its label where they were',
        html.startsWith('<p>Above</p><details') && html.includes('<summary>Label</summary>')
        && html.endsWith('</details><p>Below</p>'), html);
    check('and the rest of the body inside',
        html.includes('<p>Second</p>') && html.indexOf('Second') < html.indexOf('</details>'), html);
    check('and the caret on the line that took its place',
        where(e) === 'doc/details/detailsContent/paragraph "Second"', where(e));
    e.destroy();
}

console.log('\n== Backspace on the only body line ==');
{
    // Was: a blank paragraph was pushed in to satisfy `block+`, so the line
    // survived inside an open toggle and the keystroke looked swallowed.
    const e = await opened(ONE);
    const html = press(e, 'Only', 0, 'Backspace');
    check('it takes the toggle with the line',
        !html.includes('<details') && !html.includes('Only')
        && html === '<p>Above</p><p>Below</p>', html);
    check('and the caret lands on a block that exists',
        where(e) === 'doc/paragraph "Below"', where(e));
    e.destroy();
}

console.log('\n== Delete at the end of the last body line ==');
{
    // Was: lifted out BELOW the toggle. The same mistake as Backspace, mirrored --
    // and the far end of the body has its own case, because the body there is both
    // the last block and the first.
    const e = await opened(TWO);
    const html = press(e, 'Second', 6, 'Delete');
    check('it removes the line', !html.includes('Second'), html);
    check('leaves the toggle and its label where they were',
        html.startsWith('<p>Above</p><details') && html.includes('<summary>Label</summary>')
        && html.endsWith('</details><p>Below</p>'), html);
    check('and the caret is on the line that remains',
        where(e) === 'doc/details/detailsContent/paragraph "First"', where(e));
    e.destroy();

    const only = await opened(ONE);
    const html2 = press(only, 'Only', 4, 'Delete');
    check('on the only body line it takes the toggle too',
        !html2.includes('<details') && !html2.includes('Only')
        && html2 === '<p>Above</p><p>Below</p>', html2);
    only.destroy();
}

console.log('\n== the middle of a body is left to ProseMirror ==');
{
    // Neither key claims these positions. Backspace one character into a body line,
    // or forward-delete inside one, is ordinary editing and has to behave exactly as
    // it does at the top level -- if these handlers reached in here, they would
    // delete a whole block for a keystroke aimed at one character.
    //
    // These assert that the document is *unchanged*, which is the strong claim
    // available here: ProseMirror's own `joinForward` cannot merge across an
    // isolating `<details>`, so a real character delete arrives as a plain
    // `tr.delete` from the browser's own editing rather than from a command, and
    // jsdom has no browser editing to produce it. What matters is that nothing we
    // wrote fires -- a block-level handler here would show up as a removed line.
    const mid = await opened(TWO);
    const midHtml = press(mid, 'First', 2, 'Delete');
    check('Delete inside a body line leaves the toggle alone',
        midHtml.includes('<p>First</p>') && midHtml.includes('<p>Second</p>')
        && midHtml.includes('<summary>Label</summary>'), midHtml);
    mid.destroy();

    const inFrom = await opened(TWO);
    const inFromHtml = press(inFrom, 'First', 1, 'Backspace');
    check('Backspace one character into a body line deletes nothing structural',
        inFromHtml.includes('<p>First</p>') && inFromHtml.includes('<p>Second</p>')
        && inFromHtml.includes('<summary>Label</summary>'), inFromHtml);
    inFrom.destroy();

    // A later line, at its very start: ProseMirror's own merge, which it can do
    // inside the body because both blocks share a parent.
    const merge = await opened(TWO);
    const mergeHtml = press(merge, 'Second', 0, 'Backspace');
    check('Backspace at the start of a later body line merges upward',
        mergeHtml.includes('<p>FirstSecond</p>') && mergeHtml.includes('<summary>Label</summary>'),
        mergeHtml);
    check('and the caret ends up in the line it merged into',
        where(merge) === 'doc/details/detailsContent/paragraph "FirstSecond"', where(merge));
    merge.destroy();

    const deeper = await opened(THREE);
    const deeperHtml = press(deeper, 'Second', 0, 'Backspace');
    check('a middle body line merges into the one above it, and the rest stays put',
        deeperHtml.includes('<p>FirstSecond</p>') && deeperHtml.includes('<p>Third</p>')
        && deeperHtml.includes('<summary>Label</summary>'), deeperHtml);
    deeper.destroy();
}

console.log('\n== a list inside a body is left to the list ==');
{
    const content = `<p>Above</p>${T('<ul><li><p>Item</p></li></ul><p>Tail</p>')}<p>Below</p>`;
    const e = await opened(content);
    const html = strip(press(e, 'Item', 0, 'Backspace'));
    check('Backspace in a list in a body does not delete it',
        html.includes('<p>Item</p>'), html);

    // The same at the far end of the body, and through Delete rather than Backspace.
    const two = await opened(
        `<p>Above</p>${T('<p>Tail</p><ul><li><p>Item</p></li></ul>')}<p>Below</p>`,
    );
    const html2 = strip(press(two, 'Item', 4, 'Delete'));
    check('and neither does Delete at the end of one',
        html2.includes('<p>Item</p>') && html2.includes('<summary>Label</summary>'), html2);

    // And the block menu agrees: a list in a body is one block, so its Delete takes
    // the whole list rather than one item. The caret has to be in the list for that
    // -- the menu resolves against the caret when it was opened without a grip.
    const menu = await opened(content);
    caretAt(menu, 'Item');
    const target = resolveBlockTarget(menu, -1);
    check('its target is the list, not the item or the toggle',
        target.blocks === 1, JSON.stringify(target));
    deleteBlocks(menu, target);
    const html3 = strip(menu.getHTML());
    check('and Delete takes the whole list, as it does at the top level',
        !html3.includes('Item') && html3.includes('<p>Tail</p>')
        && html3.includes('<summary>Label</summary>'), html3);

    e.destroy();
    two.destroy();
    menu.destroy();
}

console.log('\n== the block menu agrees with the keys ==');
{
    const e = await opened(TWO);
    caretAt(e, 'First');
    const t = resolveBlockTarget(e, -1);
    check('its target is the one line', t.blocks === 1, JSON.stringify(t));
    deleteBlocks(e, t);
    const html = strip(e.getHTML());
    check('and Delete removes that line and nothing else',
        !html.includes('First') && html.includes('<p>Second</p>')
        && html.includes('<summary>Label</summary>'), html);
    check('leaving the caret where the keys would',
        where(e) === 'doc/details/detailsContent/paragraph "Second"', where(e));
    e.destroy();
}

console.log(fail === 0 ? `\nALL PASS: ${pass}` : `\n${fail} FAILED of ${pass + fail}`);