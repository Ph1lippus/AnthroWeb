import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const BOOT_ID = 'boot';
// The boot screen must cover a blank app, not enforce a minimum display time.
// Waiting here made cached pages feel slow even after their data was available.
const MIN_BOOT_MS = 0;
const FONT_WAIT_MAX_MS = 500;

/**
 * How many consecutive frames with nothing in flight are required before the
 * splash is allowed to lift.
 *
 * One frame is not enough, and the reason is the app's own routing. A cold load
 * lands on `/`, which is a redirect: `DefaultRoute` resolves to `<Navigate>`, and
 * the page the user actually wants does not mount until a commit later. At the
 * moment the redirect lands nothing has been fetched yet, so a single quiet frame
 * arrives *before* the page exists rather than after it. Two in a row means a
 * whole frame passed with the redirect settled and still nothing in flight.
 *
 * This only has to cover the redirect. A page that loads outside React Query
 * cannot be seen from here at all, so it registers a hold of its own rather than
 * relying on this count -- see `useBootHold`.
 */
const QUIET_FRAMES = 2;

/**
 * Open holds on the boot screen, and the one place allowed to end the wait.
 * See `useBootHold` and `useBootFetchHandoff`.
 */
let bootHolds = 0;

/**
 * Set by `useBootFetchHandoff` while it is running: the single loop that decides
 * when the splash comes down. A hold releasing calls this instead of dismissing
 * directly, so "ready" keeps meaning *everything* is ready rather than whichever
 * participant happened to notice last.
 */
let requestBootRecheck: (() => void) | null = null;

/**
 * Resolve after the app faces have loaded, with a bounded fallback for a blocked
 * font provider. The root remains hidden during this entire wait.
 */
const fontsSettled = (): Promise<void> => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts || typeof fonts.ready?.then !== 'function') return Promise.resolve();

    const requested = Promise.all([
        fonts.load('400 16px "JetBrains Mono"'),
        fonts.load('500 16px "JetBrains Mono"'),
        fonts.load('600 16px "JetBrains Mono"'),
        fonts.load('700 16px "JetBrains Mono"'),
        fonts.load('400 16px "VT323"'),
        fonts.load('400 16px "Rubik Glitch"'),
    ]).then(() => undefined, () => undefined);
    const drained = fonts.ready.then(() => undefined, () => undefined);

    return Promise.race([
        Promise.all([drained, requested]).then(() => undefined),
        new Promise<void>(resolve => window.setTimeout(resolve, FONT_WAIT_MAX_MS)),
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
 * Not exported. `useBootFetchHandoff` is the only thing that should decide when
 * the splash goes, and making that unmissable is worth more than the ability to
 * call it from somewhere else. The watchdog in index.html can still tear it down
 * if the bundle never runs at all: it sets the same `data-dismissing` flag this
 * checks, so the two paths cannot both animate the same element.
 */
export const dismissBootScreenImmediate = (): void => {
    const boot = document.getElementById(BOOT_ID);
    const root = document.getElementById('root');
    if (!boot && !root) return;
    boot?.remove();
    root?.classList.add('boot-ready');
};

/**
 * Bring the boot splash back for the login -> first-page handoff.
 *
 * After sign-in the route changes to /Daily-Log while its queries are still in
 * flight, so the footer and an empty page flash for a beat before the data
 * lands. Re-creating the same static markup the cold boot uses covers that gap
 * with the splash instead: `BootHandoff` re-runs behind it (see `bootKey`) and
 * takes it down once the landing page's own fetches settle.
 *
 * `reason` replaces the "Starting up" caption so the splash can say what it is
 * waiting on ("Signing you in", ...). The font-ready class is applied up front
 * because the faces are already loaded by this point -- gating the text on
 * `document.fonts` again would leave the splash blank.
 */
export const showBootTransition = (reason = 'Loading'): void => {
    if (document.getElementById(BOOT_ID)) return;
    const root = document.getElementById('root');
    const boot = document.createElement('div');
    boot.id = BOOT_ID;
    boot.className = 'boot boot-font-ready';
    boot.setAttribute('role', 'status');
    boot.setAttribute('aria-live', 'polite');
    const inner = document.createElement('div');
    inner.className = 'boot__inner';
    const word = document.createElement('h1');
    word.className = 'boot__word';
    word.textContent = 'ANTHROWEB';
    const rule = document.createElement('hr');
    rule.className = 'boot__rule';
    const status = document.createElement('p');
    status.className = 'boot__status';
    status.textContent = reason;
    inner.append(word, rule, status);
    boot.append(inner);
    document.body.prepend(boot);
    root?.classList.remove('boot-ready');
};

/**
 * Take down the boot screen painted by index.html.
 *
 * The splash is static markup in the document rather than a React component, and
 * that is the whole point of it: it is on screen from the first byte of HTML, long
 * before the JS bundle has parsed. React never renders it, it only removes it, so
 * there is no moment where a half-hydrated app is visible behind a spinner.
 *
 * Not exported. `useBootFetchHandoff` is the only thing that should decide when
 * the splash goes, and making that unmissable is worth more than the ability to
 * call it from somewhere else. The watchdog in index.html can still tear it down
 * if the bundle never runs at all: it sets the same `data-dismissing` flag this
 * checks, so the two paths cannot both animate the same element.
 */
const dismissBootScreen = (): void => {
    const boot = document.getElementById(BOOT_ID);
    const root = document.getElementById('root');
    if (!boot || !root) return;

    // An element that is already leaving must not be scheduled twice, or the node
    // is removed while its transition is still running and the fade is cut off.
    if (boot.dataset.dismissing === 'true') return;
    boot.dataset.dismissing = 'true';

    // Keep the root hidden while the browser finishes font work and performs
    // two layout frames. Reveal and remove the splash in the same task, with no
    // fade exposing a page that is still moving underneath it.
    const elapsed = performance.now();
    void Promise.all([
        fontsSettled(),
        new Promise<void>(resolve => {
            window.setTimeout(resolve, Math.max(0, MIN_BOOT_MS - elapsed));
        }),
    ]).then(() => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                root.classList.add('boot-ready');
                boot.remove();
            });
        });
    });
};

