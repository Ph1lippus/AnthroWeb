/**
 * Verifies the notes tree: ordering, folding, and the arithmetic behind a drag.
 *
 * These are pure functions over a flat list, which is exactly the part of the
 * notes rail that cannot be checked by looking at it. Every one of them has a
 * failure mode that looks like something else entirely:
 *
 *  - `buildNoteTree` promotes a cycle to the top level rather than looping, so a
 *    bad parent id shows up as a page that moved, not as a page that vanished.
 *
 *  - `visibleRows` decides what the reader can see. Getting the depth bookkeeping
 *    wrong either leaves a folded branch on screen or hides a page that was never
 *    folded. Branches start folded, so it is handed the set of branches that were
 *    *opened* -- the two are not interchangeable, since a list of folded branches
 *    says nothing about one nobody has touched.
 *
 *  - `dropPlacement` is the one that matters. A position is a fraction between
 *    two others rather than an index, the dragged page is left out of its own
 *    sibling group before the midpoint is taken, and a drop onto its own subtree
 *    has to be refused. Each of those is a line of code, and each of them
 *    produces a list that looks plausible while being wrong.
 *
 * Compiled with `transpileModule` and evaluated from a data URL, the same way
 * `verify-markdown` does it: the module's only import is a type, so there is
 * nothing left to resolve after the types are stripped.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/noteTree.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

let tree;
try {
    tree = await import(
        `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );
} catch (error) {
    console.log(` FAIL  noteTree could not be loaded: ${error.message}`);
    process.exit(1);
}

const { buildNoteTree, visibleRows, subtreeIds, rowIndex, previousSibling, nextSibling,
    dropPlacement, promotePlacement, positionOf } = tree;

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

/**
 * One page. Created dates descend with `n` so the newest-page tie-break is
 * unambiguous everywhere it is not the thing under test.
 */
let clock = 0;
const note = (id, { parent = null, position = 0, pinned = false, title = id } = {}) => ({
    id,
    user_id: 'u',
    title,
    content: '',
    is_pinned: pinned,
    notes_parent_id: parent,
    notes_position: position,
    notes_tags: [],
    created_at: new Date(Date.UTC(2026, 0, 1 + clock++)).toISOString(),
});

/**
 * The fixture every case below is stated against:
 *
 *   A
 *   B
 *     B1
 *     B2
 *   C
 *
 * so `rows` is A, B, B1, B2, C at depths 0, 0, 1, 1, 0.
 */
const FIXTURE = () => [
    note('A', { position: 0 }),
    note('B', { position: 1 }),
    note('B1', { parent: 'B', position: 0 }),
    note('B2', { parent: 'B', position: 1 }),
    note('C', { position: 2 }),
];

const order = rows => rows.map(row => row.note.id).join(',');
const depths = rows => rows.map(row => row.depth).join(',');

console.log('\n== buildNoteTree ==');
{
    const rows = buildNoteTree(FIXTURE());
    check('parents come before their children', order(rows) === 'A,B,B1,B2,C', order(rows));
    check('depths follow the tree', depths(rows) === '0,0,1,1,0', depths(rows));
    check('childCount is per row', rows.map(r => r.childCount).join(',') === '0,2,0,0,0',
        rows.map(r => r.childCount).join(','));

    // A page whose parent is not in the list is a root, not an orphan: it has to
    // stay reachable from the rail rather than disappear with its parent.
    const orphan = buildNoteTree([note('X'), note('Y', { parent: 'gone' })]);
    // Y,X rather than X,Y: both are roots at position 0, so the newest-first
    // tie-break decides, and Y was created second.
    check('a page whose parent is missing becomes a root', order(orphan) === 'Y,X', order(orphan));

    // Pinned first at every level, and a pin does not lift a child out of its
    // parent -- ordering is per level, not global.
    const pinned = buildNoteTree([
        note('A', { position: 0 }),
        note('B', { position: 1, pinned: true }),
        note('B1', { parent: 'B', position: 0 }),
        note('B2', { parent: 'B', position: 1, pinned: true }),
    ]);
    check('pinned pages sort first within their own level',
        order(pinned) === 'B,B2,B1,A', order(pinned));

    // A cycle has no root to enter from. The sweep has to rescue it or every page
    // in the cycle vanishes from the rail at once.
    const cyclic = buildNoteTree([note('P', { parent: 'Q' }), note('Q', { parent: 'P' })]);
    check('a parent cycle is shown rather than dropped', cyclic.length === 2, order(cyclic));

    // Positions are the order the user arranged. Two pages at the same position
    // are pre-migration rows and fall through to newest first.
    const tied = buildNoteTree([
        note('older', { position: 0 }),
        note('newer', { position: 0 }),
    ]);
    check('equal positions fall back to newest first', order(tied) === 'newer,older', order(tied));
}

