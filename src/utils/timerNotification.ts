/**
 * The system notification a finished timer raises.
 *
 * Everything here exists because of one failure: the alert used to be
 * `new Notification(...)` and nothing, a browser or a user, ever saw one.
 *
 * Three separate things have to be true for a notification to appear, and each
 * one was failing on its own:
 *
 *  - **Permission is `granted`.** It is `default` until the browser is asked,
 *    and it stays `default` forever if nobody asks. The setting defaulted to
 *    "on", so a timer that had never been touched sat behind a preference that
 *    looked satisfied and produced nothing. Asking is a user-gesture-only act,
 *    so the page asks from the first tap -- the same tap that unlocks audio --
 *    rather than on mount, where a prompt with no context is the one variant a
 *    browser reliably refuses.
 *
 *  - **The service worker is the delivery path.** A plain `new Notification()`
 *    is documented as "not supported" on Android Chrome, and on a Capacitor
 *    WebView it throws. `registration.showNotification` goes through the
 *    service worker the PWA plugin already registers, which is the path that
 *    works on a phone -- and it is the only one that can raise anything while
 *    the tab is in the background.
 *
 *  - **It has a tag.** Without one, every alert stacks another banner, and an
 *    interval crossing from work into rest leaves the last two phases' banners
 *    on screen saying the run finished when it did not.
 */

/** The text of one notification. The caller decides what finished. */
export interface TimerNotification {
    title: string;
    body: string;
}

/**
 * Whether the browser will show a notification at all right now.
 *
 * `Notification` is undefined in some WebViews and `requestPermission` is
 * missing in older ones, so both are feature-detected rather than assumed --
 * a missing constructor here is the difference between a timer that warns you
 * and a page that throws at the moment you most need it.
 */
export function canNotify(): boolean {
    return typeof Notification !== 'undefined'
        && typeof Notification.requestPermission === 'function';
}

/** True once the browser has said yes. */
export const notifyGranted = (): boolean =>
    typeof Notification !== 'undefined' && Notification.permission === 'granted';

/**
 * Ask for permission, from a gesture.
 *
 * Resolves to the resulting permission rather than throwing, and never prompts
 * twice: `requestPermission` on an already-decided permission is a no-op in
 * every browser that matters, and a rejected one is permanent, so there is
 * nothing to retry and nothing to tell the user that would be new.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!canNotify()) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    try {
        return await Notification.requestPermission();
    } catch {
        // Refused outside a gesture, or the page is not on https. The sound and
        // the on-screen overlay still work, so this is not worth a toast.
        return Notification.permission;
    }
}

/**
 * Raise one notification, if the browser will take it.
 *
 * A no-op rather than an error at every step: the alert also plays a sound and
 * puts an overlay on the page, and none of that should be lost because the one
 * channel the user cannot see failed.
 */
export async function showNotification({ title, body }: TimerNotification): Promise<void> {
    if (!notifyGranted()) return;

    const options: NotificationOptions = {
        body,
        // The app's own favicon rather than a new asset for the one notification
        // the app already looks like.
        icon: '/favicon.ico',
        badge: '/favicon-32x32.png',
        // One slot, not a stack: a later alert replaces an earlier one rather
        // than sitting above it, and an interval crossing a phase boundary does
        // not leave the previous phase's banner on screen.
        tag: 'anthroweb-timer',
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                await registration.showNotification(title, options);
                return;
            }
        } catch {
            // No registration yet, or the call was refused. The constructor below
            // is the fallback for exactly this case.
        }
    }

    try {
        new Notification(title, options);
    } catch {
        // The constructor can exist with the permission revoked under it, in
        // which case constructing throws. Nothing left to try.
    }
}