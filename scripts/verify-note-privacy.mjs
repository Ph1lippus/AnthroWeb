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

console.log('\n== locking sets up its own recovery ==');
{
    check('the lock dialog asks for the account password',
        /note-lock-account-password/.test(dialog));
    check('only when there is no key held', /!hasAccountKey\(\)/.test(dialog));
    check('and it can be skipped', /setNeedsAccountPassword\(false\)/.test(dialog));

    check('lockNote takes the password',
        /export const lockNote = async \(id: string, pin: string, accountPassword\?: string\)/.test(notes));
    check('and establishes the key with it', /ensureAccountKey\(accountPassword\)/.test(notes));
    check('which builds the verifier first',
        /const ensureAccountKey[\s\S]*?buildAccountRecovery\(accountPassword\)/.test(notes));
    check('and caches it for the session', /sessionAccountKey = key/.test(notes));

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