console.log('\n== visibleRows ==');
{
    // The set is the branches that were *opened*. Branches start folded, so this
    // is the exception list -- and the two are not interchangeable: a set of folded
    // branches cannot say what to do with a branch nobody had touched, which is
    // most of them. That is the bug these checks are here to catch.
    const rows = buildNoteTree(FIXTURE());

    const untouched = visibleRows(rows, new Set());
    check('a branch starts folded', order(untouched) === 'A,B,C', order(untouched));

    const opened = visibleRows(rows, new Set(['B']));
    check('opening a branch reveals its children', order(opened) === 'A,B,B1,B2,C', order(opened));

    // Opening a child does not open the parent it is hidden behind, so nothing
    // appears. The alternative -- treating any id in the set as permission to
    // reveal it -- would draw a child with no visible parent above it.
    check('opening a child inside a folded parent reveals nothing',
        order(visibleRows(rows, new Set(['B1']))) === 'A,B,C',
        order(visibleRows(rows, new Set(['B1']))));

    // A leaf is never folded, so naming one in the set changes nothing.
    check('opening a leaf changes nothing',
        order(visibleRows(rows, new Set(['B1', 'B2']))) === 'A,B,C',
        order(visibleRows(rows, new Set(['B1', 'B2']))));

    // A stale id -- a page deleted elsewhere -- must not blank the whole rail.
    check('an unknown id is ignored', order(visibleRows(rows, new Set(['nope']))) === 'A,B,C',
        order(visibleRows(rows, new Set(['nope']))));

    // Nested folding: two levels down, each fold is still only its own subtree,
    // and the depth bookkeeping has to reset per branch or B2 -- deeper than B1
    // but a sibling of it -- would be taken along with it.
    const nested = buildNoteTree([
        note('A'), note('B', { parent: 'A' }), note('C', { parent: 'B' }),
        note('D', { parent: 'C' }),
    ]);
    check('a whole chain starts folded down to the page itself',
        order(visibleRows(nested, new Set())) === 'A', order(visibleRows(nested, new Set())));
    check('opening the outermost page stops there',
        order(visibleRows(nested, new Set(['A']))) === 'A,B', order(visibleRows(nested, new Set(['A']))));
    check('opening down to the middle opens one more level',
        order(visibleRows(nested, new Set(['A', 'B']))) === 'A,B,C',
        order(visibleRows(nested, new Set(['A', 'B']))));
    check('opening all the way leaves the chain to it',
        order(visibleRows(nested, new Set(['A', 'B', 'C']))) === 'A,B,C,D',
        order(visibleRows(nested, new Set(['A', 'B', 'C']))));

    // The rule both the tree and the rail's chevron have to agree on. A branch the
    // tree folded behind a chevron drawn as open is a control claiming to show
    // children that are hidden.
    check('isFolded matches what visibleRows did',
        tree.isFolded(rows.find(row => row.note.id === 'B'), new Set()) === true &&
        tree.isFolded(rows.find(row => row.note.id === 'B'), new Set(['B'])) === false &&
        tree.isFolded(rows.find(row => row.note.id === 'A'), new Set()) === false,
        'A is a leaf, so it is never folded');
}

