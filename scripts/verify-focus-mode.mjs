/**
 * Checks that focus mode dims one line, not one block.
 *
 * Focus mode marks the caret's block with `has-focus` and dims everything else with
 * opacity. That works down to a single line, but only if the dimming is written
 * against every descendant of the editor rather than its direct children.
 *
 * Written against the direct children, the only thing that could ever be dimmed was
 * a top-level block, and a top-level block that contained the caret had to be left
 * alone entirely -- because opacity multiplies down the tree, dimming a wrapper also
 * dims the line inside it. A toggle is one top-level block, so with the caret in a
 * line of an open toggle, focus mode lit the chevron, the label and every line of
 * the body at once. The same held for to-do lists, bullet lists, quotes and table
 * cells.
 *
 * The scope is the whole fix, so it is the thing asserted here: the selector is read
 * out of the stylesheet and applied to the node views' real DOM, rather than being
 * restated and hoped for. A restated selector would keep passing after the rule in
 * index.css had been narrowed back to `> *` and the bug had returned.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
// Comments are prose, and the prose here names the broken selector on purpose --
// naming it is the explanation. So the rules below read the rule text only.
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `selector { body }` pair, flattened out of any @media wrapper. */
function parseRules(source) {
    return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
        selector: selector.trim(),
        body,
    }));
}

const parsed = parseRules(rules);

/**
 * The one rule that dims prose. Scoped off the focus-mode class, since plenty of
 * other `.note-prose` rules declare an opacity of their own -- the chevron's, the
 * blockquote's. A rule scoped *to* `.has-focus` is the opposite of that: it holds
 * the transition for the lit line, and is checked separately below.
 */
