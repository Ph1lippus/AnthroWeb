/**
 * Checks the pieces of the note editor and the nav rail that fail silently.
 *
 *   - The block menu's Delete targeted the toggle rather than the line inside it,
 *     because the target was resolved by scanning the document's top-level
 *     children. Asserted on the document and the caret, through the real actions.
 *
 *   - The sidebar's settings menu was positioned inside the rail, which is a
 *     scroll container, so it was clipped by it rather than drawn over the page.
 *     A z-index could not have saved it: the rail is `position: fixed` with a
 *     z-index of its own, which makes it a stacking context, and the sign-out
 *     confirmation it opens sits above that in the root context. So the check is
 *     structural -- the menu must be portalled out of the rail, and what the rail
 *     does to its overflow must not change.
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

const sidebar = readFileSync(new URL('../src/Components/SidebarNav.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

console.log('\n== the rail clips its own overflow ==');
{
    // The whole reason the menu has to be portalled, so it is asserted rather than
    // assumed: a rail that stopped scrolling would make the menu's inline rule
    // correct again and its portal pointless.
    const rail = css.match(/\.sidebar-nav \{[^}]*\}/)?.[0] ?? '';
    check('the rail rule was found', rail.length > 0);
    check('the rail scrolls', /overflow-y:\s*auto/.test(rail), rail.trim());
    check('and creates a stacking context, so z-index alone cannot lift a child out',
        /position:\s*fixed/.test(rail) && /z-index:/.test(rail), rail.trim());
}

console.log('\n== the settings menu is portalled to <body> ==');
{
    check('the menu button is in the rail', /sidebar-menu-btn/.test(sidebar));
    check('the menu dropdown is rendered through createPortal',
        /createPortal\([\s\S]*sidebar-menu-dropdown[\s\S]*document\.body/.test(sidebar));
    check('and not inside the rail element',
        !/<nav className="sidebar-nav"[\s\S]*sidebar-menu-dropdown[\s\S]*<\/nav>/.test(sidebar));

    const rule = css.match(/\.sidebar-menu-dropdown \{[^}]*\}/)?.[0] ?? '';
    check('the dropdown rule was found', rule.length > 0);
    // `absolute` against an in-rail ancestor is what the rail's overflow clipped.
    check('the dropdown is positioned against the viewport, not the rail',
        /position:\s*fixed/.test(rule) && !/position:\s*absolute/.test(rule), rule.trim());
    check('and carries a root-level z-index of its own',
        /z-index:\s*\d+/.test(rule), rule.trim());

    // The placement is computed, so it has to be fed the anchor's rect and the
    // window's edges, or it is a fixed offset that walks off a short screen.
    check('the placement reads the button rect',
        /getBoundingClientRect/.test(sidebar));
    check('and clamps to the window',
        /window\.innerHeight/.test(sidebar) && /window\.innerWidth/.test(sidebar));
    check('and is applied as top/left rather than left alone',
        /style=\{\{ top: pos\.top, left: pos\.left \}\}/.test(sidebar));

    // Placed in a layout effect, so the correction from the estimated size to the
    // real one lands before the paint rather than after it.
    check('it is settled in a layout effect', /useLayoutEffect/.test(sidebar));

    // The correction pass runs from an effect that reads `pos`, so writing a fresh
    // object back from it re-triggers itself for ever -- `setPos` with a new object is
    // never equal to the old one, and React gives up on the nesting depth. It has to
    // hand the previous object back when the numbers have not moved.
    check('the correction settles rather than looping',
        /nextPosIfMoved/.test(sidebar)
        && /current\.top === next\.top && current\.left === next\.left \? current : next/
            .test(sidebar),
        'the layout effect sets a fresh object unconditionally');

    // And it must not be written from inside another setState's updater, which React
    // may run more than once and where a write is not allowed to be relied on.
    check('no state is written from inside a setState updater',
        !/setMenuOpen\([^)]*=>[\s\S]{0,400}?setPos\(/.test(sidebar),
        'setPos is called inside the setMenuOpen updater');

    // A dropdown out of the rail is not inside the element the outside-click
    // handler used to test, so that test has to know about it separately.
    check('the outside-click handler knows about the portalled panel',
        /dropdownRef\.current\?\.contains/.test(sidebar));

    // The rules the fix moved must not have left the old wrapper behind.
    check('the inline wrapper rule is gone', !/\.sidebar-menu-wrap\s*\{/.test(css));
    check('and nothing still renders the wrapper',
        !/sidebar-menu-wrap/.test(sidebar));
}

console.log('\n== the other panels on the same rail ==');
{
    // The reason the rail is the way it is, and the reason this pattern was
    // already established here. Worth checking that fixing the menu did not change
    // either of them.
    check('the tooltip is still portalled',
        /sidebar-tooltip[\s\S]*document\.body/.test(sidebar));
    const alert = readFileSync(
        new URL('../src/Components/AcademicAlertBanner.tsx', import.meta.url), 'utf8');
    check('the deadline panel is still portalled',
        /sidebar-alert-panel[\s\S]*document\.body/.test(alert));
}

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);