console.log('\n== subtreeIds ==');
{
    const rows = buildNoteTree(FIXTURE());
    check('a subtree is the root plus everything under it',
        [...subtreeIds(rows, 'B')].sort().join(',') === 'B,B1,B2',
        [...subtreeIds(rows, 'B')].sort().join(','));
    check('a leaf is just itself', [...subtreeIds(rows, 'B1')].join(',') === 'B1');
    check('an unknown id is empty', subtreeIds(rows, 'nope').size === 0);
    check('it stops at the next row of the same depth',
        subtreeIds(rows, 'A').size === 1, [...subtreeIds(rows, 'A')].join(','));
}

console.log('\n== siblings ==');
{
    const rows = buildNoteTree(FIXTURE());
    check('rowIndex finds a row', rowIndex(rows, 'B2') === 3, String(rowIndex(rows, 'B2')));
    check('rowIndex is -1 for a missing row', rowIndex(rows, 'nope') === -1);

    // The scan has to step over a row's own children to find the row above it at
    // its own depth, or B1 would report B as its previous sibling and B2 as its
    // next -- which would silently flatten the tree.
    check('previousSibling steps over descendants',
        previousSibling(rows, 3).note.id === 'B1', previousSibling(rows, 3)?.note.id);
    check('nextSibling steps over descendants',
        nextSibling(rows, 1).note.id === 'C', nextSibling(rows, 1)?.note.id);
    check('the first child has no previous sibling',
        previousSibling(rows, 2) === null);
    check('the last root has no next sibling', nextSibling(rows, 4) === null);
}

console.log('\n== dropPlacement ==');
{
    const rows = buildNoteTree(FIXTURE());
    // Roots sit at positions 0, 1, 2 and B's children at 0, 1. Every "between"
    // case below is A or C landing between two of them, so the expected value is
    // the midpoint of those two positions -- computed with the dragged page left
    // out of the group, which is the whole point of that step.
    const before = dropPlacement(rows, 'A', 'C', 'before');
    check('before a page lands between it and the one above',
        before.parentId === null && before.position === 1.5, JSON.stringify(before));
    const after = dropPlacement(rows, 'A', 'B', 'after');
    check('after a page lands between it and the one below',
        after.parentId === null && after.position === 1.5, JSON.stringify(after));

    // The regression this whole group is for: C's immediate neighbour in the
    // flattened list is C's own... no -- B2, a child of B. An outward scan from C
    // stops there and finds a group of one, which puts every drop relative to C
    // itself. These two assertions are the difference between 1.5 and C's own
    // position minus one.
    check('a drop onto the last root still sees the roots before it',
        dropPlacement(rows, 'C', 'A', 'before').position === -1,
        String(dropPlacement(rows, 'C', 'A', 'before').position));
    check('a drop onto the first root still sees the roots after it',
        dropPlacement(rows, 'A', 'C', 'after').position === 3,
        String(dropPlacement(rows, 'A', 'C', 'after').position));

    // Dropping into a page with no children yet puts it at 0; with children, past
    // the last of them.
    check('into an empty page starts at 0',
        dropPlacement(rows, 'A', 'C', 'into').position === 0);
    const intoB = dropPlacement(rows, 'A', 'B', 'into');
    check('into a page lands past its last child',
        intoB.parentId === 'B' && intoB.position === 2, JSON.stringify(intoB));

    // Reordering within a group. Moving C above B: C leaves the group, so the
    // midpoint is between nothing and B -- not between B and C.
    const movedUp = dropPlacement(rows, 'C', 'B', 'before');
    check('a page moved up is placed relative to its new neighbours',
        movedUp.parentId === null && movedUp.position === 0.5, JSON.stringify(movedUp));

    // Reordering within a nested group has to work the same way, or dragging a
    // sub-page does nothing at all. B2 leaves B's child group, so only B1 is left
    // to be above it, and the position has to come from that one alone.
    const subMoved = dropPlacement(rows, 'B2', 'B1', 'before');
    check('a sub-page can be reordered among its siblings',
        subMoved.parentId === 'B' && subMoved.position === -1, JSON.stringify(subMoved));

    // A page cannot become its own ancestor. B1's parent is B, so "above B1"
    // would make B a child of itself -- which is why the guard has to cover the
    // before/after bands too and not just the middle one.
    check('a page cannot be dropped on itself', dropPlacement(rows, 'B', 'B', 'into') === null);
    check('a page cannot be dropped into its own child',
        dropPlacement(rows, 'B', 'B1', 'into') === null);
    check('a page cannot be dropped below its own child',
        dropPlacement(rows, 'B', 'B1', 'after') === null);
    check('a page cannot be dropped above its own child',
        dropPlacement(rows, 'B', 'B1', 'before') === null);
    check('the guard reaches a whole branch, not just the child',
        dropPlacement(rows, 'B', 'B2', 'into') === null);
    check('a page can be dropped beside an unrelated page',
        dropPlacement(rows, 'B2', 'C', 'before') !== null);
    check('an unknown target is refused', dropPlacement(rows, 'A', 'nope', 'into') === null);

    // A page dropped into a leaf that is not its own descendant: parentId becomes
    // the leaf, and the leaf's own siblings are irrelevant to the position.
    check('into a leaf sets that page as the parent',
        dropPlacement(rows, 'B2', 'C', 'into').parentId === 'C');
}

