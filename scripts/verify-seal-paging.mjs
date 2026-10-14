/**
 * The seal walk, and the two things it got wrong.
 *
 * 1. It only fetched one page of 1000 rows and reported success. A year of
 *    daily logs is 365 rows, so a few years in, everything past that stayed in
 *    plaintext while the UI said "done". Silent partial encryption is worse than
 *    none: the user believes they are protected.
 *
 * 2. Paging by `vault IS NULL` + offset is wrong even with a loop. The walk
 *    seals rows as it goes, which removes them from the filter, so the next page
 *    skips rows. It has to page on a stable column that rows leave behind --
 *    `id`, which never changes.
 *
 * Both are properties of the loop rather than of the crypto, so both are checked
 * here against a fake that can run thousands of rows in milliseconds.
 */
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

/**
 * The paging loop, restated over plain data.
 *
 * Mirrors `sealTable`'s control flow: cursor on `id`, rows sealed as they are
 * read, and a recount at the end. Kept literal so a change to one has to be
 * made to the other or this stops describing it.
 */
const walk = (rows, pageSize) => {
    const remaining = rows.filter(r => r.vault === null);
    let cursor = null;
    let processed = 0;
    const seen = new Set();

    for (let page = 0; page < 1000; page++) {
        const batch = remaining
            .filter(r => (cursor === null || r.id > cursor))
            .sort((a, b) => (a.id < b.id ? -1 : 1))
            .slice(0, pageSize);

        if (batch.length === 0) break;

        for (const row of batch) {
            cursor = row.id;
            seen.add(row.id);
            row.vault = 'sealed';          // the row leaves the `vault IS NULL` set
            processed++;
        }

        if (batch.length < pageSize) break;
    }

    return {
        processed,
        seen: seen.size,
        left: rows.filter(r => r.vault === null).length,
    };
};

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({
    // Lexicographic ids, so string comparison sorts the same way the query does.
    id: String(i).padStart(8, '0'),
    vault: null,
}));

console.log('\n== the old page size was a ceiling, not a page ==');
{
    const rows = makeRows(1000);
    const result = walk(rows, 1000);
    check('a 1000-row table finished', result.left === 0);
    check('and sealed all of them', result.processed === 1000);

    const over = makeRows(1001);
    const overResult = walk(over, 1000);
    check('one row past the old ceiling is still sealed', overResult.left === 0,
        `left ${overResult.left}`);
    check('and it was processed', overResult.processed === 1001);
}

console.log('\n== real volumes ==');
{
    // 2500 daily logs is about seven years. Under the old code, 1500 of those
    // stayed in plain text.
    for (const size of [1, 249, 250, 251, 999, 1000, 1001, 2500, 5000]) {
        const rows = makeRows(size);
        const result = walk(rows, 250);
        check(`${size} rows all sealed`, result.left === 0 && result.processed === size,
            `processed ${result.processed}, left ${result.left}`);
    }
}

console.log('\n== offset paging would skip rows ==');
{
    // The trap this design exists to avoid. Sealing removes a row from the
    // filter, so the next page's offset moves past rows that were never read.
    const remainingCount = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(8, '0'), vault: null }));
    const rows = remainingCount(600);

    let sealed = 0;
    for (let offset = 0; offset < rows.length; offset += 250) {
        const page = rows.filter(r => r.vault === null).slice(offset, offset + 250);
        for (const row of page) { row.vault = 'sealed'; sealed++; }
    }
    const skipped = rows.filter(r => r.vault === null).length;
    check('an offset loop demonstrably skips rows', skipped > 0,
        'if this ever reports 0 the example no longer proves the point');
    check('cursor paging gets them all where offset paging does not',
        walk(makeRows(600), 250).left === 0);
}

console.log('\n== a row already sealed is skipped, not re-sealed ==');
{
    const rows = makeRows(5);
    rows[2].vault = 'already';
    const result = walk(rows, 250);
    check('the sealed one is never even fetched', result.processed === 4,
        'processed is rows read, and one of the five was already sealed');
    check('and none are left', result.left === 0);
    check('and its value is untouched', rows[2].vault === 'already');
}

console.log('\n== the count reported is the real one ==');
{
    // A head count before the walk, so the progress bar is a fraction of
    // reality rather than of the page it happens to be on.
    const rows = makeRows(2500);
    const total = rows.filter(r => r.vault === null).length;
    check('the total counts every unsealed row', total === 2500);
    check('and exceeds the old page size', total > 1000);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

