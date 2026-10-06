/**
 * Checks the row of controls above the daily log's score card.
 *
 * One thing here is easy to get wrong twice over, and neither shows up in a
 * screenshot of the happy path:
 *
 *  - The breakdown has one control -- the icon in this row -- and the state is held
 *    by the page so the card cannot hold a second copy of it that disagrees.
 *
 *  - The row is `flex-wrap: nowrap` in a panel that is the narrowest of three tracks,
 *    roughly 277px at the split. Every control is fixed-width and the date label takes
 *    the slack, so a control added without re-doing the arithmetic does not push
 *    anything onto a second line -- it takes the date's characters instead, one of
 *    them at a time, and only on the days where the date is longest.
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
const code = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = read('src/index.css');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

const page = code('src/Pages/DailyLogPage.tsx');
const card = code('src/Components/DailyLog/ScoreCard.tsx');
const row = /<div className="daily-log-daynav">([\s\S]*?)\n        <\/div>/.exec(page)?.[1] ?? '';

console.log('\n== one breakdown, one control ==');
{
    // Two `useState`s over one thing is how a toggle ends up lying about its own
    // state: the card would remember the old value and reopen on the next render.
    check('the card does not keep its own copy of it',
        !/useState/.test(card) && !/useState\(true\)/.test(card));
    check('the page owns it',
        /const \[breakdownOpen, setBreakdownOpen\] = useState\(\s*\(\) =>/.test(page),
        'the page does not choose the initial state lazily');
    // Closed on a phone, open where there is room. A card that opens to nothing but
    // a ring is a number with nothing to say; on a short screen the breakdown is
    // six categories of chips standing between the ring and the log's own form.
    check('and it opens on a screen with room for it',
        /window\.matchMedia\('\(min-width: 768px\)'\)\.matches/.test(page));
    check('the card reads the page\'s value',
        /expanded=\{breakdownOpen\}/.test(page) && /expanded: boolean/.test(card));
    check('and the page is what draws it',
        /daily-score-breakdown \$\{expanded \?/.test(card));
    check('and the card carries no toggle of its own',
        !/onToggleExpanded/.test(card) && !/onToggleExpanded/.test(page));
    check('the row\'s control is the only one that toggles it',
        (page.match(/setBreakdownOpen\(open => !open\)/g) ?? []).length === 1,
        `${(page.match(/setBreakdownOpen\(open => !open\)/g) ?? []).length} toggles`);
}

console.log('\n== the row\'s new control ==');
{
    check('the day row was found', row.length > 0);
    // Icon only, as every other control in this row is. A name on screen would not
    // fit: the panel is 277px wide in the split layout.
    check('it is a button in the day row, using the row\'s own control class',
        /daily-log-daynav-btn\$\{breakdownOpen \? ' daily-log-daynav-btn--on' : ''\}/.test(row));
    // First, because it is the one control in the row that does not act on the day:
    // everything after it picks a day or edits one.
    check('and it is drawn before the day controls',
        row.indexOf('Rows3') < row.indexOf('Previous day') && row.indexOf('Rows3') !== -1);

    // An icon is not a name. Without these it is announced as "button", and the row
    // it sits in has a tip layer that would show the reader nothing.
    check('it has an accessible name', /aria-label=\{breakdownOpen \? 'Hide breakdown' : 'Show breakdown'\}/.test(page));
    check('and a tooltip saying the same thing',
        /data-tip=\{breakdownOpen \? 'Hide breakdown' : 'Show breakdown'\}/.test(page));
    check('and reports whether it is on',
        /aria-pressed=\{breakdownOpen\}/.test(page));
    check('and the glyph itself is not announced twice',
        /<Rows3 size=\{14\} aria-hidden="true" \/>/.test(page));
    check('and it is an icon, not a word',
        !/daily-log-daynav[\s\S]{0,400}?Rows3[\s\S]{0,200}?<\/button>\s*<button[\s\S]{0,200}?Hide breakdown/.test(page),
        'the button has visible text in it');

    // "On" has to be visible, because nothing else on screen says whether the
    // breakdown is showing -- it is the only control for it.
    const on = /\.daily-log-daynav-btn--on,\s*\.daily-log-daynav-btn--on:hover \{[^}]*\}/.exec(rules)?.[0] ?? '';
    check('the on state has a rule', on.length > 0);
    check('and it is the accent fill, not a different colour invented for it',
        /var\(--accent-bg\)/.test(on) && /var\(--color-primary\)/.test(on), on.trim());
}

console.log('\n== the date keeps its width ==');
{
    const split = /@media \(min-width: 1280px\) \{\s*\.daily-log-daynav \{[^}]*\}\s*\.daily-log-daynav-btn \{[^}]*\}\s*\}/.exec(rules)?.[0] ?? '';
    check('the split-layout rule was found', split.length > 0);
    // Seven controls at 1.7rem plus 0.25rem gaps take 218px of a 277px panel, which
    // leaves the date 59px -- a pixel under what "Mon, Sep 29" needs. The circles have
    // to give up more than they did for six.
    const size = /width:\s*([\d.]+)rem/.exec(split)?.[1];
    const gap = /gap:\s*([\d.]+)rem/.exec(split)?.[1];
    check('the controls are sized', !!size && !!gap, split.trim());
    const controls = 7 * Number(size) * 16 + 7 * Number(gap) * 16;
    check('seven of them leave the date at least 70px of the 277px panel',
        277 - controls >= 70, `${Math.round(controls)}px of controls`);
    // Asserted against the comment as well as the rule: the arithmetic is the kind of
    // thing that goes stale silently, and the comment is what a later reader trusts.
    check('and the comment counts seven controls, not six',
        /breakdown toggle, which is fixed too/.test(css)
        && /breakdown toggle was the seventh/.test(css),
        'the width comment still describes six controls');
}

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);