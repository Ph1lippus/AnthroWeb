/**
 * The actual resolver hook behind scripts/lib/ts-extension-resolver.mjs.
 *
 * A resolve hook receives a specifier like './dates' and has to say which file
 * that means. The rule is narrow on purpose: only relative specifiers that
 * resolve to a sibling .ts file, and only when they carry no extension already.
 * Anything else -- a bare package specifier, an absolute path, a .js specifier --
 * is passed through untouched, so this can never shadow node_modules or change
 * how the rest of the toolchain resolves.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

export function resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('.') || /\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(specifier, context);
    }

    const parentPath = context.parentURL?.startsWith('file:')
        ? fileURLToPath(context.parentURL)
        : undefined;
    if (!parentPath) return nextResolve(specifier, context);

    // No extension, and no index -- the repo's imports are always './file'.
    const candidate = resolvePath(dirname(parentPath), `${specifier}.ts`);
    if (!existsSync(candidate)) return nextResolve(specifier, context);

    return { url: pathToFileURL(candidate).href, shortCircuit: true };
}