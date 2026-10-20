/**
 * Structural checks for the to-do spacing fix.
 *
 * The previous arrangement forced TaskItem to a single paragraph and a flex
 * column, which broke Enter/toggleTaskList and left stray empties. The fix is:
 *  - keep paragraph+ content, clean stray empties at runtime
 *  - block display, spacing via li margins
 */
import { readFileSync } from 'node:fs';

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const ext = read('src/utils/noteEditorExtensions.ts');
const css = read('src/index.css').replace(/\/\*[\s\S]*?\*\//g, '');
const content = read('src/utils/noteContent.ts');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

check('no single-paragraph content override on TaskItem',
    !/content:\s*'paragraph'/.test(ext));
check('nested stays false',
    /nested:\s*false/.test(ext));
check('runtime stray-empty cleanup plugin exists',
    /StrayEmptyParagraphCleanup/.test(ext));
check('appendTransaction is used for cleanup',
    /appendTransaction/.test(ext));
check('cleanup is registered in buildNoteExtensions',
    /StrayEmptyParagraphCleanup,/.test(ext));
check('load-time normalizer no longer calls normalizeTaskItems',
    !content.includes('normalizeTaskItems(normalizeLegacyToggles')
    && !content.includes('normalizeTaskItems(normalizeLegacyToggles'));
const taskListRule = /\.note-prose ul\[data-type='taskList'\]\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
check('task list is block display, not flex column',
    /display:\s*block/.test(taskListRule)
    && !/flex-direction/.test(taskListRule)
    && !/display:\s*flex/.test(taskListRule));
check('adjacent task lists collapse their margin',
    /ul\[data-type='taskList'\]\s*\+\s*ul\[data-type='taskList'\][\s\S]{0,80}margin-top:\s*0/.test(css));
check('task items carry a vertical gap',
    /ul\[data-type='taskList'\]\s*>\s*li\s*\+\s*li[\s\S]{0,80}margin-top:\s*0\.2rem/.test(css));

console.log(fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);