/**
 * Every XML file under android/ must parse.
 *
 * This exists because of one specific failure: a comment in AndroidManifest.xml
 * used a double hyphen as a stand-in for an em dash, which XML forbids inside a
 * comment. Nothing local caught it -- `npm run build` only builds the web bundle,
 * and the Gradle build needs a JDK, a full Android SDK, and about ninety seconds.
 * The first thing that noticed was the GitHub Actions release build, at the
 * manifest-merging step, several minutes into a run and after the app had already
 * been merged.
 *
 * So the check runs here instead: a parser, on every XML file, in under a second,
 * before anything gets as far as a runner. The manifest is the only file that
 * carries hand-written comments of this kind, but the plugin manifests do not get
 * to break silently either.
 *
 * `<!-- a -- b -->` is the shape that fails. Worth noting because the instinct is
 * to use two hyphens for a dash in prose, and doing that inside an XML comment is
 * a hard parse error rather than a style warning.
 *
 * Run: node scripts/verify-android-xml.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';

const ROOT = 'android';

let checked = 0;
const failures = [];

/** Depth-first walk; android/ is small and this is clearer than a glob. */
const walk = dir => {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.xml')) check(full);
    }
};

const check = file => {
    checked++;
    const source = readFileSync(file, 'utf8');

    // Comments are pulled out first, and reported on directly. This is the check
    // that matters: a repeated hyphen inside a comment is the one thing a
    // hand-written manifest can carry that nothing else would have flagged, and
    // xmldom reports it as an unhelpful line number.
    //
    // The documents are also parsed afterwards so an unbalanced tag or a bad
    // entity is still caught -- but only as a backstop, since the comment scan
    // is the one that names the actual problem.
    let stripped = '';
    let i = 0;
    while (i < source.length) {
        if (source.startsWith('<!--', i)) {
            const end = source.indexOf('-->', i + 4);
            if (end === -1) {
                failures.push(`${file}: unterminated comment starting at offset ${i}`);
                return;
            }
            const body = source.slice(i + 4, end);
            if (body.includes('--') || body.endsWith('-')) {
                failures.push(
                    `${file}: a comment contains a repeated hyphen character, which XML ` +
                    `forbids.\n    ${body.trim().slice(0, 90)}`,
                );
            }
            i = end + 3;
            continue;
        }
        stripped += source[i];
        i++;
    }

    // xmldom is a lenient parser: it reports problems through an error handler
    // rather than by throwing, so the handler is the actual test here.
    let parseError = null;
    const parser = new DOMParser({
        onError: (level, message) => {
            // Warnings are not failures. A manifest that only warns is one Gradle
            // will still merge, and reporting it here would train people to ignore
            // this script.
            if (level !== 'warning') parseError ??= message;
        },
    });
    parser.parseFromString(stripped, 'text/xml');
    if (parseError) {
        failures.push(`${file}: ${String(parseError).split('\n')[0]}`);
    }
};

console.log('\nAndroid XML');
console.log('='.repeat(56));

if (!statSync(ROOT).isDirectory()) {
    console.log('  --   no android/ directory; nothing to check');
} else {
    walk(ROOT);
    for (const failure of failures) console.log(`  FAIL ${failure}`);
    console.log(failures.length === 0
        ? `  ok   ${checked} XML file(s) parse, and no comment carries a repeated hyphen`
        : `  ${failures.length} problem(s) across ${checked} file(s)`);
}

console.log('='.repeat(56));
process.exit(failures.length ? 1 : 0);