console.log('\n== promotePlacement ==');
{
    const rows = buildNoteTree(FIXTURE());
    check('promoting takes a page out of its parent',
        JSON.stringify(promotePlacement(rows, 'B1')) ===
            JSON.stringify({ parentId: null, position: 3 }),
        JSON.stringify(promotePlacement(rows, 'B1')));
    check('promoting a missing page is refused', promotePlacement(rows, 'nope') === null);
    check('promoting the last root still places it',
        promotePlacement(rows, 'C').position === 3);
}

console.log('\n== positionOf ==');
{
    // notes_position is a numeric, and a numeric comes back from Postgres as a
    // string. That is not cosmetic: the midpoint is (low + high) / 2, and on two
    // strings that is "0.51.5" / 2 -- NaN. Every drop would write a null, the
    // sort would tie, and the page would land arbitrarily while the drag
    // indicator showed the move as accepted.
    check('a numeric string becomes a number', positionOf(note('x', { position: '1.5' })) === 1.5);
    check('a plain number passes through', positionOf(note('x', { position: 2 })) === 2);
    check('a string zero is zero, not falsy-zero',
        positionOf(note('x', { position: '0' })) === 0);
    check('null is zero', positionOf(note('x', { position: null })) === 0);
    check('undefined is zero', positionOf({ notes_position: undefined }) === 0);
    check('a missing key is zero', positionOf({}) === 0);
    // Anything unparseable has to land on 0 rather than NaN, or it poisons every
    // comparison it takes part in.
    check('nonsense is zero, not NaN', positionOf({ notes_position: 'abc' }) === 0);
    check('Infinity is zero', positionOf({ notes_position: Infinity }) === 0);
    check('NaN is zero', positionOf({ notes_position: NaN }) === 0);

    // The behaviour that actually matters, on the shape the API returns.
    const asStrings = [
        { ...note('A', { position: 0 }), notes_position: '0' },
        { ...note('B', { position: 1 }), notes_position: '1' },
        { ...note('C', { position: 2 }), notes_position: '2' },
    ];
    const stringRows = buildNoteTree(asStrings);
    check('string positions still order the list', order(stringRows) === 'A,B,C', order(stringRows));
    const mid = dropPlacement(stringRows, 'A', 'C', 'before');
    check('a midpoint between two string positions is a number, not NaN',
        mid.position === 1.5, String(mid.position));
    check('and it is not a concatenated string', typeof mid.position === 'number',
        typeof mid.position);
}

console.log(
    fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`,
);
process.exit(fail === 0 ? 0 : 1);
