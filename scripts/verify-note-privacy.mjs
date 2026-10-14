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