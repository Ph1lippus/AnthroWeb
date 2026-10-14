/**
 * `parseJournalDocument` and `serializeJournalDocument`, which are the boundary
 * between what the two editors hold in memory and what one row stores.
 *
 * This file had no coverage at all, which is how it came to carry a bug that
 * duplicated the morning entry into the evening on every single load of a day
 * with no evening written, and then persisted the copy on the next autosave.
 *
 * The failure was silent in the worst way: the page rendered correctly, the
 * entry saved, and the database ended up with the same words in two columns.
 * Nobody reading the app would ever know. A bug that corrupts data while
 * looking completely fine is the one that most needs a test.
 */
import { register } from 'node:module';

/**
 * Just enough `DOMParser` for `stripHtml`, which the text helpers call.
 *
 * A shim, and worth being clear about what that means: this is *not* a test of
 * HTML parsing, and the assertions below are written so that none of them depend
 * on its fidelity -- they only ask which halves of the document ended up in the
 * output. What is under test here is the journal document, not the browser's
 * parser. Anything that actually needs real HTML parsing is tested against a
 * real DOM.
 */
if (!globalThis.DOMParser) {
    globalThis.DOMParser = class {
        parseFromString(html) {
            const text = html
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"');
            return { body: { textContent: text } };
        }
    };
}

register('./resolve-ts-extensions.mjs', import.meta.url);

// Imported after the resolver is registered: the source uses extensionless
// relative imports throughout, which Vite resolves and bare Node does not.
const { parseJournalDocument, serializeJournalDocument, journalDocumentText } =
    await import('../src/utils/journalContent.ts');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

console.log('\n== an evening you have not written stays empty ==');
{
    // The exact shape the page saves: a structured `journal_entry`, a morning,
    // and an evening that is an empty string.
    const saved = serializeJournalDocument({
        version: 1, morning: '<p>woke up early</p>', evening: '', links: [],
    });

    const read = parseJournalDocument(saved, {
        morning: '<p>woke up early</p>', evening: '', links: [],
    });

    check('the morning comes back intact', read.morning === '<p>woke up early</p>');
    check('the evening is still empty', read.evening === '',
        `got ${JSON.stringify(read.evening)} -- the bug copied the morning into it`);

    // The ratchet: read it again, as the second visit would.
    const again = parseJournalDocument(read.morning ? saved : saved, {
        morning: read.morning, evening: read.evening, links: read.links,
    });
    check('and reading it again does not fill it in either', again.evening === '');
    check('reading ten times still leaves it empty',
        Array.from({ length: 10 }, (_, i) => parseJournalDocument(
            serializeJournalDocument(again),
            { morning: again.morning, evening: again.evening, links: again.links },
        )).every(d => d.evening === ''));
}

console.log('\n== both halves survive independently ==');
{
    const cases = [
        ['morning only', '<p>am</p>', ''],
        ['evening only', '', '<p>pm</p>'],
        ['both', '<p>am</p>', '<p>pm</p>'],
        ['neither', '', ''],
    ];
    for (const [name, morning, evening] of cases) {
        const saved = serializeJournalDocument({ version: 1, morning, evening, links: [] });
        const read = parseJournalDocument(saved, { morning, evening, links: [] });
        check(`${name} round trips`, read.morning === morning && read.evening === evening,
            `got morning=${JSON.stringify(read.morning)} evening=${JSON.stringify(read.evening)}`);
        check(`${name} never copies one half into the other`,
            !(morning && read.evening === morning && evening === '')
            && !(evening && read.morning === evening && morning === ''));
    }
}

console.log('\n== identical halves stay identical, because the user wrote them ==');
{
    // The opposite of the bug: if the morning and evening genuinely are the same
    // text, that is the user's doing and it must survive a round trip. A fix that
    // made matching halves impossible would be its own kind of data loss.
    const same = '<p>same</p>';
    const saved = serializeJournalDocument({ version: 1, morning: same, evening: same, links: [] });
    const read = parseJournalDocument(saved, { morning: same, evening: same, links: [] });
    check('both are kept as written', read.morning === same && read.evening === same);
}

console.log('\n== a genuinely legacy entry still lands somewhere ==');
{
    // Before the split, everything was plain text in `journal_entry`. It was
    // written at the end of a day, so evening is the only sensible home -- but
    // it has to be evening and not a copy of a morning that does not exist yet.
    const legacy = 'just some old plain text';
    const read = parseJournalDocument(legacy, { morning: '', evening: '', links: [] });
    check('legacy text is not thrown away', read.morning !== '' || read.evening !== '');
    check('and it goes to the evening', read.evening.includes('old plain text'));
    check('with no morning invented', read.morning === '');
}

console.log('\n== malformed input is survivable ==');
{
    for (const bad of ['{not json', '{"morning": 5}', '[1,2,3]', 'null', '"a string"']) {
        let read;
        try {
            read = parseJournalDocument(bad, { morning: '', evening: '', links: [] });
        } catch (err) {
            check(`${JSON.stringify(bad)} does not throw`, false, String(err));
            continue;
        }
        check(`${JSON.stringify(bad)} parses to a usable document`,
            typeof read.morning === 'string' && typeof read.evening === 'string' && Array.isArray(read.links));
    }
}

console.log('\n== links ==');
{
    const read = parseJournalDocument(null, { morning: '<p>a</p>', evening: '', links: ['work', 'sleep'] });
    check('links are kept', read.links.length === 2 && read.links.includes('work'));
    check('and survive a round trip',
        JSON.parse(serializeJournalDocument(read)).links.includes('sleep'));
}

console.log('\n== the text helpers agree with the halves ==');
{
    const doc = parseJournalDocument(null, {
        morning: '<p>alpha</p>', evening: '<p>beta</p>', links: [],
    });
    const text = journalDocumentText(doc);
    check('both halves are counted', text.includes('alpha') && text.includes('beta'));
    check('with no leftover tags', !text.includes('<p>'));

    const morningOnly = journalDocumentText(
        parseJournalDocument(null, { morning: '<p>alpha</p>', evening: '', links: [] }),
    );
    check('a morning-only entry does not drag in an evening',
        morningOnly === 'alpha', `got ${JSON.stringify(morningOnly)}`);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
