/**
 * Checks the built page's PWA wiring, because none of it is visible in a screenshot.
 *
 * The bug this file exists for is one that survives every green build. The page used
 * to ship two `<link rel="manifest">` tags -- a hand-written one in `public/` and the
 * one vite-plugin-pwa injects -- and a browser takes the first. The hand-written file
 * won, and it was wrong: white theme and background colours on a black app, and no
 * 192 or 512 icon. The build was green, the service worker was registered, and the
 * app still did not install properly. Nothing short of reading the output would have
 * caught it.
 *
 *     node scripts/verify-pwa.mjs
 *
 * Reads `dist/`, so it checks the artefact that actually ships rather than the
 * configuration that was supposed to produce it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

let pass = 0, fail = 0;
const check = (name, condition, detail = '') => {
    if (condition) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`); }
};

console.log('\n== pwa: the built artefact ==');

// A missing `dist` is a confusing way to fail. The reader is going to look at this
// output and assume it ran against a broken build rather than against none.
if (!existsSync(dist)) {
    console.error('  FAIL no dist/ -- run `npm run build` first');
    process.exit(1);
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
// Comments are stripped before anything is counted. The source page documents this
// very bug in an HTML comment that contains a literal `<link rel="manifest">`, and a
// naive grep reports two manifests for a build that has exactly one -- which is a
// good way to spend an afternoon chasing a duplicate that is not there.
const markup = html.replace(/<!--[\s\S]*?-->/g, '');

console.log('\n== one manifest, and it is the generated one ==');

const manifestLinks = markup.match(/<link[^>]*rel="manifest"[^>]*>/g) ?? [];
check('exactly one manifest link', manifestLinks.length === 1,
    `${manifestLinks.length}: ${manifestLinks.join(' | ')}`);
check('and it points at the generated manifest',
    /href="\/manifest\.webmanifest"/.test(manifestLinks[0] ?? ''), manifestLinks[0] ?? '(none)');

const manifestPath = join(dist, 'manifest.webmanifest');
check('the generated manifest exists', existsSync(manifestPath));

// A duplicate can also be left behind in `public/`, where it is copied verbatim on
// every build and silently outranks the generated one.
check('and no hand-written one is left in public/ to compete with it',
    !existsSync(join(root, 'public', 'site.webmanifest')),
    'public/site.webmanifest is copied into dist/ and wins the lookup');

console.log('\n== the manifest installs ==');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

/**
 * Chrome's installability criteria, in the order they fail.
 *
 * Size is the one that bites here, because a manifest carrying only a 48x48 .ico
 * looks complete and is rejected silently -- the install prompt simply never appears.
 */
check('it has a name', typeof manifest.name === 'string' && manifest.name.length > 0, manifest.name);
check('and a short name for the home screen',
    typeof manifest.short_name === 'string' && manifest.short_name.length > 0, manifest.short_name);
check('a start url', typeof manifest.start_url === 'string' && manifest.start_url.length > 0,
    manifest.start_url);
check('a scope', typeof manifest.scope === 'string' && manifest.scope.length > 0, manifest.scope);
// `id` defaults to `start_url`, so an omitted `id` is not "no identity" -- it is an
// identity that silently moves the next time the start URL is edited, which the
// launcher reads as a different app. Pinning it is what makes a routing change a
// routing change. It is not required to differ from `start_url`; both being '/' is
// the stable, intended pairing.
check('it pins an id, so identity cannot drift with the start url',
    typeof manifest.id === 'string' && manifest.id.length > 0, JSON.stringify(manifest.id));
check('and the pinned id is within its own scope',
    typeof manifest.id === 'string' && typeof manifest.scope === 'string'
        && manifest.scope.startsWith(manifest.id),
    `id ${manifest.id}, scope ${manifest.scope}`);
check('a display mode', typeof manifest.display === 'string', manifest.display);
check('and a preference order for platforms that cannot honour it',
    Array.isArray(manifest.display_override) && manifest.display_override.length > 0,
    JSON.stringify(manifest.display_override));

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
const sizes = new Set(icons.map(icon => icon.sizes));
check('it declares a 192px icon, which installability requires',
    sizes.has('192x192'), [...sizes].join(', '));
check('and a 512px one, which the install dialog shows',
    sizes.has('512x512'), [...sizes].join(', '));

