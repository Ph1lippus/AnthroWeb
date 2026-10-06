/**
 * Checks that the block menu does not move when "Turn into" opens.
 *
 * The two panels share a top edge, so the popup's `top` has to clear the bottom of
 * the window for the *taller* of the two -- and the block types are taller than the
 * actions by more than twice. Placing on the taller panel is only possible while
 * that panel is closed, because before this change it was mounted on hover. So
 * hovering "Turn into" re-clamped `top`, the popup slid 50-230px upward out from
 * under a stationary pointer on a 23px row, and the row it slid out from under
 * reported a leave: which closed the panel, which put the popup back where it
 * started. The menu then oscillated on a ~140ms cycle until the pointer wandered
 * off it.
 *
 * Every check here is structural. The bug is a sequence of frames, and what has to
 * stay true is that nothing about hovering can change the placement any more.
 */
import { readFileSync } from 'node:fs';

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

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
/** Comments are stripped, so this file's own notes cannot satisfy a check. */
const code = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const editor = code('src/Components/Notes/NoteEditor.tsx');
const blockMenu = code('src/Components/Notes/BlockMenu.tsx');
const css = read('src/index.css').replace(/\/\*[\s\S]*?\*\//g, '');

console.log('\n== the panel is there to be measured ==');
{
    // The whole fix rests on this: mounted closed, `visibility: hidden`, still
    // holding its layout box.
    check('the block-type panel is mounted while it is closed',
        /showTurnIntoRow && \(\s*<div[^}]*ref=\{submenuRef\}/s.test(blockMenu),
        'mounting it on hover leaves no height to reserve');
    check('whether it is the one on screen is said separately from whether it is open',
        /const submenuDrawn = beside && submenuVisible/.test(blockMenu));
    check('a closed panel is inert, so it is out of the tab order',
        /inert=\{!submenuDrawn\}/.test(blockMenu) && /aria-hidden=\{!submenuDrawn\}/.test(blockMenu));
    check('and it is marked so the stylesheet can hide it',
        /data-open=\{submenuDrawn \? '' : undefined\}/.test(blockMenu));

    const hidden = /\.slash-menu--submenu:not\(\[data-open\]\) \{[^}]*\}/.exec(css)?.[0] ?? '';
    check('the closed-panel rule was found', hidden.length > 0);
    // `display: none` would have removed the box being measured, and the whole
    // arrangement would be a measurement of nothing.
    check('the closed panel is hidden with visibility, so it still has layout',
        /visibility:\s*hidden/.test(hidden) && !/display:\s*none/.test(hidden), hidden.trim());
    check('and its open animation does not play for a panel nobody can see',
        /animation:\s*none/.test(hidden), hidden.trim());
}

console.log('\n== the placement happens once, on the taller panel ==');
{
    check('the height reserved is the taller of the two panels',
        /const height = Math\.max\(mainHeight, subHeight\)/.test(editor));
    check('and the submenu is measured whether or not it is open',
        /const subHeight = submenuRef\.current\?\.offsetHeight \|\| 0/.test(editor));
    // The re-clamp on toggle was the movement itself.
    check('nothing re-clamps the popup when the panel opens or closes',
        !/remeasure\(/.test(editor) && !/setSubmenuOpen/.test(editor),
        'placement still depends on whether the panel is open');
    check('the menu state no longer tracks whether the panel is open',
        !/submenuOpen/.test(editor));
    check('the panel no longer has to report itself opening',
        !/onSubmenuOpenChange/.test(editor) && !/onSubmenuOpenChange/.test(blockMenu));
    check('placement is guarded to one pass per opening',
        /placedMenuIdRef\.current === current\.id/.test(editor));
    check('and settles in a layout effect, so the correction is never a frame late',
        /useLayoutEffect\(\(\) => \{\s*if \(menuId !== null\) place\(menuId\)/.test(editor));
    check('the panel still gets to size itself by a stable rule',
        /Math\.min\(anchor\.top, window\.innerHeight - height - MENU_MARGIN\)/.test(editor));
}

console.log('\n== the assumed size matches the drawn one ==');
{
    // Placed from an assumed width on the first frame and corrected on the next,
    // a constant that is 52px out moves the menu sideways after it was painted.
    const assumed = /const MENU_WIDTH = (\d+)/.exec(editor)?.[1];
    const cssWidth = /\.slash-menu--block,\s*\.slash-menu--selection,\s*\.slash-menu--submenu \{[^}]*width:\s*(\d+)px/
        .exec(css)?.[1];
    check('the width constant was found', !!assumed, editor.slice(0, 0));
    check('and the CSS panel width was found', !!cssWidth);
    check('the two agree', assumed === cssWidth, `MENU_WIDTH=${assumed}, css=${cssWidth}`);
}

console.log('\n== nothing scrolls to get there ==');
{
    // Both panels are sized to their contents and placed to fit. The viewport cap
    // is left as a last resort for a window shorter than the block-type list.
    const rule = /\.slash-menu \{[^}]*\}/.exec(css)?.[0] ?? '';
    check('the panel rule was found', rule.length > 0);
    check('the cap is the window, not a fixed height',
        /max-height:\s*calc\(100dvh - 1rem\)/.test(rule), rule.trim());
    check('and only the window\'s own height can make a panel scroll',
        /max-height:\s*\d+px|height:\s*\d+px/.test(rule) === false, rule.trim());
}

console.log('\n== a selection is a selection, not an adjustment of the last one ==');
{
    // How the editor tells a new selection from someone adjusting the one they have:
    // a single flag, cleared when a transaction collapses the selection. That is the
    // only thing clearing it, so a selection dismissed *without* being collapsed --
    // the menu closing on a scroll, or on Escape -- left the flag saying the next
    // selection was a continuation of the last one. Selecting, clicking away and
    // selecting something else then did nothing. A pointer going down is always the
    // start of a gesture whatever came before it, so that is where it is cleared.
    check('going down clears it', /const onDown = \(\) => \{[\s\S]{0,400}?selectionWasEmptyRef\.current = true;/.test(editor));
    check('and so does a gesture that ends without selecting',
        /const onCancel = \(\) => \{[\s\S]{0,320}?selectionWasEmptyRef\.current = true;/.test(editor));
    check('a collapsed selection still clears it', /if \(!nonEmpty\) \{\s*selectionWasEmptyRef\.current = true;/.test(editor));
    check('and a pointer down is caught before the editor sees it',
        /addEventListener\('pointerdown', onDown, true\)/.test(editor));

    // The other end of the same bug: the menu's mark commands temporarily select a
    // whole block, and put the reader's selection back afterwards. `from`/`to` are
    // always in document order, so restoring from them turned a right-to-left
    // selection into a left-to-right one -- and Shift+click and Shift+arrow both grow
    // from the anchor, so the next selection started at the far end of the last one.
    const actions = code('src/utils/noteBlockActions.ts');
    check('the restored selection keeps the end the pointer went down on',
        /selection\.\$anchor\.pos > selection\.\$head\.pos/.test(actions));
    check('and is put back in that direction',
        /backwards \? \{ from: to, to: from \} : \{ from, to \}/.test(actions));
    check('the behavioural case is covered, not just the shape of it',
        /== a mark command hands the selection back as it was ==/.test(
            read('scripts/verify-block-actions.mjs')));
}

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);