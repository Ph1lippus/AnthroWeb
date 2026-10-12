import React, { useEffect, useRef } from 'react';
import { AlarmClock, Check, Play, Plus } from 'lucide-react';
import type { TimerAlert } from '../../hooks/useTimerEngine';

interface TimeUpOverlayProps {
    alert: TimerAlert;
    onDismiss: () => void;
    onRestart: () => void;
    /** Offered only when something extendable actually finished. */
    onAddMinutes: (minutes: number) => void;
}

/**
 * The "time's up" screen.
 *
 * Deliberately a modal that has to be dismissed rather than a toast. A toast
 * fades on a timer, which means a message somebody walked away from is a
 * message they never read -- and this is the one moment in the app's life where
 * being missed is the actual failure. That is the opposite trade to everywhere
 * else in the app, and it is the reason for the exception.
 *
 * The buttons differ by what finished, because the useful next action differs.
 * A countdown offers "+5 min" because five more minutes is almost always what
 * was wanted. An alarm offers nothing but dismissal -- a bed time that silently
 * became six minutes longer would be worse than useless.
 */
const TimeUpOverlay: React.FC<TimeUpOverlayProps> = ({ alert, onDismiss, onRestart, onAddMinutes }) => {
    const confirmRef = useRef<HTMLButtonElement>(null);

    // Escape to dismiss, and focus moved into the dialog on open.
    //
    // Both are needed rather than either. Focus without Escape traps a keyboard
    // user in a dialog they cannot leave, and Escape without focus means the
    // user has to hunt for the button before they can dismiss it at all.
    useEffect(() => {
        if (!alert) return;
        confirmRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onDismiss();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [alert, onDismiss]);

    if (!alert) return null;

    const isAlarm = alert.kind === 'alarm';
    // An alarm has no duration to extend, so the button is withheld rather than
    // shown disabled.
    const canExtend = !isAlarm;

    return (
        <div
            className="timer-up-overlay"
            // Clicking the backdrop dismisses, matching every other overlay in
            // the app (see the modals in DailyLogPage).
            onClick={onDismiss}
            role="presentation"
        >
            <div
                className="timer-up"
                onClick={event => event.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-label={isAlarm ? 'Alarm' : 'Time’s up'}
            >
                <div className="timer-up__icon" aria-hidden="true">
                    {isAlarm ? <AlarmClock /> : <Check />}
                </div>

                <span className="timer-up__title">
                    {isAlarm ? 'Alarm' : 'Time’s up'}
                </span>

                <span className="timer-up__label">
                    {isAlarm
                        ? alert.alarmLabel || 'Your alarm is going off.'
                        : alert.label || 'Your timer has finished.'}
                </span>

                <div className="timer-up__actions">
                    {canExtend && (
                        <button
                            type="button"
                            className="btn-action"
                            onClick={() => onAddMinutes(5)}
                        >
                            <Plus size={13} /> 5 more minutes
                        </button>
                    )}
                    {!isAlarm && (
                        <button
                            type="button"
                            className="btn-action"
                            onClick={onRestart}
                        >
                            <Play size={13} /> Restart
                        </button>
                    )}
                    <button
                        ref={confirmRef}
                        type="button"
                        className="btn-form-submit"
                        onClick={onDismiss}
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TimeUpOverlay;