/**
 * Keep the splash up for as long as `holding` is true, and take it down the
 * moment the last hold is released.
 *
 * The app-level signal in `useBootFetchHandoff` can only see the network. A page
 * with a gate that involves none -- the dashboard waiting on a code-split chunk,
 * anything waiting on a synchronous calculation -- has to be able to say so
 * directly, and it has to be able to do that without racing. Counting holds makes
 * "ready" mean every participant agrees, which is the only definition that is
 * correct when more than one of them is loading; otherwise the fast signal wins
 * and the slow page is left half-painted under a splash that has already gone.
 *
 * Releasing the last hold dismisses on the next frame, so the handover happens
 * against a page that has been painted rather than one still being committed.
 */
export const useBootHold = (holding: boolean): void => {
    useEffect(() => {
        if (!holding) return;
        bootHolds++;
        return () => {
            bootHolds--;
            // Goes back through the loop rather than dismissing from here. A hold
            // knows only about itself; it cannot see whether something else is
            // still in flight, and dismissing on its say-so alone would reinstate
            // exactly the race the hold count exists to remove.
            if (bootHolds === 0) requestBootRecheck?.();
        };
    }, [holding]);
};

/**
 * Take the splash down once the app has stopped fetching and nothing is holding.
 *
 * This is the general case, and it exists because hand-signalling each page does
 * not scale: there are thirty-three routes and no way to remember which of them
 * gate on data. React Query already knows the answer -- it counts the queries in
 * flight across every mounted component -- and "no query is running" is exactly
 * the condition under which no page is showing a spinner or an empty gate.
 *
 * That makes the boot handover a single transition for every route, which is the
 * whole point. What it replaced was a fixed delay, which lifted the splash over
 * whatever happened to be underneath: a cold load into the Daily Log played out
 * as the splash, then a second full-screen black page with a spinner on it, then
 * the actual page. The same three-beat jump it was meant to remove, with a
 * spinner in the middle.
 *
 * This is deliberately imperative rather than reactive. A frame loop reading
 * `client.isFetching()` is one number per frame and no renders at all, where
 * driving it off `useIsFetching` would re-run the effect on every change to the
 * answer and rebuild the loop each time. It asks the question at the moment it
 * matters -- what is the cache doing *now* -- rather than acting on a value
 * captured during the render that scheduled the check, which is exactly the stale
 * read this whole module exists to avoid.
 *
 * `epoch` re-runs the gate (defaults to mount-only): after login the splash is
 * shown again via `showBootTransition`, and `BootHandoff` passes the signed-in
 * user id so a fresh loop waits on the landing page's own fetches.
 */
export const useBootFetchHandoff = (epoch?: string): void => {
    const client = useQueryClient();

    useEffect(() => {
        let quiet = 0;
        let frame = 0;
        let running = true;

        const step = () => {
            quiet = client.isFetching() === 0 ? quiet + 1 : 0;
            if (quiet >= QUIET_FRAMES && bootHolds === 0) {
                running = false;
                dismissBootScreen();
                return;
            }
            frame = window.requestAnimationFrame(step);
        };
        frame = window.requestAnimationFrame(step);

        // Runs until the splash is gone, so it survives any change in what the
        // cache is doing. A hold releasing restarts it and clears the streak: the
        // quiet frames it had accumulated were earned before that page was ready
        // and do not count towards the moment it became ready.
        requestBootRecheck = () => {
            if (!running) return;
            quiet = 0;
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(step);
        };

        return () => {
            running = false;
            window.cancelAnimationFrame(frame);
            requestBootRecheck = null;
        };
    }, [client, epoch]);
};