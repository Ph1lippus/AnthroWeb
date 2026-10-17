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

    check('there is a mosaic', /className="timer-mosaic/.test(timer));
    // Outer cell titles were removed on purpose -- each panel already names itself
    // through its own inner header, and the duplicate was just noise above the form.
    const present = ['Timer', 'Presets', 'Alarms', 'Settings']
        .filter(label => new RegExp(`<h3 className="card-title">${label}</h3>`).test(timer));
    check('the cells carry no redundant outer titles', present.length === 0, `still present: ${present.join(', ') || 'none'}`);

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
    // Tabular figures were checked against `.timer-header__now`, a rule for a header
    // that no longer exists. The clock itself lives in the display column now, and
    // the guarantee is asserted against the class actually in use -- see the "no
    // rule across the top of the page" section below.
    check('and the wall clock is marked up as a time',
        /<time className="timer-clock__now"/.test(timer));

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
    check('mosaic uses the daily log\'s own gap between its columns',
        /\.daily-log-puzzle \{[\s\S]*?gap: 1rem/.test(journalCss));
    check('one column on a phone',
        /@media \(max-width: 768px\)[\s\S]*?daily-log-puzzle[\s\S]*?grid-template-columns: 1fr/.test(journalCss));
    check('the ring sits beside it on a wide screen',
        /\.timer-body \{[\s\S]*?grid-template-columns: minmax\(22rem/.test(journalCss));

    // The cards are the daily log's cards. Compared against the daily log's own
    // declarations rather than against literals here, because "looks like the
    // other pages" is the requirement, and a restated number stops meaning that
    // the moment somebody changes one side of it.
    //
    // Every `.daily-log-form .card` block is collected, because there are two: the
    // real one, and a phone override that tightens the padding to 0.5rem. Taking
    // the first match would compare against the mobile one, which is why this
    // picks the block that actually sets the background.
    const dailyCards = [...journalCss.matchAll(/\.daily-log-form \.card \{([^}]*)\}/g)]
        .map(match => match[1]);
    const dailyCard = dailyCards.find(body => /background:/.test(body)) ?? '';
    const timerCells = [...journalCss.matchAll(/\.timer-mosaic__cell \{([^}]*)\}/g)]
        .map(match => match[1]);
    const timerCell = timerCells.find(body => /background:/.test(body)) ?? '';
    check('a mosaic cell is found', timerCell.length > 0, `matched ${timerCell.length} chars`);
    for (const property of ['background', 'border-radius', 'padding']) {
        const expected = dailyCard.match(new RegExp(`${property}:\\s*([^;]+)`))?.[1]?.trim();
        const actual = timerCell.match(new RegExp(`${property}:\\s*([^;]+)`))?.[1]?.trim();
        check(`and its ${property} matches the daily log's`,
            !!expected && expected === actual, `${actual} vs ${expected}`);
    }

    // The gap the grid sets, and nothing more. These containers used to be a bare
    // `.card` -- which has no background at all -- wrapping a 1rem `.card-body`
    // around a 1rem `.timer-block`, so every panel was two backgrounds and two
    // rems of padding and the gaps read far wider than the 1rem actually set.
    check('and the body inside the card adds no padding of its own',
        /\.timer-mosaic__cell > \.card-body \{[^}]*padding: 0/.test(journalCss),
        'a second inset inside the first is what made the panels look scattered');
    check('the header is the daily log\'s too',
        /\.timer-mosaic__cell > \.card-header \{[\s\S]*?border-bottom: 1px solid #ffffff14/.test(journalCss));
    check('and no panel nests a second padded block inside the card',
        !/className="timer-block"/.test(timer), 'one background per container, not two');
}

console.log('\n== focus mode survives a refresh ==');
{
    // Seeded from storage rather than starting off. A lazy initialiser, so the
    // first frame is already the centred clock -- the alternative is laying the
    // whole page out and then flipping it, which is the flash this is avoiding.
    check('it is seeded from what was left, not from a bare false',
        /useState\(readFocusMode\)/.test(timer)
        && !/useState\(false\)/.test(timer),
        'a refresh must not put the clock back in the corner');
    // And written back from an effect on the state, not from inside the click
    // handler. The setter is where the value is decided; the write is the side
    // effect of having decided it, and doing it here means the stored copy cannot
    // drift from what is on screen.
    check('and it is written back whenever it changes',
        /useEffect\(\(\) => \{ writeFocusMode\(focusMode\); \}, \[focusMode\]\)/.test(timer));
    // Turning it off has to stick as firmly as turning it on, so "off" is the
    // absence of the key rather than a stored 'off' that an older read could
    // mistake for the default.
    check('turning it off removes the key rather than storing a false',
        /removeItem\(FOCUS_KEY\)/.test(timer));
    // Its own key. The engine's blob is the *run* -- rewritten on every state
    // change, holding a deadline, read before the page renders -- and a display
    // preference has no business in the record of what the timer did.
    check('it has a key of its own, separate from the run',
        /const FOCUS_KEY = 'anthroweb:timer:focus'/.test(timer)
        && !/FOCUS_KEY = 'anthroweb:timer:v1'/.test(timer));
    // Both reads guarded. Private mode and a full quota are real states, and
    // throwing on mount over a display preference would take the whole page with
    // it -- so the guard and the catch have to be on the read *and* the write.
    check('and storage failure cannot break the page',
        (timer.match(/typeof localStorage === 'undefined'/g) || []).length === 2
        && (timer.match(/catch \{/g) || []).length >= 2,
        'one guard and one catch each, for the read and the write');
}

console.log('\n== focus mode is centred at every size ==');
{
    // The stage is already a flex column with `justify-content: center`, so
    // centring is entirely a question of it *having* a height to centre within.
    check('the display column centres its content',
        /\.timer-stage \{[^}]*flex-direction: column[^}]*justify-content: center/s.test(journalCss)
        || (/\.timer-stage \{/.test(journalCss)
            && /justify-content: center/.test(
                /\.timer-stage \{[^}]*\}/.exec(journalCss)?.[0] ?? '')),
        'the stage centres only if something gives it height');

    // Below 1024px a media block sets `min-height: 0 !important` on the stage and
    // the body, so the page scrolls rather than trapping a nested scroll area.
    // `!important` beats any selector, so focus mode -- which has no mosaic to
    // reach and nothing below the fold -- has to opt back out with the same
    // weapon or the clock sits at the top of every phone.
    const release = /@media \(max-width: 1023px\)[\s\S]*?\.timer-section,[\s\S]*?\{([^}]*)\}/.exec(journalCss)?.[1] ?? '';
    check('the small-screen height release exists, and is what focus mode has to fight',
        /min-height: 0 !important/.test(release),
        'if this ever loses its !important, the counter-rule below can drop it too');
    check('focus mode restores its height below that breakpoint',
        /@media \(max-width: 1023px\)[\s\S]*?\.timer-page-wrapper--focus \.timer-stage\s*\{[^}]*min-height[^}]*!important/.test(journalCss),
        'without !important this loses to the rule it is correcting');
    check('it restores the whole chain, not just the stage',
        /@media \(max-width: 1023px\)[\s\S]*?\.timer-page-wrapper--focus \.timer-section,[\s\S]*?\.timer-page-wrapper--focus \.timer-stage\s*\{[^}]*min-height[^}]*!important/.test(journalCss),
        'the section and card are released too, and a collapsed chain takes the stage floor with it');
    // The release block also sets `flex: none`, which takes the body and the stage
    // out of flex layout entirely -- so neither can stretch even with a height.
    check('and puts them back in flex layout, so they can stretch',
        /@media \(max-width: 1023px\)[\s\S]*?\.timer-page-wrapper--focus \.timer-body,\s*\.timer-page-wrapper--focus \.timer-stage\s*\{[^}]*flex: 1 !important/.test(journalCss),
        'flex: none from the release block stops the stage filling the chain');
    // `dvh` and not `svh`, and on the wrapper too. `svh` is the chrome-expanded
    // height, so a clock centred in `svh` sits above centre once the chrome
    // retracts. Worse, a `svh` wrapper around a `dvh` chain is taller than that
    // chain by exactly the difference between the two units, and the chain sits at
    // the top of it -- the same top-pinned clock by a different route.
    check('using the dynamic height, so it tracks the browser chrome',
        /calc\(100dvh - 2rem\)/.test(journalCss)
        && /\.timer-page-wrapper--focus \{[^}]*min-height: 100dvh/.test(journalCss),
        'svh is the chrome-expanded height; a svh wrapper around a dvh chain is taller than the chain');

    // The chain itself, all four elements. Centring happens *inside* the stage,
    // so a stage that does not fill the chain has nothing to centre within -- and
    // each element has to carry the floor, because the small-screen block releases
    // all four.
    check('every element in the chain is given the height to fill',
        /\.timer-page-wrapper--focus \.timer-section,\s*\.timer-page-wrapper--focus \.timer-card,\s*\.timer-page-wrapper--focus \.timer-body,\s*\.timer-page-wrapper--focus \.timer-stage \{[^}]*min-height: calc\(100dvh - 2rem\)/s.test(journalCss));
    check('and the stage stretches, rather than riding the top of the body',
        /\.timer-page-wrapper--focus \.timer-stage \{[^}]*align-self: stretch/s.test(journalCss),
        'the wide-screen layout sets this grid item to align-self: start');

    // No cap on the container, at any height. This was here, and it is what broke
    // a vertical monitor: centring happens inside the container, so a container
    // shorter than the viewport centres perfectly and then sits wherever that box
    // sits -- which is the top. A portrait monitor misses the max-width rules and
    // hits the min-height one, so 1200x2560 got a 736px container on a 2560px page.
    check('the container is never capped, however tall the viewport is',
        !/min-height: min\(calc\(100dvh/.test(journalCss)
        && !/\.timer-page-wrapper--focus[^{]*\{[^}]*min-height: [\d.]+rem/.test(journalCss),
        'a capped container centres correctly inside itself and sits at the top of the page');
    check('and what is bounded on a tall viewport is the ring, not the space around it',
        /\.timer-page-wrapper--focus \.timer-display \{[^}]*width: clamp\(260px, 46vw, 640px\)/.test(journalCss));

    // A window that is short rather than narrow -- a phone sideways, a half-height
    // desktop window. The ring is square, so it is bounded by the shorter axis,
    // and the digits are sized off `vw`, which cannot see the height at all.
    check('a short viewport bounds the ring by the short axis',
        /@media \(max-height: 34rem\)[\s\S]*?\.timer-display \{[^}]*min\(46vw, 26rem, calc\(100dvh/.test(journalCss),
        'a square element sized from vw alone overflows a short window');
    check('and the digits with it',
        /@media \(max-height: 34rem\)[\s\S]*?\.timer-digits \{[^}]*font-size: clamp/.test(journalCss));
}

console.log('\n== the four containers, in two columns ==');
{
    // Two columns on the right, by the Daily Log's own arrangement rather than a
    // restatement of it. `.daily-log-puzzle` *is* the two-column grid and
    // `.daily-log-col` is a column that packs its cards independently, so the
    // element carries them as well and this page inherits the grid, its `1rem`
    // gap, its phone fallback and the packing behaviour outright. Restating them
    // here is how the two drifted apart and the page ended up looking like the
    // daily log while behaving like something else.
    check('the mosaic is the daily log\'s puzzle, not a copy of it',
        /className="timer-mosaic daily-log-puzzle"/.test(timer),
        'the real class, so a change there lands here too');
    check('and it is arranged in two columns',
        (timer.match(/className="daily-log-col"/g) || []).length === 2);
    check('the timer does not restate the grid',
        !/grid-template-columns/.test(
            (/\.timer-mosaic \{[^}]*\}/.exec(journalCss)?.[0] ?? '')),
        'a restatement is what drifted in the first place');
    check('it only adds the scrolling the sticky clock needs',
        /\.timer-mosaic \{[^}]*overflow-y: auto/.test(journalCss));

    // Reading order is down the left column and then down the right, which is
    // what those two classes already mean. So the order that matters is the order
    // the containers appear in the file, and it has to be read out of the file to
    // be worth asserting.
    const order = [];
    for (const match of timer.matchAll(/<ModeCard\b[\s\S]*?mode="([a-z]+)"|<AlarmsPanel\b/g)) {
        order.push(match[1] ?? 'alarms');
    }
    check('countdown and stopwatch down the left, then alarms and intervals',
        JSON.stringify(order) === JSON.stringify(['countdown', 'stopwatch', 'alarms', 'interval']),
        order.join(' → '));
    check('so the alarms are the next thing read after the stopwatch',
        order[1] === 'stopwatch' && order[2] === 'alarms');
    // Appended at the end of the file instead, this container would have landed
    // under the countdown -- which is where it went wrong before.
    check('and the column boundary is between the stopwatch and the alarms',
        /<ModeCard\b[\s\S]*?mode="stopwatch"[\s\S]*?<\/ModeCard>[\s\S]*?<\/div>\s*(?:\{[\s\S]*?\})?\s*<div className="daily-log-col">[\s\S]*?<AlarmsPanel\b/.test(timer)
        || timer.indexOf('</div>\n\n                                {/*') > timer.indexOf('mode="stopwatch"'));

    // The alarms card is not a mode card: an alarm is not a mode, so it has no
    // "Use" switch and is never dimmed.
    check('the alarms card is not a mode card', !/mode="alarm"/.test(timer));
    check('nothing mounts a settings card', !/SettingsPanel/.test(timer));
}

console.log('\n== the alarm form asks the questions it should ==');
{
    const alarmsPanel = code('src/Components/Timer/AlarmsPanel.tsx');
    const service = code('src/services/timerService.ts');

    // No sound picker. One chime, so the four-button picker could only ever be
    // answered the same way, and it was in two places.
    check('the alarm form has no sound picker',
        !/timer-sound/.test(alarmsPanel) && !/setSound/.test(alarmsPanel)
        && !/CHIMES/.test(alarmsPanel));
    // Scoped to `AlarmDraft` rather than the whole service: `TimerAlarm.sound`
    // stays, because it is the row the database hands back and the column is still
    // there. What is gone is the ability to *choose* one.
    const draft = /export interface AlarmDraft \{([^}]*)\}/.exec(service)?.[1] ?? '';
    check('and the draft carries no sound to choose',
        draft.length > 0 && !/sound/.test(draft),
        'a required field with one legal value is not a field');
    // Written explicitly rather than left to the column default, so a row still
    // carrying a retired id is normalised on its next edit.
    check('the column is written as the one sound that exists',
        /sound: 'chime' as ChimeId/.test(service));
    check('and the picker\'s styling is gone rather than left unused',
        !/^\.timer-sound/m.test(journalCss) && !/^\.timer-sounds/m.test(journalCss),
        'a styled picker with nothing behind it is the next thing somebody wires up');

    // One-shot, as a named choice. The data has always supported it -- an empty
    // day list is a single firing -- but the only way to get one was to click all
    // seven days off, which is not a thing you can tell you have done.
    check('repeating is a choice with two named options',
        /Every week/.test(alarmsPanel) && /Once/.test(alarmsPanel));
    check('and it is a real control, pressed either way',
        /aria-pressed=\{days\.length > 0\}/.test(alarmsPanel)
        && /aria-pressed=\{days\.length === 0\}/.test(alarmsPanel),
        'two buttons with no pressed state are labels');
    check('the one-shot sets an empty day list, which is what the scheduler reads',
        /onClick=\{\(\) => setDays\(\[\]\)\}/.test(alarmsPanel));
    // Coming back from one-shot has to land on something, or "Every week" is a
    // button that turns a repeating alarm into a silent one.
    check('and switching back gives it days rather than none',
        /setDays\(days\.length > 0 \? days : \[\.\.\.DEFAULT_DAYS\]\)/.test(alarmsPanel));
    check('the day picker only shows when it is being asked about',
        /\{days\.length > 0 \? \(/.test(alarmsPanel),
        'seven buttons nobody was asked to use are clutter');
    check('and a one-shot says what once means',
        /Fires once, at the next time it comes round/.test(alarmsPanel));
    // The empty list has to mean one-shot to whoever schedules it, which is a
    // property of the arithmetic rather than of this form.
    check('and an empty day list really is a single firing',
        /describeAlarmDays\(\[\]\) === 'Once'/.test(
            readFileSync(new URL('verify-timer.mjs', import.meta.url), 'utf8')),
        'otherwise "Once" on the button would be a promise the scheduler keeps wrong');

    // The row's own alignment, and the reason it cannot go back to the borrowed
    // one. `.course-head` is `align-items: flex-start`, so a one-line right-hand
    // group sat against the top of a three-line left-hand one -- the switch and
    // the countdown were level with the time rather than with the row.
    check('an alarm row does not borrow the academic page\'s row',
        !/course-head/.test(alarmsPanel) && !/course-row/.test(alarmsPanel));
    check('it centres both groups against each other',
        /\.timer-alarm-row \{[^}]*display: flex[^}]*align-items: center/.test(journalCss),
        'align-items: flex-start is what put the switch at the top of the row');
    check('with the countdown and the switch as one group, so neither drifts',
        /\.timer-alarm-row__right \{[^}]*align-items: center/.test(journalCss)
        && /\.timer-alarm-row__actions \{[^}]*align-items: center/.test(journalCss));
    // Rows of equal height, or the column reads as a ragged stack rather than a
    // list -- which is what happened when the height came from padding alone.
    check('rows are a fixed minimum height rather than padding alone',
        /\.timer-alarm-row \{[^}]*min-height/.test(journalCss));
    // The countdown ticks every second and the time does not, so without tabular
    // figures the row twitches once a second.
    check('the countdown beside the time has tabular figures',
        /\.timer-row__when \{[^}]*font-variant-numeric: tabular-nums/.test(journalCss));
    // Tabbing to the switch used to go nowhere visible.
    check('the row\'s controls have a visible focus ring',
        /\.timer-alarm-row :is\(\.timer-switch, \.book-action-btn\):focus-visible/.test(journalCss));
    // And it does not promise to be clickable, because only its controls are.
    check('and a hover is held back rather than absent',
        /\.timer-alarm-row:hover/.test(journalCss));
    check('a phone wraps the row instead of crushing it',
        /@media \(max-width: 480px\)[\s\S]*?\.timer-alarm-row \{[^}]*flex-wrap: wrap/.test(journalCss));
    check('and the empty state says where the button is',
        /No alarms set\. Use the \+ above/.test(alarmsPanel));
}

console.log('\n== every container is built the same way ==');
{
    const intervalEditor = code('src/Components/Timer/IntervalEditor.tsx');
    const alarmsPanel = code('src/Components/Timer/AlarmsPanel.tsx');

    // Two shapes, deliberately. The three mode cards get their header from the
    // shared `ModeCard`, so the interval editor contributes fields and nothing
    // else -- a header of its own would be a second copy of a title three lines
    // above it. The alarms card has no `ModeCard` around it, so its panel brings
    // the header itself, and must use the same one.
    check('the interval editor renders no panel of its own',
        !/timer-block/.test(intervalEditor), 'a container inside a container');
    check('and no header either -- the card above it already has one',
        !/card-header/.test(intervalEditor) && !/card-title/.test(intervalEditor),
        'a second copy of the name three lines up');

    check('the alarms panel renders no panel inside the card',
        !/timer-block/.test(alarmsPanel), 'a container inside a container');
    check('and uses the daily log\'s card header, since its card has none of its own',
        /className="card-header"/.test(alarmsPanel) && /className="card-title"/.test(alarmsPanel));
    check('titled with text alone',
        /<h3 className="card-title">Alarms<\/h3>/.test(alarmsPanel),
        'no glyph in front of the name');

    check('no container nests another, anywhere on the page',
        !/className="timer-block"/.test(timer));

    // No glyphs in the page's own card titles either. Matched against the import
    // line rather than the whole file: "Repeat" is also an English word, and it is
    // the label on the alarm form's day picker, so a whole-file search for the
    // icon name reports a failure on a perfectly good heading.
    const icons = ['TimerIcon', 'Volume2', 'Repeat', 'Waves', 'BellRing', 'AlarmClock'];
    const importedGlyphs = source =>
        (source.match(/import \{([^}]*)\} from 'lucide-react'/) ?.[1] ?? '')
            .split(',').map(name => name.trim()).filter(Boolean);
    const cardTitles = [...timer.matchAll(/<h3 className="card-title">([\s\S]*?)<\/h3>/g)]
        .map(match => match[1]);
    check('every container title on the page is text alone',
        cardTitles.length === 1 && cardTitles.every(title => !/size=\{/.test(title)),
        cardTitles.map(title => title.replace(/\s+/g, ' ').trim()).join(' | '));
    check('and no glyph is imported for one',
        icons.every(icon => !importedGlyphs(timer).includes(icon)
            && !importedGlyphs(alarmsPanel).includes(icon)),
        [...importedGlyphs(timer), ...importedGlyphs(alarmsPanel)].join(', '));

    // The title size, compared against the daily log's own declaration rather than
    // against a number restated here. A title at a different size from its
    // neighbours is what makes a row of cards read as unrelated panels.
    const dailyTitle = /\.daily-log-form \.card-title \{([^}]*)\}/.exec(journalCss)?.[1] ?? '';
    const timerTitle = /\.timer-mosaic__cell > \.card-title \{([^}]*)\}/.exec(journalCss)?.[1] ?? '';
    check('a card title rule exists for the cells', timerTitle.length > 0);
    for (const property of ['font-size', 'font-family', 'font-weight', 'text-transform', 'letter-spacing']) {
        const expected = dailyTitle.match(new RegExp(`${property}:\\s*([^;]+)`))?.[1]?.trim();
        const actual = timerTitle.match(new RegExp(`${property}:\\s*([^;]+)`))?.[1]?.trim();
        check(`and its ${property} matches the daily log's`,
            !!expected && expected === actual, `${actual} vs ${expected}`);
    }
    // The smaller one is gone rather than merely unused, because a leftover
    // `.timer-block__title` at 0.7rem is the next thing somebody will reach for.
    check('the smaller block title is not what any container uses',
        !/timer-block__title/.test(timer)
        && !/timer-block__title/.test(intervalEditor)
        && !/timer-block__title/.test(alarmsPanel));

    // The `±300s` steppers. Three pairs of buttons to nudge numbers that were
    // already typeable in the field above them.
    check('the interval steppers are gone',
        !/step=\{/.test(intervalEditor) && !/\+\{step\}s/.test(intervalEditor)
        && !/btn-action/.test(intervalEditor));

    // The scheduled start is back, in a row of its own, and this is the check that
    // keeps it honest about why: a field with a control and no reader is worse than
    // no field, because typing into it appears to work. So the markup is not the
    // thing being asserted -- the reader on the other side of it is, in
    // `verify-timer`. Here it is only worth asserting that it is not a native time
    // input, which renders in the browser's own 12/24-hour convention with no
    // attribute to override it, and came out as "00:00 AM" on a 12-hour device.
    check('and the scheduled start is two typed fields, not a native time input',
        !/type="time"/.test(intervalEditor)
        && /interval-start-hour/.test(intervalEditor)
        && /interval-start-minute/.test(intervalEditor));

    // Which is the alignment fix. The two halves sat at different heights because
    // one label was `sr-only`: a visually hidden label is taken out of flow and
    // contributes no height, so the input under it started a line higher than its
    // partner. Equal structure lines the inputs up; equal wording is neither needed
    // nor what was missing.
    check('and both halves carry a visible label, which is what lines them up',
        /className="form-label" htmlFor="interval-start-hour"/.test(intervalEditor)
        && /className="form-label" htmlFor="interval-start-minute"/.test(intervalEditor),
        'an sr-only label takes no vertical space, so its input rides a line higher');
    check('and there is no visually hidden label anywhere in the card',
        !/className="sr-only"/.test(intervalEditor));

    // Seven fields: three durations through the shared `Field`, two counts, two
    // halves of the schedule -- five visible labels in the source for the three
    // durations counted once.
    check('every field in the interval card has a visible label',
        (intervalEditor.match(/className="form-label"/g) ?? []).length === 5
        && (intervalEditor.match(/<Field\b/g) ?? []).length === 3,
        'a visually hidden label is what left the two halves at different heights');
    check('and the grid holds them in rows of three, two and two',
        (intervalEditor.match(/className="timer-field-grid"/g) ?? []).length === 3);

    // The limitation is stated where the control is set, not buried in a readme. A
    // scheduled start needs the page open, and a control that appears to work and
    // quietly does not is the exact failure the dead field used to be.
    check('and the card says plainly that it needs the page open',
        /Keep this page open/.test(intervalEditor));
    check('and says when it will run, in the one time format the page uses',
        /Starts on its own at/.test(intervalEditor)
        && /formatAlarmTime\(/.test(intervalEditor),
        'a wall-clock time rendered any other way is how "00:00 AM" happened');
}

console.log('\n== no rule across the top of the page ==');
{
    // An empty `.timer-header` left behind when the world-clock panel it once held
    // was removed. An empty element carrying a `border-bottom` is not invisible:
    // it drew a line across the top of the page, sitting on the first row of cards
    // with nothing above it to belong to.
    check('the empty header element is gone',
        !/timer-header/.test(timer), 'and nothing was left in its place');
    check('and so is the rule it drew',
        !/^\.timer-header \{/m.test(journalCss));
    check('nothing else draws a border across the page either',
        !/\.timer-card \{[^}]*border-top/.test(journalCss));

    // The clock it used to hold is not lost with it -- it lives in the display
    // column now, which is where a running page has room for it.
    check('the wall clock moved rather than disappeared',
        /<time className="timer-clock__now"/.test(timer));
    check('and still has tabular figures, so it does not twitch every minute',
        /\.timer-clock__now \{[^}]*font-variant-numeric: tabular-nums/.test(journalCss));
}


console.log('\n== the laps read as a table ==');
{
    check('a lap row is its own element, not a borrowed course row',
        /'timer-lap'/.test(timer) && !/course-row|course-head|course-title/.test(timer),
        'the Academic page\'s row markup is why a list of numbers looked like coursework');
    check('split and total are separate columns',
        /timer-lap__split/.test(timer) && /timer-lap__total/.test(timer));
    check('with headings above them',
        /timer-laps__head/.test(timer));
    // Both columns are `1fr` rather than `auto`: an auto column is sized by the
    // longest value seen so far, so the table would jump sideways the first time
    // somebody marked a long lap.
    check('and the columns are fixed, so a long split cannot shift the table',
        /grid-template-columns: 2\.2rem 1fr 1fr/.test(journalCss));
    check('the extremes mark the whole row, not one number in it',
        /\.timer-lap--best \{[\s\S]*?background/.test(journalCss)
        && /\.timer-lap--slow \{[\s\S]*?background/.test(journalCss));
    // With one lap, best and slowest are the same number, so there is no
    // comparison to summarise.
    check('and the fastest/slowest note only appears once there is something to compare',
        /\{laps\.length > 1 && \(/.test(timer));
}

console.log('\n== switching mode cannot stop a running timer ==');
{
    const setMode = /const setMode[\s\S]*?\n    \}, \[\]\);/.exec(engine)?.[0] ?? '';
    check('setMode was found', setMode.length > 40, `matched ${setMode.length} chars`);
    // "Cannot stop a running timer" is the property; `prev.running` on its own
    // was never it. Stored `running` stays true after a run *ends* -- on purpose,
    // so a loaded run survives a reload -- so testing it directly refused the
    // switch forever afterwards, with the buttons looking enabled. The guard has
    // to ask whether there is still time left, which is what `runHasEnded` is.
    check('it refuses while there is time left to run',
        /prev\.running && !runHasEnded\(prev, at\)/.test(setMode),
        setMode.slice(0, 200));
    // The clearing that comes with the new state is the *abandoned run*, not a
    // stopped one: it is on the same branch as the deadline and the elapsed time,
    // so it can only ever be reached once the guard has already established there
    // is nothing left to lose. `verify-timer.mjs` drives both directions.
    check('and what it does write abandons the run rather than stopping it',
        /running: false, deadline: null/.test(setMode), setMode.slice(-260));

    // The refusal has to be visible, not just enforced. The control that selects a
// mode moved from a chip strip above a single set of fields into each mode's own
// card header, so the check moved with it -- but the thing being asserted is the
// same one: the switch is disabled mid-run, and says why.
const modeCard = /const ModeCard[\s\S]*?<\/section>/.exec(timer)?.[0] ?? '';
check('ModeCard was found', modeCard.length > 40, `matched ${modeCard.length} chars`);
check('its switch is disabled while running', /disabled=\{running\}/.test(modeCard));
check('with a tip explaining why',
    /data-tip=\{running \? 'Pause to change the mode'/.test(modeCard), modeCard.slice(-260));
check('and each of the three cards is a card of its own',
    /<ModeCard\b/.test(timer)
    && (timer.match(/<ModeCard\b/g) || []).length === 3,
    `${(timer.match(/<ModeCard\b/g) || []).length} cards`);
check('one per mode, and every one is always mounted',
    ['countdown', 'stopwatch', 'interval'].every(mode => new RegExp(`mode="${mode}"`).test(timer)));
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);