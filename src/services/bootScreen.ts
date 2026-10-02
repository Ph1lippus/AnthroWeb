import { useEffect } from 'react';

const BOOT_ID = 'boot';
const FADE_MS = 240;

/**
 * How long the app waits after the session resolves before taking the splash
 * down by itself.
 *
 * This is the *default* handover, not a fallback, and it is deliberately short.
 * Most routes have their content synchronously and need nothing else: they paint
 * in the same commit that mounts the shell, so all this has to cover is the one
 * frame between that commit and the splash starting its fade.
 *
 * The routes that cannot -- the dashboard, which renders nothing until a
 * code-split chart chunk and three queries are in hand -- pass their own gate to
 * `useBootDismiss` instead and win the race, because `dismissBootScreen` is
 * idempotent and first-call-wins. A long value here would be the wrong trade: it
 * would hold every page that *can* paint immediately behind a splash for no
 * reason, and it would still not rescue a route whose gate rejects, because a
 * fixed delay cannot tell "ready" from "never going to be".
 */
export const BOOT_DEFAULT_DELAY_MS = 250;

/**
 * How long the splash will wait for webfonts before it gives up and fades anyway.
 *
 * A cap, not a preference: the app must not be held hostage by a slow, throttled
 * or blocked font request, and 300ms is short enough that a warm load never
 * notices it.
 */
const FONT_WAIT_MS = 300;

/**
 * Resolves when the webfont queue has drained, or when the wait cap expires.
 *
 * The app's faces are served with `display=swap`, so the browser paints a
 * fallback immediately and swaps the real face in whenever it lands. `fonts` is
 * missing in older browsers and absent entirely under some test environments, so
 * both the property and `ready.then` are checked before this is trusted.
 *
 * The splash's own display face is the exception: Rubik Glitch is requested with
 * `display=optional`, so it either arrives before first paint or is never used --
 * there is no swap to wait for. It still appears in the queue, so waiting for
 * `ready` covers it either way.
 */
const fontsSettled = (): Promise<void> => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts || typeof fonts.ready?.then !== 'function') return Promise.resolve();
    // Mapped to void rather than `.catch(() => undefined)`, which would widen the
    // race to `Promise<void | FontFaceSet>` because the rejection handler returns
    // the resolved set. Nothing below needs the value.
    const drained = fonts.ready.then(
        () => undefined,
        () => undefined,
    );
    return Promise.race([
        drained,
        new Promise<void>(resolve => window.setTimeout(resolve, FONT_WAIT_MS)),
    ]);
};

/**
 * Take down the boot screen painted by index.html.
 *
 * The splash is static markup in the document rather than a React component, and
 * that is the whole point of it: it is on screen from the first byte of HTML, long
 * before the JS bundle has parsed. React never renders it, it only removes it, so
 * there is no moment where a half-hydrated app is visible behind a spinner.
 *
 * Idempotent, because both the app entry point and the failure path in index.html
 * can end up calling it.
 */
export const dismissBootScreen = (): void => {
    const boot = document.getElementById(BOOT_ID);
    if (!boot) return;

    // An element that is already leaving must not be scheduled twice, or the node
    // is removed while its transition is still running and the fade is cut off.
    if (boot.dataset.dismissing === 'true') return;
    boot.dataset.dismissing = 'true';

    const reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Hold the splash until the fonts have settled.
    //
    // A swap is invisible while the splash covers the screen and glaring the
    // instant it does not: the fade reveals the app underneath, and if the real
    // faces land partway through that cross-fade the text visibly re-shapes as you
    // watch. That is the jump at the end of the boot transition. Waiting for the
    // queue to drain means the cross-fade only ever reveals finished text.
    //
    // The caller has already committed the app to the DOM by the time this runs,
    // so the faces the app needs are already requested and `ready` genuinely
    // covers them. The splash stays blocking (it never gets `pointer-events:
    // none` here) for the duration, so those extra milliseconds are still spent
    // showing the splash rather than showing a half-styled page.
    void fontsSettled().then(() => {
        if (reducedMotion) {
            boot.remove();
            return;
        }

        boot.classList.add('boot--dismissing');
        window.setTimeout(() => boot.remove(), FADE_MS);
    });
};

/**
 * Hold the splash until this page actually has something to show.
 *
 * The splash used to be dismissed the moment the auth session resolved, which is
 * not the same moment there is a page: `DashboardPage` renders nothing until the
 * Recharts chunk and three queries are in hand, so the transition played out as
 * black screen, then navbars and an empty page, then the real dashboard a beat
 * later -- two paints and a jump, where it should have been one cross-fade onto
 * finished content.
 *
 * So a page calls this with whatever its own readiness gate is, and the splash
 * comes down on that instead. Hooks run even while a component returns `null`, so
 * a page that renders nothing before it is ready can still hold the splash open
 * without restructuring how it gates.
 *
 * The next frame is awaited first. Dismissal happens in an effect, and an effect
 * runs after commit but before paint -- fading there would start the transition
 * against a tree the compositor has not drawn yet, and the splash would lift
 * over an unpainted frame.
 */
export const useBootDismiss = (ready: boolean): void => {
    useEffect(() => {
        if (!ready) return;
        const frame = window.requestAnimationFrame(() => dismissBootScreen());
        return () => window.cancelAnimationFrame(frame);
    }, [ready]);
};