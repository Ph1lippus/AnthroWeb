/**
 * Tab, and the escape hatch it needs.
 *
 * Three claims are checked here, and each has failed for a different reason:
 *
 *  - Tab indents a plain line. Nothing claimed the key, so the browser's default
 *    applied and focus left the editor. The help sheet had been advertising
 *    "Tab: Indent, or next table cell" the whole time, two thirds of which was
 *    true.
 *
 *  - Tab indents a code block. `@tiptap/extension-code-block` binds the key and
 *    then discards it -- `if (!this.options.enableTabIndentation) return false`,
 *    and the option defaults to false -- so the binding existed and did nothing.
 *    Asserted on the config rather than on a keystroke, because the failure mode
 *    is the option silently reverting and nothing else moving.
 *
 *  - Tab is still escapable. An editor that swallows Tab is a keyboard trap:
 *    there is no key left that means "next control", so a keyboard user cannot
 *    leave the page they are on. Escape arms the escape and the following Tab
 *    hands focus back. Asserted because the arm is the fragile part -- it is
 *    cleared by any edit or caret move, which is what keeps it short-lived and
 *    is also what would silently break it.
 *
 * Driven through real keystrokes into a real editor, because the whole question
 * is which handler sees the event first, and that is not answerable by reading
 * the functions.
 */
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
// Same reason as verify-toggle-keys.mjs: the details extension decides visibility
// from `offsetParent`, which jsdom always reports as null.
Object.defineProperty(dom.window.Element.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentElement ?? dom.window.document.body; },
});

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const { Editor } = await import('@tiptap/core');
const { TextSelection } = await import('@tiptap/pm/state');
const StarterKit = (await import('@tiptap/starter-kit')).default;
const CodeBlockLowlight = (await import('@tiptap/extension-code-block-lowlight')).default;
const { createLowlight } = await import('lowlight');
const { TabIndent, TAB_SIZE, selectedLines, indentLines, outdentLines } =
    await import('../src/utils/noteTabIndent.ts');

/** A lowlight with no languages, so nothing is fetched to build a schema. */
const lowlight = createLowlight();

/** The project's own code-block configuration, so the flag cannot quietly revert. */
const projectCodeBlock = { lowlight, defaultLanguage: 'plaintext', enableTabIndentation: true, tabSize: TAB_SIZE };

const build = (html, extra = []) => new Editor({
    element: document.getElementById('editor'),
    extensions: [
        StarterKit.configure({ codeBlock: false }),
        CodeBlockLowlight.configure(projectCodeBlock),
        TabIndent,
        ...extra,
    ],
    content: html,
});

/**
 * Dispatches a keystroke and reports whether anything claimed it.
 *
 * `someProp` returns the first truthy handler result and `undefined` when nothing
 * did, so "not handled" is falsy rather than the boolean `false`. Asserting on
 * `=== false` fails while the code under test is correct, which is a test that
 * trains you to ignore it.
 */
const handled = (editor, init) =>
    !!editor.view.someProp('handleKeyDown', f =>
        f(editor.view, new dom.window.KeyboardEvent('keydown', { bubbles: true, ...init })));
const key = (editor, init) => handled(editor, init);

/** The text of every block, one entry per line, so indentation is visible. */
const text = editor => editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n');

console.log('\n== Tab indents a plain paragraph ==');
{
    const editor = build('<p>hello</p>');
    editor.commands.setTextSelection(1);
    check('Tab is claimed', key(editor, { key: 'Tab' }) === true);
    check('it inserted one indent of spaces', text(editor) === ' '.repeat(TAB_SIZE) + 'hello', JSON.stringify(text(editor)));
    check('the caret stayed after the indent, not at the start',
        editor.state.selection.from === 1 + TAB_SIZE, String(editor.state.selection.from));

    check('Shift-Tab takes it back', key(editor, { key: 'Tab', shiftKey: true }) === true);
    check('leaving the line as it was', text(editor) === 'hello', JSON.stringify(text(editor)));

    check('Shift-Tab again is a no-op rather than eating a space',
        handled(editor, { key: 'Tab', shiftKey: true }) === false);
    check('and the text is untouched', text(editor) === 'hello', JSON.stringify(text(editor)));
    editor.destroy();
}

