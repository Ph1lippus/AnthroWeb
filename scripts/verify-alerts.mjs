/**
 * Checks the deadline warning's wording.
 *
 * The line is the entire feature: the rail shows an icon and this sentence, so a
 * wrong one is not a cosmetic bug, it is a warning that says the wrong thing.
 * Each rule below has been broken at least once.
 *
 *  - It counts by kind of work, not by subject. "3 subjects in 5 days" was the
 *    old output and it is a category of thing rather than a thing to do.
 *
 *  - Plural is its own string per kind, because "quiz" does not take a plain
 *    `s`. Anything above one is plural, "homeworks" included.
 *
 *  - In a cluster of several, every kind is counted. The list is truncated, and a
 *    bare noun beside "+1 more" is indistinguishable from a count that got cut
 *    off. Forcing the count is what surfaced the matching bug, where "1" was
 *    being paired with the plural noun: "1 lab reports".
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Compiled rather than regexed, the same way verify-notes-tree and
// verify-markdown do it, so a formatting change cannot fail a behaviour check.
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

let source = readFileSync(new URL('../src/utils/academicAlerts.ts', import.meta.url), 'utf8');
// The one runtime import is a constant from a module that would otherwise have to
// be compiled too; its value is asserted against the real one below.
source = source.replace(
    /^import \{ ITEM_CATEGORIES \} from '\.\/academicGpa';$/m,
    '',
);

const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const CATEGORIES = ['exam', 'homework', 'quiz', 'project', 'lab', 'participation', 'other'];
const gpa = ts.transpileModule(
    readFileSync(new URL('../src/utils/academicGpa.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
// Comments stripped first: the list is preceded by line comments explaining why
// exam leads, and a `[^]]*` match swallows all of them.
const gpaBare = gpa
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const gpaCategories = /ITEM_CATEGORIES[^=]*=\s*\[([^\]]*)\]/.exec(gpaBare)?.[1] ?? '';
const realOrder = gpaCategories
    .split(',')
    .map(part => part.replace(/['"\s]/g, ''))
    .filter(Boolean);
check(
    'the stubbed category order matches academicGpa',
    JSON.stringify(realOrder) === JSON.stringify(CATEGORIES),
    `${realOrder.join(',')}`,
);

const body = compiled.replace(/^export /gm, '') + '\nexport { buildAcademicAlerts };\n';
let buildAcademicAlerts;
try {
    const module = await import(
        `data:text/javascript;base64,${Buffer.from(`const ITEM_CATEGORIES = ${JSON.stringify(CATEGORIES)};\n${body}`).toString('base64')}`
    );
    buildAcademicAlerts = module.buildAcademicAlerts;
} catch (error) {
    console.log(` FAIL  academicAlerts could not be loaded: ${error.message}`);
    process.exit(1);
}

const TODAY = new Date(Date.UTC(2026, 9, 4));
const inDays = (n) => new Date(Date.UTC(2026, 9, 4 + n)).toISOString().slice(0, 10);

const course = (id, name) => ({ id, user_id: 'u', name, code: id, credits: 3 });
const item = (id, course_id, category, due, score = null) => ({
    id, user_id: 'u', course_id, name: id, category,
    weight: 1, max_score: 100, score, due_date: due,
});

const MATHS = course('c1', 'Linear Algebra');
const PHYS = course('c2', 'Physics');
const CHEM = course('c3', 'Chemistry');

const text = (courses, items) =>
    buildAcademicAlerts(courses, items, TODAY).map(alert => alert.text);

console.log('\n== one deadline ==');
{
    check('names the subject and the kind of work',
        text([MATHS], [item('i1', 'c1', 'exam', inDays(3))])[0] === 'Linear Algebra exam in 3 days',
        text([MATHS], [item('i1', 'c1', 'exam', inDays(3))])[0]);
    check('counts as plural days past one',
        text([MATHS], [item('i1', 'c1', 'homework', inDays(5))])[0] === 'Linear Algebra homework in 5 days');
    check('"1 day" is not written',
        !text([MATHS], [item('i1', 'c1', 'exam', inDays(1))])[0].includes('1 days'),
        text([MATHS], [item('i1', 'c1', 'exam', inDays(1))])[0]);
    check('tomorrow is said as tomorrow',
        text([MATHS], [item('i1', 'c1', 'exam', inDays(1))])[0] === 'Linear Algebra exam tomorrow',
        text([MATHS], [item('i1', 'c1', 'exam', inDays(1))])[0]);
    check('today is said as today, not "in 0 days"',
        text([MATHS], [item('i1', 'c1', 'exam', inDays(0))])[0] === 'Linear Algebra exam today',
        text([MATHS], [item('i1', 'c1', 'exam', inDays(0))])[0]);
    // A two-word singular is the case that broke: "1 lab reports".
    check('a two-word kind reads correctly on its own',
        text([MATHS], [item('i1', 'c1', 'lab', inDays(5))])[0] === 'Linear Algebra lab report in 5 days',
        text([MATHS], [item('i1', 'c1', 'lab', inDays(5))])[0]);
}

console.log('\n== several deadlines ==');
{
    check('counts by kind, not by subject',
        text([MATHS], [
            item('i1', 'c1', 'exam', inDays(2)),
            item('i2', 'c1', 'exam', inDays(3)),
            item('i3', 'c1', 'exam', inDays(4)),
        ])[0] === '3 exams in 2 days',
        text([MATHS], [
            item('i1', 'c1', 'exam', inDays(2)),
            item('i2', 'c1', 'exam', inDays(3)),
            item('i3', 'c1', 'exam', inDays(4)),
        ])[0]);

    check('never says "subjects"',
        !text([MATHS, PHYS, CHEM], [
            item('i1', 'c1', 'exam', inDays(2)),
            item('i2', 'c2', 'exam', inDays(3)),
            item('i3', 'c3', 'homework', inDays(4)),
        ])[0].includes('subject'));

    check('two kinds are both named with their counts',
        text([MATHS, PHYS, CHEM], [
            item('i1', 'c1', 'exam', inDays(2)),
            item('i2', 'c2', 'exam', inDays(3)),
            item('i3', 'c3', 'homework', inDays(4)),
            item('i4', 'c3', 'homework', inDays(5)),
            item('i5', 'c1', 'homework', inDays(5)),
        ])[0] === '2 exams · 3 homeworks in 2 days',
        text([MATHS, PHYS, CHEM], [
            item('i1', 'c1', 'exam', inDays(2)),
            item('i2', 'c2', 'exam', inDays(3)),
            item('i3', 'c3', 'homework', inDays(4)),
            item('i4', 'c3', 'homework', inDays(5)),
            item('i5', 'c1', 'homework', inDays(5)),
        ])[0]);

    // Plurals. Anything above one takes the plural, "homeworks" included.
    check('homework is pluralised above one',
        text([MATHS], [item('i1', 'c1', 'homework', inDays(2)), item('i2', 'c1', 'homework', inDays(3))])[0]
            === '2 homeworks in 2 days',
        text([MATHS], [item('i1', 'c1', 'homework', inDays(2)), item('i2', 'c1', 'homework', inDays(3))])[0]);
    check('quizzes take an es',
        text([MATHS], [item('i1', 'c1', 'quiz', inDays(2)), item('i2', 'c1', 'quiz', inDays(3))])[0]
            === '2 quizzes in 2 days');
    check('labs become "lab reports"',
        text([MATHS], [item('i1', 'c1', 'lab', inDays(2)), item('i2', 'c1', 'lab', inDays(3))])[0]
            === '2 lab reports in 2 days');
    check('participation grades pluralise',
        text([MATHS], [item('i1', 'c1', 'participation', inDays(2)), item('i2', 'c1', 'participation', inDays(3))])[0]
            === '2 participation grades in 2 days');
    check('one is never plural',
        !text([MATHS], [item('i1', 'c1', 'exam', inDays(2))])[0].includes('exams'),
        text([MATHS], [item('i1', 'c1', 'exam', inDays(2))])[0]);

    // A single item inside a cluster is counted, or it is indistinguishable from
    // a count lost to the truncation.
    check('a lone kind inside a cluster is still counted',
        text([MATHS, PHYS], [item('i1', 'c1', 'exam', inDays(0)), item('i2', 'c2', 'project', inDays(1))])[0]
            === '1 exam · 1 project today',
        text([MATHS, PHYS], [item('i1', 'c1', 'exam', inDays(0)), item('i2', 'c2', 'project', inDays(1))])[0]);

    check('truncation says how many kinds were dropped',
        text([MATHS, PHYS, CHEM], [
            item('i1', 'c1', 'quiz', inDays(1)),
            item('i2', 'c2', 'quiz', inDays(2)),
            item('i3', 'c3', 'lab', inDays(3)),
            item('i4', 'c1', 'participation', inDays(4)),
        ])[0] === '2 quizzes · 1 lab report +1 more tomorrow',
        text([MATHS, PHYS, CHEM], [
            item('i1', 'c1', 'quiz', inDays(1)),
            item('i2', 'c2', 'quiz', inDays(2)),
            item('i3', 'c3', 'lab', inDays(3)),
            item('i4', 'c1', 'participation', inDays(4)),
        ])[0]);

    // Types are ranked by ITEM_CATEGORIES, so an exam reads first whatever order
    // the rows arrived in.
    check('kinds are ranked, not in arrival order',
        text([MATHS], [item('i1', 'c1', 'homework', inDays(2)), item('i2', 'c1', 'exam', inDays(3))])[0]
            === '1 exam · 1 homework in 2 days',
        text([MATHS], [item('i1', 'c1', 'homework', inDays(2)), item('i2', 'c1', 'exam', inDays(3))])[0]);
}

console.log('\n== what is not a deadline ==');
{
    check('a graded item is not a deadline',
        text([MATHS], [item('i1', 'c1', 'exam', inDays(2), 88)]).length === 0);
    check('a past date is not a deadline',
        text([MATHS], [item('i1', 'c1', 'exam', inDays(-2))]).length === 0);
    check('an undated item is not a deadline',
        text([MATHS], [item('i1', 'c1', 'exam', null)]).length === 0);
}

console.log('\n== urgency ==');
{
    const urgent = buildAcademicAlerts([MATHS], [item('i1', 'c1', 'exam', inDays(2))], TODAY);
    check('inside three days is urgent', urgent[0]?.urgent === true);
    const later = buildAcademicAlerts([MATHS], [item('i1', 'c1', 'exam', inDays(9))], TODAY);
    check('nine days out is not', later[0]?.urgent === false);
    check('today is urgent', buildAcademicAlerts([MATHS], [item('i1', 'c1', 'exam', inDays(0))], TODAY)[0]?.urgent === true);
}

console.log('\n== shape ==');
{
    const alerts = buildAcademicAlerts([MATHS], [item('i1', 'c1', 'exam', inDays(3))], TODAY);
    check('one alert per cluster', alerts.length === 1);
    check('every alert carries a non-empty line',
        alerts.every(a => typeof a.text === 'string' && a.text.length > 0));
    check('two far-apart deadlines are two clusters',
        buildAcademicAlerts([MATHS], [
            item('i1', 'c1', 'exam', inDays(1)),
            item('i2', 'c1', 'exam', inDays(25)),
        ], TODAY).length === 2);
}

console.log(
    fail === 0 ? `\nALL PASS: ${pass} checks` : `\n${fail} FAILED of ${pass + fail}`,
);
process.exit(fail === 0 ? 0 : 1);
