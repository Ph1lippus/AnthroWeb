/**
 * Behaviours, not structure: the popover and the tooltip, driven for real.
 *
 * `verify-notes-appearance.mjs` asserts the *shape* of these two -- that the panel
 * is portalled, that the dismissal handler names both the panel and the anchor,
 * that the position is not held in state. All of that is worth nothing if the
 * thing they were added to fix still happens, so this drives them in a DOM:
 *
 *  - A click inside the portalled panel must NOT close it. This is the whole
 *    reason the dismissal moved into `Popover`. The panel is no longer a
 *    descendant of the trigger, so a handler testing only the trigger closes on
 *    the pointerdown of any swatch -- and the click that would have selected that
 *    swatch never lands, because the thing it was aimed at is already gone. The
 *    symptom is a colour and icon picker where nothing can be selected, and no
 *    error anywhere.
 *
 *  - A click on the trigger must NOT close it either, for the same reason: that is
 *    what makes the trigger a toggle.
 *
 *  - The tooltip must open on keyboard focus as well as on hover, and must survive
 *    the pointer moving from a button onto the icon inside it. `mouseout` fires on
 *    the icon, so closing there made the tip flicker on every control with a glyph.
 *
 * React needs real DOM globals, so jsdom's window is installed before React is
 * imported rather than being passed around.
 */
import { JSDOM } from 'jsdom';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Load a `.tsx` component.
 *
 * Node strips types from `.ts` but cannot handle JSX, and the obvious workaround
 * -- transpiling to a `data:` URL, which is what `verify-notes-tree.mjs` does --
 * does not work here: a data URL has no resolution base, so the component's own
 * `import { createPortal } from 'react-dom/client'` cannot be found.
 *
 * So the output is written inside `node_modules`, where the normal upward lookup
 * finds the project's own copy of react. It is a build artefact in the one
 * directory that is already ignored.
 */
const load = async relative => {
    const source = readFileSync(join(root, relative), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
        },
    });
    const dir = join(root, 'node_modules', '.tmp', 'verify-popover');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, relative.replace(/[\\/]/g, '_').replace(/\.tsx$/, '.mjs'));
    writeFileSync(file, outputText, 'utf8');
    return import(`file://${file.replace(/\\/g, '/')}`);
};

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
});