const endsAtFocus = selector => selector.endsWith('.has-focus');
const dimming = parsed.filter(
    rule =>
        rule.selector.includes('.note-editor-shell--focus') &&
        rule.selector.includes('.note-prose') &&
        !endsAtFocus(rule.selector) &&
        /(^|[\s;{])opacity\s*:/.test(rule.body),
);
if (dimming.length !== 1) {
    console.log(
        ` FAIL  expected exactly one focus-mode dimming rule for .note-prose, found ${dimming.length}`,
    );
    process.exit(1);
}
const DIM = dimming[0].selector;

/**
 * The line the caret has just left has to fade back up, not jump. A transition is
 * taken from the after-change style, and a focused element matches the dimming rule
 * at all, so without a second rule holding the transition the fade is one-way.
 */
const fadeIn = parsed.find(
    rule => endsAtFocus(rule.selector) && rule.body.includes('transition'),
);

const HIDDEN_SPAN =
    'style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"';

/**
 * The DOM the node views build, with `data-line` marking each visible line of text.
 * That attribute is this probe's, not the editor's: the editor gives its blocks no
 * common class, and the point of the check is which blocks are dimmed.
 */
const SCENARIOS = [
    {
        name: 'the caret is in a line of an open toggle',
        // The shape `@tiptap/extension-details` builds -- see verify-editor-dom.mjs.
        markup: [
            '<h2 data-line="heading">Heading</h2>',
            '<div class="note-toggle is-open" data-type="details" data-toggle-level="2">',
            '  <button type="button"></button>',
            '  <div>',
            '    <summary class="note-toggle-summary">Toggle label</summary>',
            '    <div class="note-toggle-content" data-type="detailsContent">',
            '      <p data-line="focus">The line I am at</p>',
            '      <p data-line="body">Another line in the body</p>',
            // The formatted lines are the point of this scenario. Almost everything
            // written inside a toggle has some markup in it, and a shape-based
            // selector -- "an element with no element children" -- stops matching a
            // paragraph the moment it contains a `<strong>`, so the whole toggle
            // body came out fully lit. Every block below is dimmed or it is a bug.
            '      <p data-line="bold">A line with <strong>bold</strong> in it</p>',
            '      <p data-line="code">A line with <code>fn()</code> in it</p>',
            '      <p data-line="link">A line with <a href="#">a link</a> in it</p>',
            '      <p data-line="strike">A line with <s>struck</s> text</p>',
            '      <p data-line="mixed">With <em>both</em> and <code>code()</code></p>',
            '    </div>',
            '  </div>',
            '</div>',
            '<blockquote><p data-line="quote">A quoted line</p></blockquote>',
        ].join(''),
        focus: 'focus',
        // Wrappers on the path to the caret. Dimming any of them dims the caret's
        // own line with it, since opacity multiplies down the tree.
        containers: ['.note-toggle', '.note-toggle > div', '.note-toggle-content'],
        // The rest of the toggle, and everything outside it, goes down.
        chrome: [
            '.note-toggle > button',
            '.note-toggle summary.note-toggle-summary',
            'p[data-line="body"]',
            'p[data-line="bold"]',
            'p[data-line="code"]',
            'p[data-line="link"]',
            'p[data-line="strike"]',
            'p[data-line="mixed"]',
            'h2[data-line="heading"]',
            'blockquote p[data-line="quote"]',
        ],
    },
    {
        name: 'the caret is in a to-do item',
        // The shape `@tiptap/extension-list` builds for a task item.
        markup: [
            '<ul data-type="taskList">',
            '  <li data-checked="false">',
            `    <label contenteditable="false"><input type="checkbox"><span ${HIDDEN_SPAN}></span></label>`,
            '    <div><p data-line="focus">A task</p></div>',
            '  </li>',
            '  <li data-checked="false">',
            `    <label contenteditable="false"><input type="checkbox"><span ${HIDDEN_SPAN}></span></label>`,
            '    <div><p data-line="other">Another task with <strong>bold</strong></p></div>',
            '  </li>',
            '</ul>',
        ].join(''),
        focus: 'focus',
        containers: ['ul[data-type="taskList"]', 'li:first-child', 'li:first-child > div'],
        chrome: ['li:first-child > label', 'li:last-child > label', 'p[data-line="other"]'],
    },
    {
        name: 'the caret is in a callout',
        // The shape `noteCallout.ts` builds: a glyph chip and a body wrapper, both
        // of which would be skipped by a shape test and both of which are part of
        // the line the reader is looking at.
        markup: [
            '<div class="note-callout" data-callout="info">',
            '  <div class="note-callout-glyph">i</div>',
            '  <div class="note-callout-body"><p data-line="callout">Worth reading</p></div>',
            '</div>',
            '<div class="note-callout" data-callout="tip">',
            '  <div class="note-callout-glyph">t</div>',
            '  <div class="note-callout-body"><p data-line="focus">The line I am at</p></div>',
            '</div>',
        ].join(''),
        focus: 'focus',
        containers: ['.note-callout:nth-of-type(2)', '.note-callout:nth-of-type(2) .note-callout-body'],
        chrome: ['.note-callout:nth-of-type(1) .note-callout-glyph', 'p[data-line="callout"]'],
    },
    {
        name: 'the caret is in a plain top-level paragraph',
        markup: [
            '<h1 data-line="title">Title</h1>',
            '<p data-line="focus">The line I am at</p>',
            '<p data-line="after">The next line</p>',
            '<p data-line="after-bold">The next line, with <strong>bold</strong></p>',
            '<pre data-line="code-block"><code>const a = 1;</code></pre>',
        ].join(''),
        focus: 'focus',
        containers: [],
        chrome: [
            'h1[data-line="title"]',
            'p[data-line="after"]',
            'p[data-line="after-bold"]',
            'pre[data-line="code-block"]',
        ],
    },
];

let failed = 0;
const fail = message => {
    failed++;
    console.log(` FAIL  ${message}`);
};
const ok = message => console.log(`  ok  ${message}`);

// ---- The rule is not scoped back to the editor's direct children -------------
if (/\.note-prose\s*>/.test(DIM)) {
    fail(
        `focus mode is dimmed with \`${DIM}\`, which can only reach the editor's direct ` +
            'children -- so a toggle, list, quote or table cell holding the caret is left ' +
            'entirely lit. Match descendants instead.',
    );
} else {
    ok(`focus mode dims descendants: ${DIM}`);
}
if (DIM.includes(':has(.has-focus)') && !DIM.includes(':not(.has-focus)')) {
    fail(
        `\`${DIM}\` exempts the focused block via :has() alone; :has() matches descendants ` +
            'only, so the caret\'s own line would be dimmed and nothing would be lit.',
    );
} else {
    ok('the focused block itself is exempt, not just its ancestors');
}
if (fadeIn) ok('a focused line keeps the transition, so it fades up rather than jumping');
else fail('no transition on .has-focus -- a line would fade down but jump back up');

// ---- The Focus extension still marks the block the CSS depends on -------------
const extensions = readFileSync(
    new URL('../src/utils/noteEditorExtensions.ts', import.meta.url),
    'utf8',
);
const focusConfig = extensions.match(/Focus\.configure\(\{([^}]*)\}\)/)?.[1] ?? '';
if (!/className:\s*'has-focus'/.test(focusConfig)) {
    fail('Focus is not configured with className: has-focus; the dimming would match nothing');
} else ok('Focus marks the caret block with has-focus');
if (!/mode:\s*'deepest'/.test(focusConfig)) {
    fail(
        "Focus is not in 'deepest' mode; it defaults to 'all', which marks every ancestor " +
            'and so lights every line of a nested block again',
    );
} else ok("Focus runs in 'deepest' mode, so the class lands on one line");

