/**
 * Every message the user needs to see goes to one place, at the top of the
 * screen.
 *
 * The rule exists because the alternative was tried and did not work. A dozen
 * forms each rendered `{error && <p className="auth-error">{error}</p>}` wherever
 * the author happened to put it. On a long form on a phone that is below the
 * fold, so a failed save presented as a button that silently did nothing -- and
 * there was no way to learn the convention, because there was no convention.
 *
 * Asserted against the source rather than by clicking through: these are
 * properties of *where a thing is declared*, which is exactly the sort of thing
 * that regresses when somebody adds a form and copies a neighbour.
 */
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const css = read('src/index.css');

/**
 * Comments are stripped before anything is scanned.
 *
 * The fix for the React warning *describes* the pattern it removed, so a scanner
 * that reads comments reports the fix as the bug. A check that does that gets
 * deleted rather than trusted, which is the correct outcome for a wrong check
 * and a bad look for the fix.
 */
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Every component and page, by glob, so a new file is covered automatically.
 *
 * Filtered against the filesystem as well. `git ls-files` lists tracked files, and
 * a file that is deleted in the working tree but not yet committed is still
 * tracked -- so a deletion that has not reached a commit makes this script throw
 * ENOENT on its way to reporting a clean result. Removal is a normal thing to do
 * here; the verifier should notice a file is gone and move on, not fall over on
 * the way.
 */
const files = execSync(
    'git ls-files "src/**/*.tsx"',
    { cwd: new URL('../', import.meta.url).pathname.replace(/^\//, ''), encoding: 'utf8' },
).split('\n').filter(Boolean).filter(file => existsSync(
    fileURLToPath(new URL(`../${file}`, import.meta.url)),
));

console.log(`\n== ${files.length} components and pages ==`);

console.log('\n== no message is rendered inside a form ==');
{
    const offenders = [];
    for (const file of files) {
        const src = strip(read(file));
        // The three classes this app used for an inline message. Any of them
        // means the convention has crept back in.
        for (const cls of ['auth-error', 'settings-update-error', 'note-inline-error']) {
            if (src.includes(`className="${cls}`) || src.includes('className={`' + cls)) {
                offenders.push(`${file} (${cls})`);
            }
        }
    }
    check('nothing renders a message inside its own form',
        offenders.length === 0, offenders.join(', '));
}

console.log('\n== there is one message surface, not one per page ==');
{
    const offenders = [];
    for (const file of files) {
        const src = strip(read(file));
        // Every page used to carry its own `[toast, setToast]` and render a
        // `.toast-container`. Both are gone; the shared provider owns them now.
        if (/\bsetToast\b/.test(src) || /toast-container/.test(src)) offenders.push(file);
    }
    check('no page carries its own toast state', offenders.length === 0, offenders.join(', '));
}

console.log('\n== the surface is where it was asked for ==');
{
    const provider = read('src/Components/Feedback/NoticeProvider.tsx');
    const stack = /\.notice-stack \{[\s\S]*?\}/.exec(css)?.[0] ?? '';
    const notice = /\.notice \{[\s\S]*?\}/.exec(css)?.[0] ?? '';

    check('a provider exists and is mounted once',
        /export const NoticeProvider/.test(provider)
        && /<NoticeProvider>/.test(read('src/main.tsx')));

    check('top of the screen', /top:\s*1rem/.test(stack), stack);
    check('centred', /left:\s*50%/.test(stack) && /translateX\(-50%\)/.test(stack));
    check('fixed, so it does not scroll with the page', /position:\s*fixed/.test(stack));

    check('20px radius', /border-radius:\s*20px/.test(notice),
        /border-radius:\s*20px/.exec(css)?.[0] ?? 'no radius found');

    check('errors and successes are distinguished',
        /\.notice--error/.test(css) && /\.notice--success/.test(css));
    check('errors outlive successes',
        /error:\s*9000/.test(provider) && /success:\s*4000/.test(provider));
}

console.log('\n== the stack cannot swallow clicks ==');
{
    const stack = /\.notice-stack \{[\s\S]*?\}/.exec(css)?.[0] ?? '';
    const notice = /\.notice \{[\s\S]*?\}/.exec(css)?.[0] ?? '';
    check('the stack is click-through', /pointer-events:\s*none/.test(stack));
    check('the messages themselves are not', /pointer-events:\s*auto/.test(notice),
        'without this the close button cannot be pressed either');
    check('and they sit above everything', /z-index:\s*10000/.test(stack));
}

console.log('\n== a message is never truncated ==');
{
    const text = /\.notice-text \{[\s\S]*?\}/.exec(css)?.[0] ?? '';
    check('it wraps rather than clipping', /overflow-wrap:\s*anywhere/.test(text), text);
    check('and is not given a single-line ellipsis', !/text-overflow:\s*ellipsis/.test(text),
        'an error cut off mid-sentence is the one thing that must never happen');
}

console.log('\n== a message is never raised from a render ==');
{
    // The specific shape that produced "Can't perform a React state update on a
    // component that hasn't mounted yet": a guard comparing against the last
    // message shown, with the raise inside it, at the top level of a component
    // rather than in an effect. The timer and academic pages both had it.
    //
    // Narrow on purpose. A general "does this file call setState while
    // rendering" detector fires on every ordinary `if` guard in the app -- it
    // reported seventy false positives the first time -- and a check that noisy
    // is worse than no check, because it gets switched off.
    const offenders = [];
    for (const file of files) {
        const src = strip(read(file));
        const lines = src.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // A guard at four-space indent, in a component body, holding a raise.
            if (!/^ {4}if \(/.test(line)) continue;
            if (/=>|useEffect|useMemo|useCallback/.test(line)) continue;
            const body = lines.slice(i + 1, i + 6).join('\n').split(/\n {4}\}/)[0];
            if (!body) continue;
            if (/\bnotify\(|\bsetToast\(|\bsetShownError\(/.test(body)) {
                offenders.push(`${file}:${i + 1}`);
            }
        }
    }
    check('no component raises a message while rendering',
        offenders.length === 0, offenders.join(', '));
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