// Every declared icon has to actually be in the build. A manifest that points at a
// 404 still validates, still parses, and still leaves the launcher with no image.
const missingIcons = icons.filter(icon => !existsSync(join(dist, icon.src.replace(/^\//, ''))));
check('every icon it declares is actually in the build',
    missingIcons.length === 0,
    missingIcons.map(icon => icon.src).join(', '));

console.log('\n== maskable, because android draws its own mask ==');

const maskable = icons.filter(icon => String(icon.purpose ?? '').includes('maskable'));
check('it declares a maskable icon for adaptive launchers', maskable.length > 0,
    icons.map(i => `${i.sizes}/${i.purpose ?? 'any'}`).join(', '));

// A maskable icon is cropped by the launcher, so its own baked-in shape is a bug: a
// rounded-corner icon is masked a second time and shows the wallpaper through the gap.
for (const icon of maskable) {
    const file = join(dist, icon.src.replace(/^\//, ''));
    const bytes = readFileSync(file);
    // The four corners of the icon are what a mask reveals. IHDR is 8 bytes of
    // signature, then the chunk header, then width/height, so the pixel data starts
    // well past it -- and for this check only the colour type matters.
    const colourType = bytes[25];
    check(`${icon.src} is 8-bit RGBA, so full-bleed is expressible`,
        bytes[24] === 8 && colourType === 6, `depth ${bytes[24]}, colour type ${colourType}`);
}

console.log('\n== the two platforms read different fields ==');

check('apple-touch-icon is declared, since iOS ignores the manifest for it',
    /rel="apple-touch-icon"[^>]*sizes="180x180"/.test(markup));
check('and apple-mobile-web-app-capable, since iOS ignores display: standalone too',
    /name="apple-mobile-web-app-capable"/.test(markup));

// The one field the page and the manifest both carry, and where they must agree: the
// browser paints from the meta tag before it has fetched the manifest, so a mismatch
// flashes one colour and settles into another.
const metaTheme = markup.match(/<meta[^>]*name="theme-color"[^>]*content="([^"]+)"/)?.[1];
check('the page and the manifest agree on theme-color',
    metaTheme != null && metaTheme.toLowerCase() === String(manifest.theme_color).toLowerCase(),
    `page ${metaTheme}, manifest ${manifest.theme_color}`);

console.log('\n== it survives the host ==');

// The build being correct is only half of it: the same files have to arrive with the
// right headers, and all three of these fail quietly.
//
// Which is why the reasoning lives here rather than in `vercel.json`. JSON has no
// comments, and the obvious substitute -- a `"//"` key -- is rejected: Vercel
// validates a header entry against a schema with `additionalProperties: false`, so
// `headers[0] should NOT have additional property "//"` is a deploy-blocking error
// rather than an ignored extra. The check below is the enforcement, so the "why" can
// sit with the thing that verifies it.
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const headerFor = (path, key) => (vercel.headers ?? [])
    .filter(entry => entry.source === path)
    .flatMap(entry => entry.headers ?? [])
    .find(header => header.key.toLowerCase() === key.toLowerCase())?.value;

// Anything but `source` and `headers` fails Vercel's schema, and does so at deploy
// time -- after review, on the one change nobody smoke-tested locally. Asserting the
// shape here turns that into a local failure with a sentence attached.
const strayKeys = (vercel.headers ?? [])
    .flatMap(entry => Object.keys(entry).filter(key => key !== 'source' && key !== 'headers'));
check('no header entry carries a key Vercel\'s schema rejects',
    strayKeys.length === 0,
    strayKeys.length ? `${strayKeys.join(', ')} -- vercel.json rejects unknown keys and blocks the deploy` : '');

// The same trap one level down: the key/value objects are validated too.
const strayHeaderKeys = (vercel.headers ?? [])
    .flatMap(entry => entry.headers ?? [])
    .flatMap(header => Object.keys(header).filter(key => key !== 'key' && key !== 'value'));
check('nor does any header it sets',
    strayHeaderKeys.length === 0, strayHeaderKeys.join(', '));

// `sw.js` is a fixed filename. Workbox versions the file's *contents* internally, but
// that only reaches the client if the file itself is revalidated on every visit -- and
// a CDN that caches it hard means clients keep running the previous service worker
// indefinitely: new bundle, old worker, and an update that appears to have shipped
// and has not landed. `no-cache` revalidates rather than forbidding storage, which is
// what keeps offline support working.
check('the service worker is revalidated rather than cached hard',
    headerFor('/sw.js', 'Cache-Control')?.includes('must-revalidate') === true,
    JSON.stringify(headerFor('/sw.js', 'Cache-Control')));
// The registration shim, same reasoning: a stale copy registers a stale worker.
check('the registration shim is revalidated too',
    headerFor('/registerSW.js', 'Cache-Control')?.includes('must-revalidate') === true,
    JSON.stringify(headerFor('/registerSW.js', 'Cache-Control')));
// Safari refuses a manifest served as anything other than application/manifest+json,
// and refuses it silently: the app installs, then opens with browser chrome and no
// icon. Chrome is lenient here, which is how this works in testing and breaks on iOS.
check('the manifest is served as application/manifest+json, which Safari requires',
    headerFor('/manifest.webmanifest', 'Content-Type')?.includes('application/manifest+json') === true,
    JSON.stringify(headerFor('/manifest.webmanifest', 'Content-Type')));

console.log('\n== it works offline ==');

check('a service worker was generated', existsSync(join(dist, 'sw.js')));
check('and the page registers it', /registerSW\.js/.test(markup));

const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
check('it precaches the shell, so a cold offline load has something to render',
    sw.includes('"index.html"'));
check('and answers navigations from the cache, so a deep link works offline',
    /NavigationRoute/.test(sw));
check('with no runtime cache-first rule, which is what kept the app on a month-old bundle',
    !/CacheFirst/.test(sw));

// The precache has to cover the shell, or "offline ready" is a claim rather than a
// fact. These are the files a cold start needs before React runs at all.
const precached = (sw.match(/url:"([^"]+)"/g) ?? []).map(u => u.slice(5, -1));
check('the precache includes every icon the manifest needs',
    icons.every(icon => precached.includes(icon.src.replace(/^\//, ''))),
    'an icon fetched only from the network will not be there for an offline install');

// Every precached path has to exist in the build. The catch-all SPA rewrite means a
// missing file does not 404 -- it quietly serves `index.html` -- so the fetch
// succeeds and the app then fails to parse HTML as JavaScript. Offline is the only
// moment that surfaces, which is the worst possible time to find out.
const notBuilt = precached.filter(url => !existsSync(join(dist, url)));
check('every precached path is actually in the build',
    notBuilt.length === 0, notBuilt.join(', '));

console.log(`\n${fail === 0 ? `ALL PASS: ${pass} checks` : `${fail} FAILED of ${pass + fail}`}`);
process.exit(fail === 0 ? 0 : 1);