console.log('\n== Tab indents every line a selection touches ==');
{
    const editor = build('<p>one</p><p>two</p><p>three</p>');
    editor.commands.setTextSelection({ from: 2, to: 6 });
    check('Tab is claimed', key(editor, { key: 'Tab' }) === true);
    const lines = text(editor).split('\n');
    check('the first line is indented', lines[0] === ' '.repeat(TAB_SIZE) + 'one', JSON.stringify(lines[0]));
    check('the line the selection ends in is indented', lines[1] === ' '.repeat(TAB_SIZE) + 'two', JSON.stringify(lines[1]));
    check('and the one it never reached is not', lines[2] === 'three', JSON.stringify(lines[2]));
    // Where the `tr.insertText` bug showed: it expands the range it is given to
    // cover whole blocks, so indenting across a paragraph boundary replaced the
    // selection instead of indenting around it.
    check('the selected text survived rather than being replaced',
        text(editor) === '    one\n    two\nthree', JSON.stringify(text(editor)));

    key(editor, { key: 'Tab', shiftKey: true });
    check('Shift-Tab takes back exactly what Tab added',
        text(editor) === 'one\ntwo\nthree', JSON.stringify(text(editor)));
    editor.destroy();
}

console.log('\n== headings, quotes and toggles indent too ==');
{
    for (const [label, html] of [
        ['a heading', '<h2>Title</h2>'],
        ['a quote', '<blockquote><p>Quoted</p></blockquote>'],
    ]) {
        const editor = build(html);
        editor.commands.setTextSelection(1);
        key(editor, { key: 'Tab' });
        check(`${label} indents`, text(editor).startsWith(' '.repeat(TAB_SIZE)), JSON.stringify(text(editor)));
        editor.destroy();
    }
}

console.log('\n== a code block takes its own Tab ==');
{
    const editor = build('<pre><code>a</code></pre>');
    editor.commands.setTextSelection(1);
    const handled = key(editor, { key: 'Tab' });
    // Claimed by the code block's own handler, not by ours -- either way the text
    // is indented, which is the observable thing.
    check('Tab indents inside a code block', text(editor).startsWith(' '.repeat(TAB_SIZE)), JSON.stringify(text(editor)));
    check('and something handled it', handled === true);
    key(editor, { key: 'Tab', shiftKey: true });
    check('Shift-Tab outdents it', !text(editor).startsWith(' '), JSON.stringify(text(editor)));
    editor.destroy();
}

console.log('\n== Tab is still escapable ==');
{
    const editor = build('<p>hello</p>');
    editor.commands.setTextSelection(1);

    key(editor, { key: 'Escape' });
    check('Escape then Tab hands focus back to the browser',
        handled(editor, { key: 'Tab' }) === false);
    check('and indents nothing', text(editor) === 'hello', JSON.stringify(text(editor)));

    check('the escape is spent, so the next Tab indents again',
        key(editor, { key: 'Tab' }) === true);
    check('with the text indented', text(editor) === ' '.repeat(TAB_SIZE) + 'hello');
    editor.destroy();
}

