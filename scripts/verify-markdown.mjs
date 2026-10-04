/**
 * Verifies the markdown converter against what the editor's schema will accept.
 *
 * `noteMarkdown.ts` is the only thing standing between a page an assistant wrote
 * and one long paragraph, so it is checked from both ends:
 *
 *  - `looksLikeMarkdown` decides whether to convert at all, and it runs on every
 *    paste. The negative cases matter more than the positive ones: a converter
 *    that is willing to try ordinary prose will sooner or later eat a sentence
 *    that happened to contain a dash.
 *
 *  - `markdownToEditorHtml` emits HTML that is parsed by the schema rather than
 *    rendered, so the assertions check the shapes the *parser* matches on. That
 *    is not the same as what is saved: the task item's renderer writes
 *    `data-type="taskItem"`, and the task list's parser requires it. This bug has
 *    already been made once, by styling to `renderHTML` instead.
 *
 * Pure functions, so this runs in CI without a browser. What it cannot check --
 * that the resulting nodes behave, that a pasted table really renders with a
 * header row -- was checked against a live editor before shipping, and the
 * selectors the output relies on are asserted against the node views' real DOM by
 * `verify-editor-dom`.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// The converter is TypeScript, so it is compiled rather than regexed. Stripping
// types with a pattern is how a test starts failing on a formatting change
// instead of on a behaviour change; `transpileModule` is exact, and TypeScript is
// already here because the build uses it.
const source = readFileSync(
    new URL('../src/utils/noteMarkdown.ts', import.meta.url),
    'utf8',
);
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
    },
}).outputText;

// The module has no imports, so it can be evaluated directly once compiled.
let looksLikeMarkdown;
let markdownToEditorHtml;
try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
    ({ looksLikeMarkdown, markdownToEditorHtml } = module);
} catch (error) {
    console.log(` FAIL  the converter could not be loaded: ${error.message}`);
    process.exit(1);
}

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
const eq = (name, actual, expected) =>
    check(name, actual === expected, `got ${JSON.stringify(actual)}`);

/* ------------------------------------------------------------------ *
 * Should this be converted at all?
 * ------------------------------------------------------------------ */

// -- converted ------------------------------------------------------------
const CONVERTED = [
    ['a heading', '## Heading'],
    ['a single to-do', '- [ ] Buy milk'],
    ['two bullets', '- one\n- two'],
    ['a numbered list', '1. one\n2. two'],
    ['a table', '| a | b |\n| --- | --- |\n| 1 | 2 |'],
    ['a code fence', '```js\nconst a = 1;\n```'],
    ['a blockquote', '> quoted'],
    ['a thematic break', '---'],
    ['a nested list', '- one\n  - two'],
    ['an indented to-do', '  - [x] done'],
];
for (const [name, text] of CONVERTED) {
    check(`detects ${name}`, looksLikeMarkdown(text) === true);
}

// -- left alone -----------------------------------------------------------
const LEFT_ALONE = [
    ['empty text', ''],
    ['whitespace only', '   \n\n  '],
    ['an ordinary sentence', 'Just a normal sentence with no structure at all.'],
    // The important one: a single dash is punctuation, not a list.
    ['a lone dash', 'Well - I suppose that is one way to put it.'],
    ['a lone asterisk', 'Rate this 5 * 5 = good.'],
    ['an underscored identifier', 'The value of some_variable_name is 3.'],
    ['a lone asterisk pair', '2 * 3 * 4'],
    ['a URL', 'See https://example.com/docs for details.'],
    ['a numbered sentence', 'The year 2023. Something happened.'],
    ['a heading without a space', '#hashtag'],
    ['asterisks mid-sentence', 'She said *nothing* at all.'],
    ['a single bullet-like line', '- just this'],
];
for (const [name, text] of LEFT_ALONE) {
    check(`leaves ${name} alone`, looksLikeMarkdown(text) === false);
}

/* ------------------------------------------------------------------ *
 * The HTML it emits
 * ------------------------------------------------------------------ */

