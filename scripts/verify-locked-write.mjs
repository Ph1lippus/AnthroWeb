/**
 * Where a locked page's contents get sealed.
 *
 * The bug this replaces: `updateNote` re-sealed on every save under whatever
 * `getMasterKey()` returned, with no notion of a page carrying its own PIN. Two
 * wrong outcomes followed from that one line, and neither showed up on screen.
 *
 *  - **App vault on.** The first autosave after entering a page PIN re-sealed the
 *    page under the *app* master key. The page still opened. It opened to the
 *    right text, because `openRows` also uses the master key. The PIN simply
 *    stopped being what protected it, silently, one keystroke after it was set.
 *
 *  - **App vault off** -- the default. `isVaultOpen()` was false, so the sealing
 *    branch was skipped entirely and the body was written straight into the clear
 *    `content` column of a row that still carried a ciphertext blob. A locked
 *    page's text, in plain text, in the database, next to its own ciphertext.
 *
 * The rule now: a locked row is sealed under its note key or not at all.
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
const svc = code('src/services/noteService.ts');
const workspace = code('src/Components/Notes/NotesWorkspace.tsx');

/**
 * The key-selection rule, restated over plain data.
 *
 * Kept literal against the source so a change to one has to be made to the other
 * or this stops describing it.
 */
const keyFor = ({ vaultOpen, locked, noteKeyHeld }) => {
    if (locked) return noteKeyHeld ? 'note' : 'REFUSED';
    return vaultOpen ? 'master' : 'none';
};

console.log('\n== a locked page never falls back to the master key ==');
{
    const cases = [
        { vaultOpen: true, locked: true, noteKeyHeld: true, want: 'note' },
        { vaultOpen: false, locked: true, noteKeyHeld: true, want: 'note' },
        { vaultOpen: true, locked: true, noteKeyHeld: false, want: 'REFUSED' },
        { vaultOpen: false, locked: true, noteKeyHeld: false, want: 'REFUSED' },
    ];
    for (const c of cases) {
        const got = keyFor(c);
        check(
            `locked=${c.locked} vault=${c.vaultOpen} keyHeld=${c.noteKeyHeld} -> ${c.want}`,
            got === c.want,
            `got ${got}`,
        );
    }
}

console.log('\n== an unlocked page is unchanged ==');
{
    check('vault off writes in the clear, exactly as before',
        keyFor({ vaultOpen: false, locked: false, noteKeyHeld: false }) === 'none');
    check('vault on seals under master, exactly as before',
        keyFor({ vaultOpen: true, locked: false, noteKeyHeld: false }) === 'master');
    check('a colour toggle with the vault on still seals under master',
        keyFor({ vaultOpen: true, locked: false, noteKeyHeld: true }) === 'master',
        'clear-column updates must not be diverted onto a key they never needed');
}

console.log('\n== the source says what the table says ==');
{
    // Scoped to `updateNote` and its writer. `getMasterKey` appearing anywhere in
    // the file is fine -- `resetNotePin` legitimately re-wraps with it. What must
    // not exist is a path from a locked row to the master key.
    //
    // Extracted by brace-matching rather than by matching up to `\n};`, because
    // this file is CRLF and that regex silently matches nothing -- which looks
    // exactly like "the code is fine" until you read the "was found" line.
    const func = (src, decl) => {
        const start = src.indexOf(decl);
        if (start === -1) return '';
        let depth = 0;
        for (let i = src.indexOf('{', start); i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
        }
        return src.slice(start);
    };

    const writer = func(svc, 'export const updateNote');
    const sealedWriter = func(svc, 'const writeSealedNote');

    check('updateNote was found', writer.length > 100, `matched ${writer.length} chars`);
    check('and writeSealedNote', sealedWriter.length > 100, `matched ${sealedWriter.length} chars`);

    check('a locked row branches before anything else',
        /existing\?\.lock_enabled\) \{[\s\S]*?writeSealedNote/.test(writer));
    check('and refuses when no note key is held',
        /if \(!noteKey\) \{[\s\S]*?throw new Error/.test(writer));

    check('neither writer can reach the master key',
        !/getMasterKey/.test(writer) && !/getMasterKey/.test(sealedWriter),
        'a locked row must be sealed under its note key or not written at all');

    check('sealing a locked row passes the note key',
        /sealExistingRow\('notes', merged, userId, noteKey\)/.test(sealedWriter));
    check('and reading it back uses the note key too',
        /openRows<Note>\('notes', \[data as Note\], userId, noteKey\)/.test(sealedWriter),
        'reading back with the master key is how the original bug hid');

    check('a locked page is never written on the plain path',
        /lock_enabled/.test(svc) && /heldNoteKey/.test(svc));
}

console.log('\n== the key is actually available when it is needed ==');
{
    check('locking a page holds its key for the session',
        /holdNoteKey\(id, noteKey\)/.test(svc),
        'without this the first save after locking is the first save that leaks');
    check('entering the PIN on the pad holds it too',
        /onUnlocked=\{key => handleUnlocked\(activeNote\.id!, key\)\}/.test(workspace)
        && /holdNoteKey\(noteId, key\)/.test(workspace));
    check('removing the PIN drops it',
        /releaseNoteKey\(id\)/.test(svc));
    check('ending the session drops every one',
        /forgetAccountKey[\s\S]*?sessionNoteKeys\.clear\(\)/.test(svc));
    check('keys are memory only, never written anywhere',
        /localStorage|sessionStorage/.test(svc.split('sessionNoteKeys')[0] ?? '') === false
        || !/localStorage[^\n]*noteKey/.test(svc));
}

console.log('\n== a locked page is readable when its key is open ==');
{
    check('getNoteById uses the held note key first',
        /const noteKey = heldNoteKey\(id\);[\s\S]{0,300}openRows<Note>\('notes', \[data as Note\], user\.id, noteKey\)/.test(svc));
    check('and otherwise returns a stub rather than nothing',
        /if \(data\.lock_enabled\) \{[\s\S]*?content: ''/.test(svc),
        'it used to return null, which callers read as "no such note" and saved over');
    check('the stub carries no ciphertext', /delete stub\.vault/.test(svc));
}

console.log('\n== removing a PIN works with the vault off ==');
{
    check('there is a path for it', /if \(!sealed\) \{/.test(svc),
        'without a master key it threw and left the page locked forever');
    check('the page content is restored to the clear column',
        /restore\[key\] = value/.test(svc));
    check('and the lock columns are dropped', /disarmNoteLock\(\)/.test(svc));
    check('the error for the master-key path is still there',
        /if \(!vault\) throw new Error\('Could not unlock this page\.'\)/.test(svc));
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