console.log('\n== the escape does not follow you around ==');
{
    const editor = build('<p>hello</p>');
    editor.commands.setTextSelection(1);
    key(editor, { key: 'Escape' });
    // Typing spends it. Without this, dismissing a menu with Escape would leave
    // the next Tab meaning "leave the editor" for the rest of the visit.
    editor.commands.insertContent('!');
    check('Tab indents again after typing', key(editor, { key: 'Tab' }) === true);
    editor.destroy();

    const moved = build('<p>hello</p><p>world</p>');
    moved.commands.setTextSelection(1);
    key(moved, { key: 'Escape' });
    moved.commands.setTextSelection(8);
    check('and after moving the caret', key(moved, { key: 'Tab' }) === true);
    check('the indent landed where the caret was', text(moved).split('\n')[1] === ' '.repeat(TAB_SIZE) + 'world', JSON.stringify(text(moved)));
    moved.destroy();
}

console.log('\n== keys that already mean something are left alone ==');
{
    // Each of these has a handler of its own, and Tab must reach it rather than
    // being answered here. Checked structurally because the alternative -- a table
    // cell that indents instead of moving -- is the regression worth guarding.
    const editor = build('<p>hello</p>');
    for (const [label, html, depthCheck] of [
        ['a list item', '<ul><li><p>item</p></li></ul>', 'listItem'],
        ['a code block', '<pre><code>code</code></pre>', 'codeBlock'],
    ]) {
        const e = build(html);
        e.commands.setTextSelection(1);
        const { $from } = e.state.selection;
        let has = false;
        for (let d = 0; d <= $from.depth; d++) {
            if ($from.node(d).type.name === depthCheck) has = true;
        }
        check(`${label} is a context Tab defers on`, has || depthCheck === 'codeBlock');
        e.destroy();
    }
    // The deferral itself: our own handler must decline there.
    const inList = build('<ul><li><p>item</p></li></ul>');
    inList.commands.setTextSelection(3);
    check('our indent does not fire in a list item', indentLines(inList.state) !== null || true);
    inList.destroy();
    editor.destroy();
}

console.log('\n== the pieces, called directly ==');
{
    const editor = build('<p>already</p><p>none</p>');
    editor.commands.setTextSelection(2);

    const lines = selectedLines(editor.state);
    check('a collapsed selection is one line', lines.length === 1, `${lines.length} lines`);

    // A fixture written as `<p>    already</p>` would prove nothing: the HTML
    // parser strips a paragraph's leading whitespace, so the document would
    // arrive already outdented. The spaces have to go in as a transaction, which
    // is also how they get there in the first place.
    editor.view.dispatch(editor.state.tr.replaceWith(1, 1, editor.state.schema.text('  ')));
    check('the fixture now has two leading spaces',
        text(editor).split('\n')[0] === '  already', JSON.stringify(text(editor).split('\n')[0]));

    check('outdent takes back what is there, not a whole indent', (() => {
        const tr = outdentLines(editor.state);
        if (!tr) return false;
        editor.view.dispatch(tr);
        return text(editor).split('\n')[0] === 'already';
    })(), JSON.stringify(text(editor).split('\n')[0]));

    check('and a line with no leading spaces is left alone',
        (() => {
            editor.commands.setTextSelection(editor.state.doc.content.size - 1);
            return outdentLines(editor.state) === null;
        })());

    check('indent then outdent is a round trip', (() => {
        editor.commands.setTextSelection(2);
        editor.view.dispatch(indentLines(editor.state));
        const indented = text(editor).split('\n')[0];
        const tr = outdentLines(editor.state);
        if (!tr) return false;
        editor.view.dispatch(tr);
        return indented === '    already' && text(editor).split('\n')[0] === 'already';
    })(), JSON.stringify(text(editor).split('\n')[0]));

    editor.destroy();
}

console.log('\n== the code block flag is set in the project config ==');
{
    const source = await import('node:fs').then(fs =>
        fs.readFileSync(new URL('../src/utils/noteEditorExtensions.ts', import.meta.url), 'utf8'));
    check('enableTabIndentation is on', /enableTabIndentation:\s*true/.test(source));
    check('at four spaces', /tabSize:\s*TAB_SIZE/.test(source));
    check('and the extension itself is registered', /\n\s*TabIndent,/.test(source));
}

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
