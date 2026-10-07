/**
 * Checks that a custom habit can be renamed, and removed, from its own row.
 *
 * Four things had to hold together for this, and each of them fails quietly:
 *
 *  - `unique_user_habit (user_id, name)` counts removed habits, because removal is
 *    a soft delete. A rename onto a name that is taken arrives as a bare 409 from
 *    PostgREST, which the page used to `console.error` and swallow -- so the row
 *    silently kept its old name and the reader was told nothing.
 *
 *  - `daily_habit_logs` records `habit_id` and never the name, so a rename must not
 *    touch a log, and the ticks on screen must not be disturbed.
 *
 *  - The rename field cannot live inside the row's `<label>`: a text field in
 *    there ticks the checkbox as well as taking the click.
 *
 *  - The row is right clicked now, and a menu portalled out of the tree is outside
 *    the element an outside-click handler would have tested.
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

const service = code('src/services/habitService.ts');
const logService = code('src/services/dailyLogService.ts');
const hooks = code('src/hooks/useHabitData.ts');
const page = code('src/Pages/DailyLogPage.tsx');
const modal = code('src/Components/DailyLog/HabitEditorModal.tsx');
const menu = code('src/Components/ContextMenu.tsx');
const menuHook = code('src/Components/useContextMenu.ts');
const css = read('src/index.css').replace(/\/\*[\s\S]*?\*\//g, '');
const sql = read('sql.sql');

console.log('\n== renaming writes the name and nothing else ==');
{
    check('there is an update for a habit', /export const updateHabit/.test(service));
    check('it stamps updated_at, as every other service does',
        /updated_at: new Date\(\)\.toISOString\(\)/.test(service));
    check('and is scoped to the caller\'s own row',
        /\.eq\('user_id', userId\)/.test(service));
    // Sorted by created_at, not updated_at -- so stamping it cannot reorder the list.
    check('and habits are not ordered by the column it stamps',
        !/order\('updated_at'/.test(service));
}

console.log('\n== a name already in use is refused, in words ==');
{
    check('the table is asked, not the loaded list', /\.from\('habits'\)[\s\S]{0,220}?\.eq\('name', name\)/.test(service));
    // The loaded list is only ever the active habits, so it cannot see this one.
    check('and a removed habit is not excluded from the check',
        !/clash[\s\S]{0,200}?is_active/.test(service));
    check('the row being renamed is excluded from its own clash',
        /\.neq\('id', id\)/.test(service));
    check('a clash is refused before the write, with a sentence',
        /throw new Error\(`There is already a habit called/.test(service));
    // Unique on (user_id, name) -- the reason any of this is needed.
    check('the constraint that motivates it is in the schema',
        /UNIQUE \(user_id, name\)/.test(sql));
    check('and removal is a soft delete, so removed names still hold their slot',
        /update\(\{ is_active: false \}\)/.test(service));
}

console.log('\n== no log is touched ==');
{
    check('the update writes only the habits table', /\.from\('habits'\)[\s\S]*?\.update\(/.test(service));
    check('and never the daily logs',
        !/updateHabit[\s\S]{0,600}?from\('daily_habit_logs'\)[\s\S]{0,80}?\.update\(/.test(service));
}

console.log('\n== the row ==');
{
    check('a double click starts a rename', /onDoubleClick=\{\(\) => beginRename\(habit\)\}/.test(page));
    check('a right click opens the shared menu',
        /onContextMenu=\{event =>\s*habitMenu\.openFromEvent\(/.test(page));
    // The field and the name swap places rather than nest, because a field inside
    // this label would tick the checkbox on every click in it.
    check('the field replaces the name, inside the label',
        /renameId === habit\.id \? \(\s*<input[\s\S]*?className="habit-row-edit"/.test(page));
    // A field inside the row's `<label>` would tick the checkbox on every click in
    // it. The field is a sibling of the checkbox, inside the one label -- so the row
    // has exactly one label and no label within it.
    const habitRow = /\{habits\.map\(\(habit\) => \(([\s\S]*?)\)\)\}/.exec(page)?.[1] ?? '';
    check('the habit row was found', habitRow.length > 0);
    check('the row has one label, and no label inside it',
        (habitRow.match(/<label/g) ?? []).length === 1 && !/<label[\s\S]*<label/.test(habitRow));
    check('and the field sits in it, beside the checkbox',
        /habit-row-edit/.test(habitRow)
        && habitRow.indexOf('checkbox-input') < habitRow.indexOf('habit-row-edit'));
    check('Enter saves and Escape abandons',
        /event\.key === 'Enter'/.test(page) && /event\.key === 'Escape'/.test(page));
    check('a blur saves, and only once',
        /onBlur=\{commitRename\}/.test(page) && /renameCommittedRef/.test(page));
    check('an empty name is not written', /if \(!name\) return;/.test(page));
    // The delete affordance moved into the menu, so the row is no longer a row with
    // an ✕ on the end of it.
    check('the row no longer carries its own remove button',
        !/aria-label=\{`Remove \$\{habit\.name\}`\}/.test(page));
    check('the row still reaches remove where there is no right click',
        /habit-row-more/.test(page));
    check('and that button is only drawn where hover does not exist',
        /@media \(hover: none\)[\s\S]{0,120}?\.habit-row-more/.test(css));
}

console.log('\n== the menu ==');
{
    check('rename comes first and remove after a hairline',
        /id: 'rename'/.test(page) && /id: 'remove'/.test(page) && /separatorBefore: true/.test(page));
    check('remove is marked destructive', /danger: true/.test(page));
    check('and it still asks before it does anything',
        /onSelect: \(\) => setDeleteTarget\(habit\)/.test(page) && /<ConfirmModal/.test(page));
    check('the menu is portalled to <body>',
        /createPortal\([\s\S]*context-menu[\s\S]*document\.body/.test(menu));
    check('its surface is the one every other panel uses',
        /className="popover context-menu"/.test(menu) && /\.popover \{/.test(css));
    check('and its rows are the settings menu\'s rows',
        /className=\{`sidebar-menu-item context-menu-item/.test(menu)
        && /\.sidebar-menu-item \{/.test(css));
    // Portalled means outside the row that opened it, so `contains` cannot be the
    // only test: the panel has to be checked by its own ref.
    check('the outside-click handler checks the panel itself',
        /panelRef\.current\?\.contains\(target\)/.test(menu));
    check('dismissal is captured, so a row cannot swallow it',
        /addEventListener\('mousedown', onDown, true\)/.test(menu));
    check("the browser's own menu is suppressed", /event\.preventDefault\(\)/.test(menuHook));
    check('the hook and the component are in separate files, or Fast Refresh breaks',
        !/export const useContextMenu/.test(menu) && /export const useContextMenu/.test(menuHook));
    check('the menu closes on scroll and resize, being viewport-fixed',
        /addEventListener\('scroll', onViewport, true\)/.test(menu)
        && /addEventListener\('resize', onViewport\)/.test(menu));
}

console.log('\n== the full edit ==');
{
    check('the right click opens a dialog with both fields',
        /setEditingHabit\(habit\)/.test(page) && /<HabitEditorModal/.test(page));
    check('the dialog edits the name', /id="habit-name"/.test(modal));
    check('and the description', /id="habit-description"/.test(modal));
    check('with the same limits as the add form beside it',
        /maxLength=\{50\}/.test(modal) && /maxLength=\{100\}/.test(modal));
    check('a refused save keeps the dialog open with the text in it',
        /setHabitEditError\(/.test(page) && /role="alert"/.test(modal));
    check('and the description is cleared rather than stored as whitespace',
        /description\.trim\(\) \|\| null/.test(modal));
    // The page autosaves the day's log on a timer keyed on this list; a rename
    // field in it would write the whole log every two seconds while typing. Read
    // the effect's own dependency array rather than the file, or any later mention
    // of a rename would look like one. Anchored on the debounce itself, because the
    // "add a custom habit" fields that used to sit in this list are gone too -- they
    // were never part of the day's log, and they wrote a column each on every
    // keystroke of a habit name.
    const autosaveDeps = /scheduleSave\(600\);[\s\S]*?\n    \}, \[([^\]]*)\]\);/.exec(page)?.[1] ?? '';
    check('the autosave dependency list was found', autosaveDeps.length > 0);
    check('the rename fields are not in it',
        !/\brenameValue\b/.test(autosaveDeps) && !/\brenameId\b/.test(autosaveDeps)
        && !/\beditingHabit\b/.test(autosaveDeps) && !/\bhabitEditError\b/.test(autosaveDeps),
        autosaveDeps.trim());
    check('nor is the form that creates a custom habit',
        !/\bcustomHabitName\b/.test(autosaveDeps) && !/\bcustomHabitDesc\b/.test(autosaveDeps),
        autosaveDeps.trim());
}

console.log('\n== a habit tick is written where it is ticked ==');
{
    // The tick used to reach the database only through an effect that flushed the
    // whole row. Two things went wrong: it waited out the debounce (so a refresh
    // inside that window lost it), and the effect could not tell a tick from the
    // form being filled in from the server -- so it wrote the server's own snapshot
    // straight back over the tick whenever the restored cache was out of date.
    check('there is a service call that writes one habit column',
        /export const setDailyLogHabit/.test(logService));
    check('it upserts on the (user_id, log_date) unique index, so the day is created if needed',
        /setDailyLogHabit[\s\S]*?onConflict: 'user_id,log_date'/.test(logService));
    check('and it sends only the habit, not the whole row',
        /\{ user_id: userId, log_date: logDate, \[habit\]: completed \}/.test(logService));
    check('the checkbox calls it directly',
        /habitCheckbox\(morningRoutine, 'morning_routine', setMorningRoutine,/.test(page)
        && /habitCheckbox\(projectWorkDone, 'project_work_done', setProjectWorkDone,/.test(page)
        && /saveBuiltinHabit\(column, e\.target\.checked, setValue\)/.test(page));
    check('and the whole-row flush on any habit change is gone',
        !/\}, \[morningRoutine[^\]]*flushSave/.test(page));
    check('no habit state changes reaches the database only through a debounce',
        /void setDailyLogHabit\(logDate, column, value\)/.test(page));
    // Nothing distinguishes "the user ticked this" from "the server told us this",
    // so a flush cannot be a reliable trigger. The tick has to be the trigger.
    check('a failed write puts the checkbox back',
        /setValue\(!value\)/.test(page));
    check('and the page says whether the write has landed',
        /habitSaveState === 'saving'/.test(page) && /habitSaveState === 'saved'/.test(page));
    // A restored query cache is only safe to render if fresh data can still replace
    // it. With the default staleTime a refresh inside it never asked the server, and
    // the snapshot it did render became the thing the autosave wrote back.
    check('the day\'s log refuses to trust a restored snapshot',
        /queryKeys\.dailyLogByDate[\s\S]{0,220}?staleTime: 0/.test(page));
    check('and the form waits for the server before it is filled from that snapshot',
        /if \(dayLogFetching\) return;/.test(page));
    // Two whole-row writes carrying snapshots taken at different times could reach
    // Postgres out of order, so the older one won and the newer edit was lost.
    check('whole-row writes are queued rather than fired together',
        /saveChainRef\.current\.then\(run, run\)/.test(page));
}

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);