const { window } = dom;
// Assigned with a define rather than a plain write: Node 24 defines `navigator`
// as a getter-only global, and a bare assignment throws instead of shadowing it.
const install = (key, value) =>
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
for (const key of [
    'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
    'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame',
    'cancelAnimationFrame', 'DocumentFragment', 'HTMLInputElement', 'HTMLButtonElement',
    'FocusEvent',
]) {
    install(key, window[key]);
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { createElement: h } = React;

const { default: Popover } = await load('src/Components/Popover.tsx');
const { default: TipLayer } = await load('src/Components/TooltipLayer.tsx');

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

/** Long enough for TipLayer's 120ms show delay to have elapsed. */
const settle = () => new Promise(resolve => setTimeout(resolve, 220));
const fire = (node, type, init) => node.dispatchEvent(new window[type[0] === 'k' ? 'KeyboardEvent' : 'MouseEvent'](type, { bubbles: true, ...init }));

const app = createRoot(document.getElementById('root'));

/**
 * One harness for both: a trigger, a portalled panel with a swatch inside it, and
 * something outside everything for the pointer to leave for.
 *
 * The anchor arrives through a callback ref rather than being looked up at
 * module scope, because `Popover` renders nothing while its anchor is null -- and
 * at the moment the element tree is first built the trigger does not exist yet.
 * Reading it here rather than after the first render is the mistake that makes
 * this test pass vacuously.
 */
const closes = [];

const Harness = ({ panelChild } = {}) => {
    const [anchor, setAnchor] = React.useState(null);
    return h('div', null,
        h('div', { id: 'pane-clip' },
            // A real child element inside the button, because the tooltip's
            // child-hover behaviour is only exercisable if the thing the pointer
            // lands on is an Element -- a bare text node is not, and resolving an
            // anchor from one correctly yields nothing.
            h('button', { id: 'trigger', ref: setAnchor, 'data-tip': 'Page colour' },
                h('span', { id: 'glyph' }, 'trigger')),
            h('button', { id: 'outside' }, 'outside'),
        ),
        h(TipLayer),
        anchor && h(Popover, {
            anchor,
            label: 'Page colour',
            onClose: () => closes.push('close'),
        }, panelChild ?? h('button', { id: 'swatch' }, 'swatch')),
    );
};

await act(async () => { app.render(h(Harness)); });

const trigger = document.getElementById('trigger');
const glyph = document.getElementById('glyph');
const outside = document.getElementById('outside');
/** Found by class: `Popover` renders its own div and does not take an `id`. */
const panel = () => document.querySelector('.popover');
const swatch = () => document.getElementById('swatch');

console.log('\n== the panel escapes the clipping ancestor ==');
{
    check('the panel is in the document', !!panel());
    check('and it is a direct child of <body>, not of the clipping pane',
        panel()?.parentElement === document.body,
        `parent is <${panel()?.parentElement?.tagName?.toLowerCase()}>`);
    check('the clipping pane does not contain it',
        !document.getElementById('pane-clip').contains(panel()));
    check('it is announced as a dialog with a name',
        panel()?.getAttribute('role') === 'dialog'
        && panel()?.getAttribute('aria-label') === 'Page colour');
}

console.log('\n== a press inside the panel does not close it ==');
{
    closes.length = 0;
    await act(async () => { fire(swatch(), 'mousedown'); });
    check('pressing a swatch does not close the panel', !closes.includes('close'),
        `got ${JSON.stringify(closes)}`);
    check('and the panel is still on screen', !!panel());
}

console.log('\n== a press on the trigger does not close it ==');
{
    // This is what makes the trigger a toggle. Without the anchor in the
    // dismissal's "inside" list, the panel closes on pointerdown and then the
    // click toggles it straight back open, so it flickers and never stays shut.
    closes.length = 0;
    await act(async () => { fire(trigger, 'mousedown'); });
    check('pressing the trigger does not close the panel', !closes.includes('close'),
        `got ${JSON.stringify(closes)}`);
}

console.log('\n== a press outside does close it ==');
{
    closes.length = 0;
    await act(async () => { fire(outside, 'mousedown'); });
    check('pressing elsewhere closes the panel', closes.includes('close'),
        `got ${JSON.stringify(closes)}`);
}

console.log('\n== Escape closes it ==');
{
    closes.length = 0;
    await act(async () => {
        document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    check('Escape closes the panel', closes.includes('close'), `got ${JSON.stringify(closes)}`);
}

console.log('\n== Escape in a field inside the panel belongs to the field ==');
{
    // The icon search uses Escape to clear its query. Closing as well would mean
    // one keystroke both discards the search and dismisses the picker, and the
    // user has to open it again and retype.
    const field = h('input', { id: 'panel-field', 'aria-label': 'Search icons' });
    await act(async () => {
        app.render(h(Harness, { panelChild: field }));
    });
    const input = document.getElementById('panel-field');
    check('the field is inside the panel', !!input && !!panel()?.contains(input));

    closes.length = 0;
    await act(async () => {
        input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    check('Escape in the field does not close the panel', !closes.includes('close'),
        `got ${JSON.stringify(closes)}`);

    closes.length = 0;
    await act(async () => {
        document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    check('but Escape anywhere else still closes it', closes.includes('close'),
        `got ${JSON.stringify(closes)}`);

    // Put the plain panel back for the tooltip checks that follow.
    await act(async () => { app.render(h(Harness)); });
}

console.log('\n== the tooltip opens on hover ==');
{
    await act(async () => { fire(trigger, 'mouseover'); });
    await act(async () => { await settle(); });
    const tip = document.querySelector('.tooltip');
    check('a tooltip appeared', !!tip);
    check('it carries the label from data-tip', tip?.textContent === 'Page colour',
        `got ${JSON.stringify(tip?.textContent)}`);
    check('it is portalled to the body', tip?.parentElement === document.body);
    check('it is a real tooltip to assistive tech', tip?.getAttribute('role') === 'tooltip');
    check('it is the only one, however many controls carry data-tip',
        document.querySelectorAll('.tooltip').length === 1);
    // `pointer-events: none` is asserted against the stylesheet in
    // verify-notes-appearance.mjs. It cannot be checked here: jsdom resolves no
    // external CSS, so `getComputedStyle` on an element with no inline style says
    // `auto` no matter what the real page says.
}

console.log('\n== the tooltip survives moving onto a child ==');
{
    // The pointer is over the label inside the button, so `mouseout` fires on the
    // label and `mouseover` on the same button. Closing on the first made every
    // control with a glyph flicker as the pointer crossed it.
    const before = document.querySelector('.tooltip');
    await act(async () => {
        fire(glyph, 'mouseout', { relatedTarget: trigger });
        fire(trigger, 'mouseover');
    });
    await act(async () => { await settle(); });
    check('the tip is still up', !!document.querySelector('.tooltip'));
    check('and it is the same one, not a rebuild', document.querySelector('.tooltip') === before);
}

console.log('\n== the tooltip closes when the pointer leaves ==');
{
    await act(async () => { fire(trigger, 'mouseout', { relatedTarget: outside }); });
    check('leaving the control closes the tip', !document.querySelector('.tooltip'));
}

console.log('\n== the tooltip opens on keyboard focus ==');
{
    await act(async () => {
        trigger.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    });
    // No settle() on purpose: arriving by Tab is deliberate, and a tip that trails
    // a fifth of a second behind the focus ring is worse than none.
    const tip = document.querySelector('.tooltip');
    check('focus alone is enough to show it', !!tip);
    check('with the same label', tip?.textContent === 'Page colour');

    await act(async () => {
        trigger.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    });
    check('and focus leaving closes it', !document.querySelector('.tooltip'));
}

console.log('\n== a tip anchored to something removed is dropped ==');
{
    await act(async () => { fire(trigger, 'mouseover'); });
    await act(async () => { await settle(); });
    check('the tip is up before the control goes', !!document.querySelector('.tooltip'));
    await act(async () => { app.unmount(); });
    check('unmounting takes it with it, rather than leaving it over the gap',
        !document.querySelector('.tooltip'));
}

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
