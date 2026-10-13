/**
 * Resolve extensionless relative imports to their `.ts` file.
 *
 * Vite does this for the app; Node's type-stripping loader does not. Registering
 * it here is what lets the verify scripts import the real source modules instead
 * of re-implementing or copying their behaviour, which is the only way a test of
 * the vault's cryptography is testing the vault.
 *
 * Only relative specifiers are touched, and only ones with no extension. Node's
 * own imports and anything already carrying an extension are left alone.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
        if (!hasExtension) {
            const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
            const base = new URL(specifier, pathToFileURL(parentPath));
            for (const candidate of ['.ts', '.tsx', '/index.ts']) {
                const url = new URL(base.href + candidate);
                if (existsSync(fileURLToPath(url))) {
                    // No `format` override: Node infers TypeScript from the
                    // extension and applies its own type stripping. Claiming
                    // `module` here would hand it plain JavaScript to parse and
                    // it would choke on the first type annotation.
                    return { url: url.href, shortCircuit: true };
                }
            }
        }
    }
    return nextResolve(specifier, context);
}