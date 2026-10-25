/**
 * Checks the one habit editor on the Daily Log.
 *
 * The page used to have three different ways into a habit: a double click for a
 * quick rename, a right-click menu with five separate actions, and a second
 * priority-only dialog for built-ins. The built-ins -- the checkboxes that ship
 * with the app -- could have their priority changed but not their name, their
 * schedule or their polarity, because they are not rows in `habits` and the menu
 * had nowhere to write those things.
 *
 * Now there is one editor, opened by the one Edit item in the menu. These checks
 * hold the parts that fail quietly: the override storage, the distinction between
 * built-in and custom saves, and the fact that a custom habit's remove action
 * lives inside the editor rather than in the context menu.
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
const profile = code('src/services/profileService.ts');
const page = code('src/Pages/DailyLogPage.tsx');
const modal = code('src/Components/DailyLog/HabitEditorModal.tsx');
const scoring = code('src/utils/dailyScoring.ts');
const menu = code('src/Components/ContextMenu.tsx');
const menuHook = code('src/Components/useContextMenu.ts');
const css = read('src/index.css').replace(/\/\*[\s\S]*?\*\//g, '');
const sql = read('sql.sql');

console.log('\n== built-in habits have somewhere to store their overrides ==');
{
    check('the settings column exists',
        /habit_settings jsonb/.test(read('supabase/migrations/0031_habit_settings.sql')));
    check('the profile type carries a name, not only scoring fields',
        /export interface HabitSetting \{[\s\S]*?name\?: string;[\s\S]*?description\?: string \| null;/s.test(profile));
    check('the settings type exposes the override map',
        /habit_settings\?: Record<string, HabitSetting> \| null/.test(profile));
    // Conditional, because most callers build a settings object for one screen
    // and do not carry habit overrides at all. An unconditional write would erase
    // them whenever somebody saved their profile.
    check('creating a row writes habit settings',
        /createUserSettings[\s\S]*?habit_settings: settings\.habit_settings/.test(profile));
    check('updating omits them when the caller did not supply them',
        /settings\.habit_settings !== undefined\s*\?\s*\{ habit_settings: settings\.habit_settings \}/s.test(profile)
        || /\.\.\.\(settings\.habit_settings !== undefined\s*\n?\s*\? \{ habit_settings: settings\.habit_settings \}/s.test(profile));
}

console.log('\n== one menu, one Edit ==');
{
    check('the built-in row has a menu', /onContextMenu=\{event =>/.test(page));
    check('the built-in menu contains Edit and nothing else',
        /const builtinHabitMenu = useCallback[\s\S]*?\[?\s*\{[\s\S]*?id: 'edit'[\s\S]*?\}\s*\]?\s*, \[openBuiltinHabitEditor\]\)/.test(page));
    check('a custom row uses the same single item builder',
        /habitMenu\.openFromEvent\([\s\S]*?\[editMenuItem\(habit\)\]/.test(page));
    check('the old five-action menu is gone',
        !/habitMenuItems/.test(page) && !/id: 'rename'/.test(page)
        && !/id: 'priority'/.test(page) && !/id: 'schedule'/.test(page)
        && !/id: 'remove'/.test(page));
    check('no priority-only dialog remains',
        !/priorityTarget/.test(page) && !/builtinPriorityTarget/.test(page));
    check('no inline rename field remains',
        !/renameId/.test(page) && !/renameValue/.test(page) && !/habit-row-edit/.test(page));
    check('the row still offers a visible way in where there is no right click',
        /className="habit-row-more"/.test(page));
    check('and that is hidden until hover is unavailable',
        /@media \(hover: none\)[\s\S]{0,160}?\.habit-row-more/.test(css));
    check('the menu is portalled to <body>',
        /createPortal\([\s\S]*context-menu[\s\S]*document\.body/.test(menu));
    check('the outside-click handler checks the panel itself',
        /panelRef\.current\?\.contains\(target\)/.test(menu));
    check('dismissal is captured, so a row cannot swallow it',
        /addEventListener\('mousedown', onDown, true\)/.test(menu));
    check('the browser menu is suppressed', /event\.preventDefault\(\)/.test(menuHook));
}

console.log('\n== the editor edits every property ==');
{
    check('the editor accepts a built-in habit, not just a Habit row',
        /export interface HabitEditorValue[\s\S]*?builtIn\?: boolean;[\s\S]*?builtInKey\?: string \| null;/.test(modal));
    check('it edits the name', /id="habit-name"/.test(modal));
    check('the description', /id="habit-description"/.test(modal));
    check('the priority', /id="habit-priority"/.test(modal));
    check('the polarity', /Negative habit/.test(modal) && /is_negative/.test(modal));
    check('and a full seven-day schedule',
        /schedule_days/.test(modal) && /\['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'\]/.test(modal));
    check('a full week is stored as null, meaning every day',
        /schedule\.length === 7 \? null : schedule/.test(modal));
    check('the page opens it for a built-in from the key alone',
        /builtIn: true,[\s\S]*?builtInKey: key/.test(page));
    check('built-in settings seed the fields', /cfg\.name\?\.trim\(\) \|\| BUILTIN_HABIT_LABELS\[key\]/.test(page));
    check('and the checkbox label reads the override',
        /const label = builtinHabitLabel\(builtinKey\)/.test(page)
        && /builtinHabitSetting\(key\)\.name\?\.trim\(\) \|\| BUILTIN_HABIT_LABELS\[key\]/.test(page));
    check('a custom habit is deleted from inside the editor',
        /!habit\.builtIn && onDelete/.test(modal) && /Remove habit/.test(modal));
    check('the row menu no longer carries remove', !/Remove habit/.test(menu));
    check('the confirmation is still the shared modal',
        /<ConfirmModal/.test(page) && /onConfirm=\{\(\) => \{ if \(deleteTarget\?\.id\) handleDeleteHabit/.test(page));
    check('a refused save keeps the dialog open with the text in it',
        /setHabitEditError\(/.test(page) && /role="alert"/.test(modal));
}

console.log('\n== a built-in save writes the override map ==');
{
    check('there is one save handler for both storage kinds',
        /const handleHabitEditorSave = async/.test(page));
    check('the built-in branch goes through updateUserSettings',
        /target\.builtIn && target\.builtInKey[\s\S]*?updateUserSettings\(next\)/.test(page));
    check('and merges into habit_settings rather than replacing it',
        /habit_settings: \{[\s\S]*?\.\.\.\(settings\.habit_settings \?\? \{\}\),[\s\S]*?\[key\]: \{/.test(page));
    check('a custom branch writes the habits row',
        /updateHabit\.mutateAsync\(\{ id: target\.id, updates \}\)/.test(page));
    check('the save button reports the built-in write too',
        /busy=\{savingBuiltinHabit \|\| updateHabit\.isPending\}/.test(page));
}

console.log('\n== off-schedule affects the score, not visibility ==');
{
    check('all built-ins stay on screen', /habitCheckbox\(fruitServing/.test(page));
    check('the score skips an off-schedule built-in',
        /const scheduled = !cfg\.schedule_days \|\| cfg\.schedule_days\.length === 0[\s\S]{0,120}?cfg\.schedule_days\.includes\(dayOfWeek\)/.test(page));
    check('and does not hide the row when it skips it',
        !/if \(!scheduled\) return null/.test(page));
    check('the scorer still owns the canonical built-in list',
        /export const BUILTIN_HABITS/.test(scoring));
}

console.log('\n== the row and its tick ==');
{
    check('a custom habit row has exactly one label',
        (() => {
            const habitRow = /\{habits\.map\(\(habit\) => \(([\s\S]*?)\)\)\}/.exec(page)?.[1] ?? '';
            return habitRow.length > 0 && (habitRow.match(/<label/g) ?? []).length === 1
                && !/<label[\s\S]*<label/.test(habitRow);
        })());
    check('the tick writes one column directly',
        /saveBuiltinHabit\(column, e\.target\.checked, setValue\)/.test(page)
        && /export const setDailyLogHabit/.test(logService));
    check('a failed write puts the checkbox back', /setValue\(!value\)/.test(page));
    check('and the page says whether the write landed',
        /habitSaveState === 'saving'/.test(page) && /habitSaveState === 'saved'/.test(page));
    check('a custom habit tick uses its own row, not a built-in column',
        /toggleHabitForDate\(id, logDate\)/.test(page));
    check('renaming a habit does not touch a log',
        /export const updateHabit/.test(service)
        && /updated_at: new Date\(\)\.toISOString\(\)/.test(service)
        && /UNIQUE \(user_id, name\)/.test(sql));
}

console.log('\n== the autosave stays out of the editor ==');
{
    const autosaveDeps = /scheduleSave\(600\);[\s\S]*?\n    \}, \[([^\]]*)\]\);/.exec(page)?.[1] ?? '';
    check('the autosave dependency list was found', autosaveDeps.length > 0);
    check('the editor fields are not in it',
        !/\beditingHabit\b/.test(autosaveDeps)
        && !/\bhabitEditError\b/.test(autosaveDeps)
        && !/\bsavingBuiltinHabit\b/.test(autosaveDeps),
        autosaveDeps.trim());
    check('nor is the create form', !/\bcustomHabitName\b/.test(autosaveDeps));
}

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
