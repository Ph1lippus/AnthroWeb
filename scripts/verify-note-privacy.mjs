/**
 * Two decisions that are easy to undo by accident, checked against the source.
 *
 * 1. `title` stays in the clear for notes. A sidebar listing twenty rows all
 *    reading "Locked" cannot be navigated, and a lock you cannot navigate is a
 *    lock you end up switching off. The cost -- a database dump reveals what your
 *    pages are *about* -- is real and is the owner's call, which is why the
 *    reason is written where the list is rather than only here.
 *
 * 2. The account wrap is established by locking a page, not by a toggle in
 *    Settings. It used to be a setting that had to be found *before* locking
 *    anything, and missing it meant "Forgot your PIN?" on the lock pad -- the
 *    one place anyone would look -- dead-ended with an error pointing back at
 *    the setting nobody had been told existed.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const code = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const rows = code('src/services/vault/rows.ts');
const notes = code('src/services/noteService.ts');
const sidebar = code('src/Components/Notes/NotesSidebar.tsx');
const dialog = code('src/Components/Notes/NotePinDialog.tsx');
const settings = code('src/Components/Security/SecuritySettings.tsx');
const seal = code('src/services/vault/seal.ts');
const workspace = code('src/Components/Notes/NotesWorkspace.tsx');

console.log('\n== a note title stays readable ==');
{
    const notesList = /notes:\s*\[([\s\S]*?)\]/.exec(rows)?.[1] ?? '';
    check('the notes allowlist names title', /'title'/.test(notesList));

    for (const field of ['content', 'notes_tags']) {
        check(`${field} is NOT on the allowlist`, !new RegExp(`'${field}'`).test(notesList),
            'tags are a self-authored taxonomy and say more than the title does');
    }

    check('the display stub keeps the title',
        /title: null/.test(notes) === false,
        'blanking the title is what produced a sidebar of identically-named rows');

    check('the display stub still blanks the body', /content: ''/.test(notes));
    check('and the tags', /notes_tags: \[\]/.test(notes));
    check('and the ciphertext', /delete stub\.vault/.test(notes));

    check('the sidebar renders the real title',
        /notes-rail-item-title">\{title\}/.test(sidebar));
    check('without substituting a locked label', !/LOCKED_LABEL/.test(sidebar));
}

console.log('\n== the sidebar marks a locked page ==');
{
    check('a lock glyph is rendered beside the title', /notes-rail-item-lock/.test(sidebar));
    check('it is conditional on the lock', /\{locked && \(/.test(sidebar));
    check('and it is decorative, with a name for assistive tech',
        /aria-hidden="true"/.test(sidebar));
    check('the row is still identified as locked for styling',
        /data-locked=\{locked \? 'true'/.test(sidebar));
    check('the icon is imported', /Lock,/.test(sidebar));
    check('and has a style', /notes-rail-item-lock/.test(read('src/index.css')));
}

console.log('\n== locking a page asks for nothing but the PIN ==');
{
    // This was the opposite design a moment ago: the lock dialog carried an
    // "Your account password" field, shown on the first lock of a session, so
    // that a forgotten PIN could be reset later.
    //
    // It was wrong. It made a dialog asking for four digits into one asking for
    // a long account password too, to set up something that has nothing to do
    // with locking -- and the password has no business being typed into that
    // particular box. The account wrap is created during recovery instead, where
    // the password is in hand and the user has already decided they need it.
    check('the dialog has no account password field',
        !/accountPassword/.test(dialog) && !/note-lock-account-password/.test(dialog));
    check('and no copy explaining one',
        !/recover this page|Only asked the first time/.test(dialog));
    check('lockNote takes a PIN and nothing else',
        /export const lockNote = async \(id: string, pin: string\)/.test(notes),
        'an optional password parameter would invite it back');
    check('the establishment helper is gone',
        !/ensureAccountKey/.test(notes));

    // Recovery is where the password belongs, so that is where the wrap is made.
    check('recovery creates the verifier',
        /resetNotePin[\s\S]*?buildAccountRecovery\(accountPassword\)/.test(notes));
    check('and caches the key for the rest of the session',
        /resetNotePin[\s\S]*?sessionAccountKey = accountKey/.test(notes));

    check('recovery falls back to the app master key',
        /openNoteKeyWithMasterEncoded/.test(notes),
        'a page locked inside an unlocked app always has a master wrap');
    check('and says so plainly when there is no route at all',
        /only be reset while the app lock is on/.test(notes),
        'a vague failure here reads as "the app is broken", not "unlock the app"');

    check('the account wrap survives a PIN change',
        /reWrapNotePin[\s\S]*?lock_key_account: keyAccount/.test(
            read('src/services/vault/noteLock.ts')),
        'otherwise the second forgotten PIN needs the app lock on, which is the one time it will not be');

    check('the error no longer points at a setting',
        !/Set up account recovery in Settings/.test(notes),
        'that message sent people looking for a setting that no longer exists');

    check('the Settings section is gone', !/Page recovery/.test(settings));
    check('and its handlers with it',
        !/runEnableRecovery|runDisableRecovery|buildAccountRecovery/.test(settings));

    check('the pad opens recovery directly',
        /onForgotPin=\{\(\) => setRecoveringPin\(true\)\}/.test(workspace)
        && !/onUseRecovery=\{\(\) => navigate/.test(workspace),
        'the key glyph used to navigate to Settings, which is the wrong place entirely');
}

console.log('\n== the page PIN can be typed, not only tapped ==');
{
    // The prompt was a 3x4 grid of `<button>`s and nothing else. There was no
    // element for a keystroke to land on, so the page could only be opened by
    // clicking -- no hardware keyboard, no Bluetooth keyboard, no switch, no
    // paste, and no screen reader driving a caret. The module comment said the pad
    // was deliberate; it was not a bad idea on a phone, it was the only way in.
    const unlock = code('src/Components/Notes/NoteUnlockPrompt.tsx');
    const lockScreen = code('src/Components/Security/LockScreen.tsx');

    for (const [name, source] of [['the page prompt', unlock], ['the app lock screen', lockScreen]]) {
        check(`${name} renders a PIN input`, /type="password"/.test(source));
        check(`${name} still asks a phone for its number pad`, /inputMode="numeric"/.test(source));
        check(`${name} keeps the value out of autofill`, /autoComplete="new-password"/.test(source));
        check(`${name} drops anything that is not a digit`, /replace\(\/\\D\/g, ''\)/.test(source));
        check(`${name} draws no keypad`, !/vault-lock-pad/.test(source) && !/vault-lock-key/.test(source));
        check(`${name} draws no separate dots row either`, !/vault-lock-dot/.test(source));
    }

    // Enter has to work, which needs a form -- the same reason the PIN dialog is
    // one. Without it, Enter in a PIN field does nothing and the browser logs
    // "Password field is not contained in a form".
    check('the page prompt submits on Enter', /<form className="note-unlock-card" onSubmit=/.test(unlock));

    // Both lock screens were unreachable by keyboard, so both had to change. The
    // app one additionally had a key glyph sharing a cell with `0`, which opened
    // the recovery-phrase dialog; it is a link now, so the capability survives.
    check('the recovery words are still reachable from the app lock screen',
        /onClick=\{onRecoveryPhrase\}/.test(lockScreen)
        && /Show my recovery words/.test(lockScreen));
    check('and the gate still passes that handler through',
        /onRecoveryPhrase=\{\(\) => setShowRecovery\(true\)\}/.test(
            read('src/Components/Security/AppLockGate.tsx')));

    // "Back to pages" offered an exit from a page that could not be read. The rail
    // is right there; the button was a second route to somewhere the reader can
    // already get to, from a dialog that is meant to be about one thing.
    check('the page prompt has no "Back to pages"', !/Back to pages/.test(unlock));
    check('and takes no onBack', !/onBack/.test(unlock));
    check('the workspace passes neither', !/onBack=\{\(\) => navigate\('\/Notes'\)\}/.test(workspace));

    // The recovery glyph and the link did the same thing, so one of them going is
    // the point; both wiring to setRecoveringPin is what made the second redundant.
    check('there is one way to recovery, not two',
        (workspace.match(/setRecoveringPin\(true\)/g) ?? []).length === 1,
        'the key glyph and the link both opened the same dialog');

    // The prompt pointed at a 24-word recovery phrase; the screen it opens asks for
    // the account password. Someone who believed the prompt and went looking for
    // their phrase had no way to get past a field that wanted something else.
    check('the prompt names what recovery actually asks for',
        !/recovery words|recovery phrase/i.test(unlock), 'it said "recovery words"; the screen wants the account password');
    const recovery = code('src/Components/Notes/NotePinRecovery.tsx');
    check('and recovery really is a password screen',
        /Account password|accountPassword/i.test(recovery) && !/RECOVERY_WORDS/.test(recovery));

    // The sentence that told people to "use your account password" here. There is
    // no field on this screen that accepts one: recovery is the link underneath,
    // and it opens a different screen. Typing a password into the PIN box can
    // only burn page-PIN attempts, and after three the backoff starts refusing
    // them for a minute at a time.
    check('the prompt does not offer an account password it cannot take',
        !/account\s+password/i.test(unlock),
        'recovery is the link below, not this field');
    check('and nothing else describes a route that does not exist',
        !/Enter the PIN you set/i.test(unlock) && !/vault-lock-hint/.test(unlock));

    // The icon and the heading said "this page is locked", which the prompt says
    // by being the only thing on screen where the page should be.
    check('no lock icon is drawn', !/vault-lock-icon/.test(unlock) && !/from 'lucide-react'/.test(unlock)
        || !/\bLock\b/.test(unlock));
    check('and no heading', !/note-unlock-heading/.test(unlock) && !/<h2/.test(unlock));
    check('the dialog still names itself for a screen reader',
        /aria-label="This page is locked"/.test(unlock) && !/aria-labelledby/.test(unlock),
        'removing the heading must not leave the dialog unnamed');
}

console.log('\n== and the stylesheet kept up ==');
{
    const css = read('src/index.css');
    check('the keypad styles are gone from the stylesheet too',
        !/\.vault-lock-pad/.test(css) && !/\.vault-lock-key/.test(css) && !/\.vault-lock-dot/.test(css));
    check('and the field it replaced has styles',
        /\.vault-lock-input/.test(css) && /text-align: center/.test(css));
    check('the field group is not named after one of the two things it holds',
        /\.vault-lock-fields/.test(css) && !/\.vault-lock-recovery\s*\{/.test(css),
        'both lock screens draw both fields');
    for (const [name, source] of [['the page prompt', code('src/Components/Notes/NoteUnlockPrompt.tsx')],
        ['the app lock screen', code('src/Components/Security/LockScreen.tsx')]]) {
        check(`${name} uses it`, /vault-lock-fields/.test(source));
        check(`${name} leaves the old name behind nowhere`, !/vault-lock-recovery/.test(source));
    }
}

console.log('\n== leaving a locked page locks it again ==');
{
    // Its own `read`, not the module-level `workspace`. That one is
    // comment-stripped, and a check written against it can pass on a variable
    // that is not in scope -- `regex.test(undefined)` tests the string
    // "undefined" and is false, so every negated assertion silently succeeds.
    const source = read('src/Components/Notes/NotesWorkspace.tsx');

    // It used to be a `Record<string, CryptoKey>` that only grew, so a page
    // unlocked once stayed readable for the whole session: walking back to one
    // unlocked twenty minutes earlier found it still open, with no PIN asked for
    // again. "At most one open" is structural now -- the state is a single id.
    check('the workspace holds one id, not a map of keys',
        /useState<string \| null>\(null\)/.test(source) && !/noteKeys/.test(source),
        'a growing map is what kept every unlocked page open');
    check('and the prompt is keyed off that id',
        /unlockedNoteId !== activeNote\.id/.test(source));

    // The service's copy goes too. `updateNote` refuses a locked row whose key is
    // not held rather than writing plaintext, so leaving it behind would make the
    // page stop saving as well as stop being locked.
    check('leaving releases the key the service seals writes with',
        /releaseNoteKey\(previous\)/.test(source)
        && /import \{ holdNoteKey, releaseNoteKey \}/.test(source));

    // And on the way out of the workspace entirely, not only on a page change.
    check('the release is driven by the open page changing',
        /unlockedIdRef\.current = current;[\s\S]*?releaseNoteKey\(previous\);[\s\S]*?\}, \[activeNote\?\.id\]\)/.test(source));
    check('leaving the workspace entirely releases it too',
        /const released = unlockedIdRef\.current;[\s\S]*?return \(\) => \{[\s\S]*?releaseNoteKey\(released\)/.test(source),
        'an effect body does not run on unmount, so this needs its own');

    // The reason this is an effect and not something run at the moment of the
    // click: the outgoing editor flushes its pending autosave on unmount, and
    // `updateNote` reads the note key on its first line. React runs every passive
    // cleanup before any passive setup, so releasing here is after that read.
    // Releasing earlier fails the save with "its key is not open" and loses
    // whatever was typed in the last few seconds.
    check('the ordering is documented where the release happens',
        /before any passive setup/.test(source) && /heldNoteKey/.test(source));
}

console.log('\n== the PIN dialog is a real form, and says nothing unstyled ==');
{
    // The browser was logging "Password field is not contained in a form" for
    // every input here, and Enter did nothing -- there was no form to submit.
    check('it is a <form>', /<form className="auth-card/.test(dialog));
    check('submitted by Enter', /onSubmit=\{submit\}/.test(dialog));
    check('and submit prevents the default navigation', /event\.preventDefault\(\)/.test(dialog));
    check('the button is a submit, not a click handler',
        /<button type="submit"/.test(dialog) && !/onClick=\{\(\) => void submit\(\)\}/.test(dialog));

    // `t-field` / `t-label` / `t-input` / `t-hint` are not classes that exist
    // anywhere in the stylesheet, which is why the field added for the password
    // rendered with no styling at all. The app's vocabulary is `form-control` and
    // `form-label`.
    for (const dead of ['t-field', 't-label', 't-input-wrap', 't-hint']) {
        check(`${dead} is not used`, !new RegExp(`className="[^"]*${dead}`).test(dialog),
            'no such class exists in index.css, so it renders unstyled');
    }
    check('the inputs use the app\'s own form classes',
        /className="form-control"/.test(dialog) && /className="form-label"/.test(dialog));
}

console.log('\n== the seal walk covers everything ==');
{
    check('it pages rather than taking one page', /PAGE_SIZE/.test(seal) && /for \(let page/.test(seal));
    check('the page size is smaller than the old ceiling', /const PAGE_SIZE = 250/.test(seal));
    check('and it is not 1000', !/limit\(1000\)/.test(seal));

    check('it pages on id, not on the filter column',
        /\.gt\('id', cursor\)/.test(seal),
        'paging on `vault IS NULL` would skip rows the previous page just sealed');
    check('the cursor advances past every row it reads', /cursor = String\(row\.id\)/.test(seal));

    check('it takes a real count first',
        /count: 'exact', head: true/.test(seal),
        'otherwise the progress bar is a fraction of one page, not of the table');

    check('it recounts afterwards', /remaining: remainingRows/.test(seal));
    check('and reports the remainder', /remaining/.test(seal));
    check('the UI acts on it', /done\.remaining > 0/.test(settings));
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);