const CONVERSIONS = [
    [
        'headings',
        '# One\n## Two\n### Three\n#### Four',
        '<h1>One</h1><h2>Two</h2><h3>Three</h3><h3>Four</h3>',
        // Levels past three are clamped, not dropped: the schema has no h4.
        'a heading past level 3 is clamped',
    ],
    [
        'to-dos carry the attributes the parser needs',
        '- [ ] one\n- [x] two',
        '<ul data-type="taskList">' +
            '<li data-type="taskItem" data-checked="false">' +
            '<label><input type="checkbox"><span></span></label>' +
            '<div><p>one</p></div></li>' +
            '<li data-type="taskItem" data-checked="true">' +
            '<label><input type="checkbox"><span></span></label>' +
            '<div><p>two</p></div></li>' +
            '</ul>',
    ],
    [
        'bullets',
        '- one\n- two',
        '<ul><li><p>one</p></li><li><p>two</p></li></ul>',
    ],
    [
        'ordered lists',
        '1. one\n2. two',
        '<ol><li><p>one</p></li><li><p>two</p></li></ol>',
    ],
    [
        'a nested bullet sits inside the item above it',
        '- one\n  - nested',
        '<ul><li><p>one</p><ul><li><p>nested</p></li></ul></li></ul>',
    ],
    [
        'a table',
        '| a | b |\n| --- | --- |\n| 1 | 2 |',
        // Plain markup: `table`, `tr`, and a `th` for the header row. No data-type,
        // because the table node matches the tag and `th` is what marks the header.
        '<table><tbody><tr><th><p>a</p></th><th><p>b</p></th></tr>' +
            '<tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
    ],
    [
        'a fenced code block keeps its language and its contents',
        '```ts\nconst a = 1;\n```',
        '<pre><code class="language-ts">const a = 1;</code></pre>',
    ],
    [
        'a thematic break',
        '---',
        '<hr>',
    ],
    [
        'a blockquote',
        '> quoted',
        '<blockquote><p>quoted</p></blockquote>',
    ],
    [
        'a paragraph between blocks',
        'before\n\n## Heading\n\nafter',
        '<p>before</p><h2>Heading</h2><p>after</p>',
    ],
];

for (const [name, input, expected] of CONVERSIONS) {
    eq(`converts ${name}`, markdownToEditorHtml(input), expected);
}

// -- the awkward cases ----------------------------------------------------

// A loose list is one list. Flushing on the blank line would emit two.
eq(
    'a loose list stays one list',
    markdownToEditorHtml('- one\n\n- two'),
    '<ul><li><p>one</p></li><li><p>two</p></li></ul>',
);

// Markdown cannot mix checkboxes and plain bullets in one list, so each run gets
// its own wrapper -- otherwise the plain rows would end up inside the task list.
eq(
    'a bullet followed by a to-do is two lists',
    markdownToEditorHtml('- plain\n- [ ] task'),
    '<ul><li><p>plain</p></li></ul>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">' +
        '<label><input type="checkbox"><span></span></label>' +
        '<div><p>task</p></div></li></ul>',
);

// A `#` inside a fence is a comment, not a heading.
eq(
    'a heading inside a code fence stays code',
    markdownToEditorHtml('```\n# not a heading\n```'),
    '<pre><code># not a heading</code></pre>',
);

// Marks that turn out to be literal must survive as literal.
eq(
    'an unmatched asterisk is literal',
    markdownToEditorHtml('a \\* b'),
    '<p>a * b</p>',
);
eq(
    'an unmatched double asterisk is literal',
    markdownToEditorHtml('2 ** 3 = 8'),
    '<p>2 ** 3 = 8</p>',
);

// Escaping: the output is parsed, so a `<` in the source must not become a tag.
eq(
    'a tag in the source is escaped',
    markdownToEditorHtml('<script>alert(1)</script>'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
);
eq(
    'a javascript: link is neutralised',
    markdownToEditorHtml('[click](javascript:alert(1))'),
    '<p><a href="#">click</a></p>',
);

// Inline marks.
eq('bold', markdownToEditorHtml('**strong**'), '<p><strong>strong</strong></p>');
eq('italic', markdownToEditorHtml('*em*'), '<p><em>em</em></p>');
eq('strike', markdownToEditorHtml('~~gone~~'), '<p><s>gone</s></p>');
eq('inline code', markdownToEditorHtml('`x`'), '<p><code>x</code></p>');
eq('a link', markdownToEditorHtml('[text](https://example.com)'),
    '<p><a href="https://example.com">text</a></p>');
eq('an underscore inside a word is not emphasis',
    markdownToEditorHtml('some_variable_name'), '<p>some_variable_name</p>');
eq('markup inside code is literal', markdownToEditorHtml('`**not bold**`'),
    '<p><code>**not bold**</code></p>');

// Nothing to convert.
eq('nothing to convert', markdownToEditorHtml('just words'), '<p>just words</p>');

/* ------------------------------------------------------------------ *
 * The markup the schema will actually be asked to parse
 * ------------------------------------------------------------------ */

// Asserted against the attributes the *parser* matches. If a converter ever
// emits markup the schema ignores, the text arrives with its structure flattened
// again -- which is the bug this whole path exists to fix.
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
const taskMarkup = markdownToEditorHtml('- [ ] Buy milk');
check(
    'to-do markup keeps the data-type the task item parser needs',
    rules.includes("ul[data-type='taskList'] > li") &&
        taskMarkup.includes('data-type="taskItem"'),
    'the stylesheet is scoped to the parent <ul>, so the item must carry the type too',
);
check(
    'to-do markup keeps the checkbox wrapper the node view renders',
    taskMarkup.includes('<label><input type="checkbox">'),
);

console.log(
    fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`,
);
process.exit(fail === 0 ? 0 : 1);