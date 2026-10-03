/**
 * Teaches Node's ESM resolver about this repo's extensionless relative imports.
 *
 * src/ is written for Vite, which resolves `from './dates'` to `./dates.ts`.
 * Node does not, so importing a source file directly fails on the first relative
 * import with ERR_MODULE_NOT_FOUND -- and the scripts under scripts/ that need
 * to test src/ code have to load it somehow.
 *
 * The alternative is compiling the TS first or maintaining a parallel copy of the
 * logic, and both are worse: the first breaks whenever a source file changes and
 * the second tests something other than what ships. So this only rewrites the
 * specifier, never the code.
 *
 * It deliberately does NOT do type checking or stripping. By default Node runs
 * .ts through its own type-stripping loader, which handles `import type` and
 * annotations; anything beyond that would need a real transpiler, and none is
 * needed as long as these modules stay erasable-syntax-only.
 */
import { register } from 'node:module';

register('./ts-extension-resolver-hooks.mjs', import.meta.url);