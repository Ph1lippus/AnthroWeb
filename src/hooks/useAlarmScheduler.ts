import { useEffect, useRef } from 'react';
import { nextAlarmFire } from '../utils/timerMath';
import type { TimerAlarm } from '../services/timerService';

/**
 * Fires alarms when their time arrives.
 *
 * Mounted on the timer page rather than in the engine, because an alarm needs
 * the user's alarm list, which is a query, and a query belongs to a page. The
 * compromise is that alarms only run while the timer page is open -- see the
 * note at the bottom about why that is the honest limit here.
 *
 * ## Why this polls instead of scheduling
 *
 * The obvious implementation is a `setTimeout` per alarm, set to the remaining
 * milliseconds. It is wrong in a way that only appears on the days it matters.
 * A timeout scheduled for 7 hours from now is held by a timer that the browser
 * is entitled to freeze when the tab is backgrounded, and it does not survive
 * the device sleeping at all. So an alarm set for a morning wake-up would fire
 * when the tab happened to be restored, which is not the same moment.
 *
 * Polling the same predicate every fifteen seconds cannot have that failure:
 * the answer is derived from `Date.now()` against a fixed wall-clock time, so
 * however long the gap was, the check is correct the instant it runs. The cost
 * is fifteen seconds of slop on the *first* check after a long gap, which is
 * why `visibilitychange` and `focus` also run the check immediately -- arriving
 * back at the tab is the moment the slop is noticed.
 *
 * ## Why the fired set is keyed by a date, not an id
 *
 * An alarm that has rung must not ring again on the next tick, but it *should*
 * ring again tomorrow. So the memo records the last day each alarm fired on and
 * only suppresses a repeat within that same day. Keying on the id alone would
 * silence it for good; keying on nothing would make it a machine-gun.
 */
const CHECK_MS = 15_000;

export interface AlarmSchedulerOptions {
    alarms: TimerAlarm[];
    /** Raised when an alarm's time passes. */
    onFire: (alarm: TimerAlarm) => void;
    enabled: boolean;
}

export function useAlarmScheduler({ alarms, onFire, enabled }: AlarmSchedulerOptions): void {
    /**
     * Day each alarm last fired on, as a local `YYYY-MM-DD`.
     *
     * A local date string rather than an epoch day because an alarm is a
     * wall-clock statement -- "07:30, every weekday" -- and which occurrences of
     * that exist is a calendar question, not a duration one. The same reasoning
     * as `dates.ts`, which exists for the same reason.
     */
    const firedRef = useRef<Map<string, string>>(new Map());

    /**
     * Held in a ref so the interval below is not rebuilt every render.
     *
     * `onFire` closes over the page's state, so as a dependency it would change
     * often, and each rebuild would clear and re-arm the interval -- which is
     * long enough to miss an alarm that came due during the swap.
     */
    const onFireRef = useRef(onFire);
    useEffect(() => {
        onFireRef.current = onFire;
    }, [onFire]);

    useEffect(() => {
        if (!enabled) return;

        const localDay = (at: Date): string =>
            `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;

        const check = () => {
            const now = new Date();
            const today = localDay(now);
            const fired = firedRef.current;

            for (const alarm of alarms) {
                if (!alarm.enabled) continue;

                // Already rang today. Checked before the fire test as well as
                // after, so a disabled-then-re-enabled alarm in the same day does
                // not immediately re-ring from a stale memo.
                if (fired.get(alarm.id) === today) continue;

                const next = nextAlarmFire(
                    { hour: alarm.hour, minute: alarm.minute, days: alarm.days_of_week },
                    now,
                );
                if (next.getTime() > now.getTime()) continue;

                fired.set(alarm.id, today);
                onFireRef.current(alarm);
            }
        };

        check();
        const id = window.setInterval(check, CHECK_MS);

        // Coming back to the tab is exactly when a missed check would be noticed,
        // so the interval is not the only trigger.
        const onVisible = () => {
            if (document.visibilityState === 'visible') check();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', check);

        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', check);
        };
    }, [alarms, enabled]);

    /**
     * A deleted alarm must not keep its memo.
     *
     * Without this the map grows for the life of the session and -- worse -- an
     * alarm deleted and recreated within the same day would inherit the old
     * one's "already fired" and stay silent for the rest of it.
     */
    useEffect(() => {
        const live = new Set(alarms.map(alarm => alarm.id));
        for (const id of Array.from(firedRef.current.keys())) {
            if (!live.has(id)) firedRef.current.delete(id);
        }
    }, [alarms]);
}