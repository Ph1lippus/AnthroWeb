/**
 * Three layout decisions that are easy to undo by accident, because each one
 * looks like a purely visual change and none of them is.
 *
 * 1. The journal's loading text. `dayIsPending` exists to stop somebody typing
 *    into the previous day's entry, and it used to be expressed as a message
 *    that replaced the editors. The message named the day -- which was already
 *    in the rail beside it -- so it repeated what was on screen and then
 *    vanished, which is motion, not information.
 *
 * 2. The journal's left rail. It has to hold the day's breakdown, and it has to
 *    hold it at the Daily Log's breakpoint and proportions. Two pages that read
 *    as one app read as one app because they are laid out from the same parts;
 *    give one its own grid and they become two different instruments.
 *
 * 3. The timer mosaic. Tabs are gone. Every panel is mounted and visible, which
 *    is not an aesthetic choice: a panel that is not on screen cannot be
 *    scrolling, cannot be covering the clock, and cannot be the reason a running
 *    timer looks like it stopped.
 */
import { readFileSync, existsSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const code = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = rel => read(rel);

const journal = code('src/Pages/JournalPage.tsx');
const journalCss = css('src/index.css');
const timer = code('src/Pages/TimerPage.tsx');
const engine = code('src/hooks/useTimerEngine.tsx');
const breakdown = code('src/Components/Journal/JournalBreakdown.tsx');

console.log('\n== the journal says nothing while a day loads ==');
{
    check('the pending message is gone from the page',
        !/Loading \{formatDayLabel/.test(journal) && !/journal-log-loading/.test(journal));
    check('its style is gone too', !/^\.journal-log-loading \{/m.test(journalCss));

    // The guard itself must survive. It is the thing that stops somebody typing
    // into the previous day, and removing the message is not a reason to remove it.
    check('the guard is still there', /const dayIsPending = appliedDate !== logDate/.test(journal));

    check('the editors are dimmed instead',
        /journal-log-form__inner--pending/.test(journal));
    check('and are marked busy for assistive tech', /aria-busy=\{dayIsPending\}/.test(journal));
    check('and do not accept input',
        /\.journal-log-form__inner--pending \{[^}]*pointer-events: none/.test(journalCss));
}

console.log('\n== the journal rail holds a breakdown, like the daily log ==');
{
    check('the breakdown is rendered', /<JournalBreakdown/.test(journal));
    // Order inside the rail: the day row and the action buttons, then the
    // breakdown beneath them. Asserted by index rather than by a regex spanning
    // the gap, because a bounded `[\s\S]{0,n}` silently stops matching when the
    // markup between two points grows -- which is indistinguishable here from the
    // property being false.
    const rail = journal.slice(journal.indexOf('journal-score-col'));
    check('on the left, in the score column', rail.indexOf('<JournalBreakdown') > -1);
    check('under the day row', rail.indexOf('daily-log-daynav') < rail.indexOf('<JournalBreakdown'));
    check('and under the action buttons',
        rail.indexOf('journal-focus-btn') < rail.indexOf('<JournalBreakdown'));
    check('and the editors are outside the rail, in the form',
        journal.indexOf('<JournalBreakdown') < journal.indexOf('journal-log-form'));

    // It reuses the Daily Log's own panel, which is the whole point of it being
    // the same shape. A copy of the markup would drift within a week.
    check('the chips are the daily log\'s own BreakdownPanel',
        /from '\.\.\/DailyLog\/BreakdownPanel'/.test(breakdown));
    check('and its chip vocabulary, not a new one',
        !/^\.journal-breakdown-card \.metric-chip \{/m.test(journalCss));

    check('the toggle is first in the day row, like the daily log',
        journal.indexOf('daily-log-daynav-btn--on') < journal.indexOf('Previous day'),
        'the one control that does not act on the day goes before the ones that do');

    check('figures come from the document, not a second source',
        /journalWordCount\(document\)/.test(breakdown)
        && /journalTopicSuggestions\(document\)/.test(breakdown));
    check('and the mood line uses the shared label',
        /moodLabel\(morningMood\)/.test(breakdown),
        'two spellings of one number is how a correct figure starts looking wrong');
}

console.log('\n== the journal grid matches the daily log ==');
{
    check('it is a two-column grid at the same breakpoint',
        /@media \(min-width: 1280px\)[\s\S]*?\.journal-logs-card \{[\s\S]*?grid-template-columns/.test(journalCss));
    check('with the daily log\'s left column width',
        /minmax\(0, 20rem\) minmax\(0, 1fr\)/.test(journalCss),
        'the same 20rem the daily log scores in');
    check('the rail sticks, like the score column',
        /\.journal-score-col \{[\s\S]{0,200}position: sticky/.test(journalCss));
    check('and the entries stay a two-up grid to its right',
        /\.journal-log-puzzle \{[\s\S]*?@media \(min-width: 900px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/.test(journalCss));
}

console.log('\n== the timer has no tabs ==');
{
    check('the tab bar is not rendered', !/<Tabs\b/.test(timer));
    check('and no TabPanel either', !/<TabPanel\b/.test(timer));
    check('their imports are gone', !/from '\.\.\/Components\/Tabs'/.test(timer));
    check('the panel list is gone', !/const PANELS/.test(timer));
    // Word-boundary exact, not a bare `setPanel`: that substring also matches
    // `setPanelNow` and `PresetPanel`, so the loose form reports a failure that
    // is really just a naming collision, and a check that cries wolf gets
    // deleted rather than fixed.
    check('the panel state is gone', !/\bsetPanel\b/.test(timer) && !/\[panel\b/.test(timer));

    check('there is a mosaic', /className="timer-mosaic"/.test(timer));
    const missing = ['Timer', 'Presets', 'Alarms', 'Settings']
        .filter(label => !new RegExp(`<h3 className="card-title">${label}</h3>`).test(timer));
    check('holding all four cells', missing.length === 0, `missing: ${missing.join(', ') || 'none'}`);

    check('nothing is conditionally rendered in it',
        !/\{panel ===|hidden=\{panel/.test(timer),
        'a panel that can be unmounted is a panel that can be the reason the clock looks stopped');
}

console.log('\n== the world clock is just your own time ==');
{
    check('the panel is gone from the page', !/WorldClockPanel/.test(timer));
    check('the header shows a wall clock',
        /toLocaleTimeString\(undefined/.test(timer),
        'undefined locale, so the device\'s own region and 12/24-hour setting win');
    check('tabular figures, so it does not twitch every minute',
        /\.timer-header__now \{[^}]*font-variant-numeric: tabular-nums/.test(journalCss));
    check('and it is marked up as a time',
        /<time className="timer-header__now"/.test(timer));

    // Existence, not a read: the point is that the file is gone, and reading it
    // to find that out throws instead of reporting.
    check('the panel component is deleted',
        !existsSync(new URL('../src/Components/Timer/WorldClockPanel.tsx', import.meta.url)));
    check('and so is its city table',
        !existsSync(new URL('../src/utils/worldClock.ts', import.meta.url)),
        'left in place it would be a dozen cities and a zone converter with no caller');
}

console.log('\n== the mosaic layout ==');
{
    check('one column on a phone', /\.timer-mosaic \{[\s\S]*?grid-template-columns: 1fr/.test(journalCss));
    check('two-up once there is room', /@media \(min-width: 1100px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/.test(journalCss));
    check('the ring goes above it on a phone, beside it on a wide screen',
        /\.timer-stage[\s\S]*?order/.test(journalCss) || /order: 0/.test(journalCss));
}

console.log('\n== switching mode cannot stop a running timer ==');
{
    const setMode = /const setMode[\s\S]*?\n    \}, \[\]\);/.exec(engine)?.[0] ?? '';
    check('setMode was found', setMode.length > 40, `matched ${setMode.length} chars`);
    check('it refuses while running', /prev\.running/.test(setMode));
    check('it does not clear running', !/running: false/.test(setMode));
    check('but still clears the deadline once stopped', /deadline: null/.test(setMode));

    check('and the chips say so', /disabled=\{engine\.running\}/.test(timer));
    check('with a tip explaining why',
        /data-tip=\{engine\.running \? 'Pause to change the mode'/.test(timer));
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
