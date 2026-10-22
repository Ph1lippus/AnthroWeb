import { useEffect, useRef } from 'react';
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
 *
 * The memo is also persisted, so a tab that is closed and reopened does not
 * re-ring an alarm that already rang today. Without that, every open of the
 * page would re-trigger every overdue alarm, which is exactly the "the clock
 * chimes every time I open the site" failure.
 */
const CHECK_MS = 15_000;

const FIRED_STORAGE_KEY = 'anthroweb:timer:alarms-fired:v1';

function loadFired(): Map<string, string> {
    if (typeof localStorage === 'undefined') return new Map();
    try {
        const raw = localStorage.getItem(FIRED_STORAGE_KEY);
        if (!raw) return new Map();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return new Map();
        const map = new Map<string, string>();
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') map.set(key, value);
        }
        return map;
    } catch {
        return new Map();
    }
}

function saveFired(map: Map<string, string>): void {
    if (typeof localStorage === 'undefined') return;
    try {
        const obj: Record<string, string> = {};
        for (const [key, value] of map) obj[key] = value;
        localStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(obj));
    } catch {
        // Private mode, or the quota is full. The alarm still rings this session;
        // it may re-ring on the next open, which is the safe failure.
    }
}

/** A stable key for an alarm's current schedule, so a time change re-arms it. */
function alarmKey(alarm: TimerAlarm): string {
    const days = (alarm.days_of_week ?? []).join(',');
    return `${alarm.id}:${alarm.hour}:${alarm.minute}:${days}`;
}

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
     *
     * Persisted, so a closed-and-reopened tab does not re-ring an alarm that
     * already rang today.
     */
    const firedRef = useRef<Map<string, string>>(loadFired());

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

                const key = alarmKey(alarm);

                // Already rang today (under this schedule). Checked before the
                // fire test, so a disabled-then-re-enabled alarm in the same day
                // does not immediately re-ring from a stale memo.
                if (fired.get(key) === today) continue;

                // An alarm whose weekday filter does not include today is not due
                // today at all, however far past its clock time we are.
                const days = alarm.days_of_week ?? [];
                const occurrence = new Date(
                    now.getFullYear(), now.getMonth(), now.getDate(),
                    alarm.hour, alarm.minute, 0, 0,
                );
                if (days.length > 0 && !days.includes(occurrence.getDay())) continue;

                // Not due yet today.
                if (occurrence.getTime() > now.getTime()) continue;

                fired.set(key, today);
                saveFired(fired);
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
     * A deleted or re-scheduled alarm must not keep its memo.
     *
     * Without this the map grows for the life of the session and -- worse -- an
     * alarm deleted and recreated within the same day would inherit the old
     * one's "already fired" and stay silent for the rest of it. A changed
     * schedule (different time or days) gets a new key, so the old entry is
     * simply orphaned and is swept here.
     */
    useEffect(() => {
        const live = new Set(alarms.map(alarmKey));
        for (const key of Array.from(firedRef.current.keys())) {
            if (!live.has(key)) firedRef.current.delete(key);
        }
        saveFired(firedRef.current);
    }, [alarms]);
}