// ---- Every scenario: only the caret's line stays lit -------------------------
for (const scenario of SCENARIOS) {
    const { window } = new JSDOM(
        `<!doctype html><body><div class="note-editor-shell note-editor-shell--focus">` +
            `<div class="note-prose">${scenario.markup}</div></div>`,
    );
    const doc = window.document;
    const focused = doc.querySelector(`p[data-line="${scenario.focus}"]`);
    if (!focused) {
        fail(`${scenario.name}: the shape has no p[data-line="${scenario.focus}"]`);
        continue;
    }
    focused.classList.add('has-focus');

    const dimmed = new Set(doc.querySelectorAll(DIM));

    // The line being written.
    if (dimmed.has(focused)) fail(`${scenario.name}: the caret's own line is dimmed`);
    else ok(`${scenario.name}: the caret's line is lit`);

    // Nothing on the path down to it. This is the invariant that makes per-line
    // dimming possible at all, and the one that the top-level form broke.
    for (const selector of scenario.containers) {
        const node = doc.querySelector(selector);
        if (!node) {
            fail(`${scenario.name}: the shape has no ${selector}`);
        } else if (dimmed.has(node)) {
            fail(`${scenario.name}: ${selector} wraps the caret's line and is dimmed`);
        } else {
            ok(`${scenario.name}: ${selector} stays transparent`);
        }
    }

    // Every other line and every piece of block chrome.
    for (const selector of scenario.chrome) {
        const node = doc.querySelector(selector);
        if (!node) {
            fail(`${scenario.name}: the shape has no ${selector}`);
        } else if (!dimmed.has(node)) {
            fail(`${scenario.name}: ${selector} is not dimmed`);
        } else {
            ok(`${scenario.name}: ${selector} is dimmed`);
        }
    }

    // And nothing else in the document is left lit.
    const lit = [...doc.querySelectorAll('.note-prose [data-line]')].filter(
        line => !dimmed.has(line),
    );
    const litNames = lit.map(line => line.dataset.line);
    if (litNames.length === 1 && litNames[0] === scenario.focus) {
        ok(`${scenario.name}: the caret's line is the only lit line`);
    } else {
        fail(`${scenario.name}: lit lines are [${litNames.join(', ')}], expected only [${scenario.focus}]`);
    }

    // ---- What the dimming is actually WORTH ------------------------------
    // Everything above asks whether a node was *matched*. That is not the same
    // question, and the difference is the whole bug: `opacity` multiplies down the
    // tree, so a line nested four deep and matched at all four levels renders at
    // 0.2^4 -- 0.0016, which is not dimmed but gone. The prose in a collapsed
    // toggle vanished completely and read as an empty block, and every check above
    // still passed, because each of those four nodes really was in the set.
    //
    // So this counts the factors rather than the nodes, and asserts there is
    // exactly one.
    const dimFactors = node => {
        let count = 0;
        for (let at = node; at && at !== doc.body; at = at.parentElement) {
            if (dimmed.has(at)) count++;
        }
        return count;
    };

    /**
     * Every declared opacity, so a line's *effective* opacity can be read.
     *
     * Only rules that can be matched against an element: the stylesheet is full of
     * pseudo-element selectors (`::before`, `::-webkit-scrollbar`) and jsdom's
     * `matches` throws a DOMException on those rather than returning false.
     *
     * Last match wins, which is the cascade.
     */
    const matchable = parsed.filter(
        rule => !rule.selector.includes('::') && !rule.selector.includes(':hover'),
    );
    const declared = node => {
        let value = 1;
        for (const rule of matchable) {
            if (!rule.body.includes('opacity:')) continue;
            let hit = false;
            try {
                hit = node.matches(rule.selector);
            } catch {
                continue; // A selector jsdom cannot parse proves nothing either way.
            }
            if (!hit) continue;
            const found = rule.body.match(/(?:^|[\s;{])opacity\s*:\s*([\d.]+)/)?.[1];
            if (found !== undefined) value = Number(found);
        }
        return value;
    };
    const effective = node => {
        let product = 1;
        for (let at = node; at && at !== doc.body; at = at.parentElement) {
            product *= declared(at);
        }
        return product;
    };

    for (const line of doc.querySelectorAll('.note-prose [data-line]')) {
        const name = line.dataset.line;
        const factors = dimFactors(line);
        const worth = effective(line);

        if (name === scenario.focus) {
            if (factors !== 0) fail(`${scenario.name}: the caret's line is dimmed by ${factors} factors`);
            else ok(`${scenario.name}: the caret's line takes no dim factor (${worth})`);
            continue;
        }

        // The invariant. One match at any depth means one factor, so every line on
        // the page is dimmed by the same amount no matter how its blocks nest --
        // which is the difference between focus mode and a page that goes black
        // wherever the markup happens to be deep.
        if (factors !== 1) {
            fail(
                `${scenario.name}: the ${name} line takes ${factors} dim factors, expected 1 ` +
                    '-- the dimming is compounding with nesting depth',
            );
            continue;
        }
        // And the floor. Other rules legitimately carry their own opacity (a
        // blockquote is 0.8 by design), so this is not "exactly 0.2" -- it is
        // "not invisible".
        if (worth < 0.1) {
            fail(`${scenario.name}: the ${name} line renders at ${worth.toFixed(4)}, which is gone, not dimmed`);
        } else {
            ok(`${scenario.name}: the ${name} line takes 1 factor, renders at ${worth.toFixed(3)}`);
        }
    }
}

console.log(
    failed === 0
        ? '\nALL PASS: focus mode dims one line, not one block'
        : `\n${failed} FAILED`,
);
process.exit(failed === 0 ? 0 : 1);
