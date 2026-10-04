/**
 * Checks the editor's CSS against the DOM TipTap's node views actually build.
 *
 * Both of these were broken the same way, and both looked fine in the editor's
 * saved HTML:
 *
 *   - `@tiptap/extension-details` renders `div > button + div > (summary + div)`.
 *     It does NOT render a native `<details>/<summary>`, so every rule written as
 *     `details.note-toggle > summary` matched nothing and a toggle arrived as a
 *     bare unstyled button in front of its text.
 *
 *   - `@tiptap/extension-list`'s TaskItem node view builds the `<li>` by hand and
 *     sets only `data-checked`. `data-type="taskItem"` appears in `renderHTML`, so
 *     it is in the saved HTML and it is what the export and the load-time
 *     migration match on -- but it is not on the element in the page. Every rule
 *     scoped to `li[data-type='taskItem']` therefore matched nothing, the row was
 *     never made a flex row, and a to-do rendered as a checkbox on one line with
 *     its text dropped below it.
 *
 * `renderHTML` is what gets saved. The node views are what gets painted. Styling
 * written against the wrong one fails silently: the CSS parses, the build passes,
 * and the only symptom is a page that looks wrong.
 *
 * So this builds the node views' DOM, then asserts that each selector the
 * stylesheet relies on for those blocks actually matches it.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
// Comments are prose, and the prose here quotes the dead selectors on purpose --
// naming them is the whole explanation. So the checks below read the rules only.
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

const HIDDEN_SPAN =
    'style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"';

/** The DOM each node view builds. Written out, and checked against the packages. */
const SHAPES = {
    taskItem: `
        <ul data-type="taskList">
          <li data-checked="false">
            <label contenteditable="false"><input type="checkbox"><span ${HIDDEN_SPAN}></span></label>
            <div><p>Task text</p></div>
          </li>
        </ul>`,
    details: `
        <div class="note-toggle" data-type="details" data-toggle-level="2">
          <button type="button"></button>
          <div>
            <summary class="note-toggle-summary">Toggle line</summary>
            <div class="note-toggle-content" data-type="detailsContent" hidden="hidden">
              <p>Body</p>
            </div>
          </div>
        </div>`,
};

/**
 * Selectors that must resolve, grouped by the shape they target. A selector is
 * checked with a pseudo-element suffix stripped, since there is no element to
 * match for those -- the rule's own selector text is checked instead.
 */
const REQUIRED = [
    // ---- to-do ------------------------------------------------------------
    ['taskItem', "ul[data-type='taskList'] > li", 'li'],
    ['taskItem', "ul[data-type='taskList'] > li > label", 'label'],
    ['taskItem', "ul[data-type='taskList'] > li > div > p", 'p'],
    ['taskItem', "ul[data-type='taskList'] > li[data-checked='true'] > div", null],
    ['taskItem', "ul[data-type='taskList'] input[type='checkbox']", 'input'],

    // ---- toggle -----------------------------------------------------------
    ['details', '.note-toggle > button', 'button'],
    ['details', '.note-toggle > button::before', null],
    ['details', '.note-toggle.is-open > button::before', null],
    ['details', 'summary.note-toggle-summary', 'summary'],
    ['details', '.note-toggle > div > div.note-toggle-content', null],
    ['details', '.note-toggle > div > div.note-toggle-content[hidden]', null],
    ['details', '.note-toggle[data-toggle-level=\'2\'] summary.note-toggle-summary', 'summary'],
];

/** Selectors that must NOT appear: they are written against saved HTML, not the page. */
const FORBIDDEN = [
    "li[data-type='taskItem']",
    '.note-prose details.note-toggle',
    'details.note-toggle > summary',
    'details.note-toggle[open]',
];

let failed = 0;
const fail = message => {
    failed++;
    console.log(` FAIL  ${message}`);
};

// ---- The shapes have not drifted from the packages -------------------------
const listPackage = readFileSync(
    new URL('../node_modules/@tiptap/extension-list/dist/index.js', import.meta.url),
    'utf8',
);
const detailsPackage = readFileSync(
    new URL('../node_modules/@tiptap/extension-details/dist/index.js', import.meta.url),
    'utf8',
);

// `data-type` is added by renderHTML, never by the TaskItem node view.
const taskItemView = listPackage.slice(
    listPackage.indexOf('addNodeView', listPackage.indexOf('task-item')),
);
if (/setAttribute\(["']data-type/.test(taskItemView)) {
    fail('TaskItem node view now sets data-type; this check should be revisited');
}
if (!/dataset\.checked\s*=/.test(taskItemView)) {
    fail('TaskItem node view no longer sets data-checked; this check should be revisited');
}
// The details node view builds a div with an empty toggle button.
if (!/document\.createElement\(["']div["']\)/.test(detailsPackage)) {
    fail('Details no longer renders a div wrapper; this check should be revisited');
}

// ---- Every required selector resolves against the real DOM -----------------
const docs = Object.fromEntries(
    Object.entries(SHAPES).map(([key, markup]) => [
        key,
        new JSDOM(`<!doctype html><body><div class="note-prose">${markup}</div></body>`).window
            .document,
    ]),
);

for (const [shape, selector, find] of REQUIRED) {
    const label = `${shape}: ${selector}`;
    if (find === null || selector.includes('::')) {
        // Nothing to match an element against: assert the rule exists at all.
        if (rules.includes(selector)) console.log(`  ok  ${label}`);
        else fail(`${label} — no such rule in index.css`);
        continue;
    }
    const element = docs[shape].querySelector(find);
    if (!element) {
        fail(`${label} — the shape has no ${find}`);
        continue;
    }
    if (element.matches(selector)) console.log(`  ok  ${label}`);
    else fail(`${label} — does not match the node view's DOM`);
}

// ---- Nothing relies on the saved-HTML-only selectors ------------------------
for (const selector of FORBIDDEN) {
    if (rules.includes(selector)) fail(`dead selector still present: ${selector}`);
    else console.log(`  ok  no rule targets saved-HTML-only ${selector}`);
}

console.log(
    failed === 0
        ? '\nALL PASS: the editor CSS matches the DOM the node views build'
        : `\n${failed} FAILED`,
);
process.exit(failed === 0 ? 0 : 1);