/**
 * The journal's day-switching, which used to destroy entries.
 *
 * Three separate faults produced one symptom -- "I changed the day and the entry
 * is wrong" -- and none of them is visible in a screenshot of the happy path.
 * They are all about timing rather than appearance, so this checks the
 * invariants that hold at each moment rather than trying to render the race.
 *
 * The fault was:
 *
 *  1. `JournalPage` keyed its editors on `logDate`. The TipTap editors read
 *     `initialHtml` once at construction, so a remount is the only thing that can
 *     put a new day's text into them -- and `logDate` changes in the same commit
 *     as the click, before the row for that day has been fetched. The editors
 *     therefore mounted holding the *previous* day's prose, the fetch landed
 *     afterwards, and no remount followed. The next keystroke saved yesterday's
 *     entry onto today's row. Keying on the day that has actually been *applied*
 *     is what fixes it, and `dayIsPending` is what stops anyone typing into the
 *     gap.
 *
 *  2. The debounced autosave was cancelled rather than flushed. `performSave`
 *     depends on `logDate`, so switching day re-ran the effect and its cleanup
 *     threw away up to two seconds of pending writing -- silently, with nothing
 *     left anywhere to retry from.
 *
 *  3. `updateDailyLog` accepted `log_date` in its payload. An update addresses a
 *     row by id; sending the date with it means "and move this row to that day",
 *     which is how a stale closure turned into an entry changing days.
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

const page = code('src/Pages/JournalPage.tsx');
const css = read('src/index.css');
const editPage = code('src/Pages/JournalEditPage.tsx');
const editor = code('src/Components/Journal/JournalEditor.tsx');
const service = code('src/services/dailyLogService.ts');

console.log('\n== the editors mount on the applied day, not the requested one ==');
{
    // The specific regression: keying on `logDate` is what caused the data loss.
    check('the editor key is not the raw logDate',
        !/key=\{logDate\}/.test(page),
        'key={logDate} remounts the editors before the day has loaded');

    check('the editor key is the applied date',
        /key=\{appliedDate\}/.test(page));

    check('appliedDate is state, not a ref read during render',
        /useState<string \| null>\(null\)/.test(page) && /setAppliedDate\(logDate\)/.test(page));

    check('appliedDate advances only inside the populate effect',
        /if \(appliedDateRef\.current === logDate\) return;/.test(page)
        && /setAppliedDate\(logDate\)/.test(page));

    /**
     * The editors must not be editable while the day has not been applied.
     *
     * Asserted against the mechanism that is there, not the one that was. It
     * used to be a conditional: a "Loading <day>" message replaced the editors
     * outright. It is now a dimmed wrapper carrying `pointer-events: none`, with
     * `aria-busy` alongside it.
     *
     * The property under test is unchanged and is what matters -- a pending day is
     * not writable, so nobody types into the previous day's entry while the new
     * one is in flight. The message was the least useful way to express it: it
     * named the day that was already in the rail beside it, and then vanished.
     */
    check('a pending day is marked on the form', /dayIsPending/.test(page));
    check('and the editors stay mounted, keyed on the applied day',
        /<JournalEditor[\s\S]*?key=\{appliedDate\}/.test(page));
    check('and a pending day is not editable',
        /journal-log-form__inner--pending/.test(page));
    check('the CSS actually blocks input and selection on it',
        /\.journal-log-form__inner--pending \{[^}]*pointer-events: none[^}]*\}/.test(css)
        && /\.journal-log-form__inner--pending \{[^}]*user-select: none/.test(css));
    check('and it is announced as busy',
        /aria-busy=\{dayIsPending\}/.test(page));
}

console.log('\n== an autosave cannot fire for a day the form is not showing ==');
{
    check('performSave refuses when applied and requested days disagree',
        /if \(appliedDate !== logDate\) return;/.test(page));

    check('appliedDate is in performSave\'s dependency list',
        /\[settings, logDate, appliedDate, journalDocument/.test(page));

    check('the populate effect still waits for the fetch',
        /if \(dayLogPlaceholder \|\| dayLog === undefined\) return;/.test(page)
        && /if \(dayLogFetching\) return;/.test(page));
}

console.log('\n== the pending save is flushed, not cancelled ==');
{
    // A cleanup that only clears the timer is the bug. It has to call the save.
    check('there is an unmount cleanup that saves', /flushPending\(\);/.test(page));

    check('the flush is reachable without a render',
        /performSaveRef\.current = performSave;/.test(page));

    check('a pagehide handler issues the request before teardown',
        /addEventListener\('pagehide'/.test(page));

    check('the debounce cleanup still only cancels',
        /clearTimeout\(autoSaveTimerRef\.current\);/.test(page));
}

console.log('\n== an update cannot move a row to another day ==');
{
    check('log_date is excluded from updateDailyLog',
        /excludedFields = \['user_id', 'id', 'log_date', 'created_at', 'updated_at'\]/.test(service));

    check('the journal edit page no longer sends a date',
        /const logData: Partial<DailyLog> = \{/.test(editPage)
        && !/log_date:/.test(editPage));

    check('no page derives a stored date from toISOString',
        !/log_date:\s*[^,\n]*toISOString/.test(page + editPage),
        'toISOString is UTC and is tomorrow for anyone west of Greenwich in the evening');
}

console.log('\n== a failed fetch is not an empty day ==');
{
    // `null` means "no row". A fetch failure used to return the same thing, so a
    // dropped connection read as a blank day and the next autosave wrote that
    // blankness over the entry that was there.
    check('getDailyLogByDate uses maybeSingle, not single',
        /\.maybeSingle\(\)/.test(service));

    check('getDailyLogByDate throws rather than swallowing the error',
        /export const getDailyLogByDate[\s\S]*?throw error;/.test(service));

    check('getDailyLogById is scoped to the signed-in user',
        /\.eq\('user_id', userId\)/.test(service),
        'reading by primary key alone made the id in the URL the whole authorisation check');
}

console.log('\n== the two editors cannot overwrite each other ==');
{
    check('JournalEditor takes an updater, not a next value',
        /onChange: \(update: \(current: JournalDocument\) => JournalDocument\) => void;/.test(editor));

    check('each half writes against the latest document',
        (editor.match(/onChange\(\s*\w+ => \(\{ \.\.\.\w+, (?:morning|evening) \}\)\)/g) || []).length === 2,
        'a value-spreading onChange drops the first of two changes in one batch');

    check('no editor spreads a captured `value`',
        !/onChange=\{\s*(morning|evening) => onChange\(\{/.test(editor));
}

console.log('\n== the edit page does not hang ==');
{
    check('loading is gated on the fetch, not on having a log',
        /if \(!dataLoaded\)/.test(editPage));

    check('a missing log is an answer, not an endless spinner',
        /could not be found/i.test(editPage));

    check('its editor is keyed on the row',
        /key=\{existingLog\.id\}/.test(editPage));
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);