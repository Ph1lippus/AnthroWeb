import React, { useState } from 'react';
import { AlarmClock, Plus, SquarePen, Trash2, X } from 'lucide-react';
import {
    CHIMES,
    DAY_LABELS,
    describeAlarmDays,
    formatAlarmTime,
    formatUntil,
    nextAlarmFire,
    type ChimeId,
} from '../../utils/timerMath';
import type { AlarmDraft, TimerAlarm } from '../../services/timerService';

// Re-exported so the page can import the draft type from wherever it is already
// importing the panel, rather than reaching into the service for a shape it never
// constructs itself.
export type { AlarmDraft };

interface AlarmsPanelProps {
    alarms: TimerAlarm[];
    onCreate: (alarm: AlarmDraft) => void;
    onUpdate: (id: string, alarm: AlarmDraft) => void;
    onDelete: (id: string) => void;
    onToggle: (id: string, enabled: boolean) => void;
    busy: boolean;
    /** Now, so the countdown on each row reuses the page's tick. */
    now: number;
}

const toInput = (hour: number, minute: number) =>
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/**
 * `HH:MM` to a pair, clamped rather than rejected.
 *
 * Typing "7:99" means 07:59. Refusing the keystroke instead would leave the field
 * stuck on the last good character with no message, which is the more confusing
 * of the two behaviours -- the user cannot tell a rejected digit from a dropped
 * one.
 */
function parseTime(raw: string): { hour: number; minute: number } {
    const clean = raw.replace(/\D/g, '').slice(0, 4);
    const hour = Math.min(23, parseInt(clean.slice(0, 2) || '0', 10) || 0);
    const minute = Math.min(59, parseInt(clean.slice(2, 4) || '0', 10) || 0);
    return { hour, minute };
}

/** Weekday order starting on Monday, because that is how a week reads. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const toggleDay = (list: number[], day: number) =>
    list.includes(day) ? list.filter(d => d !== day) : [...list, day];

/**
 * The shared add/edit form.
 *
 * Extracted because it is genuinely the same form twice, and the earlier version
 * passed nine positional arguments to a local function -- at which point a
 * component is the clearer thing and the parameters stop having to be counted in
 * the right order at the call site.
 */
const AlarmForm: React.FC<{
    idPrefix: string;
    label: string;
    setLabel: (v: string) => void;
    time: string;
    setTime: (v: string) => void;
    days: number[];
    setDays: (v: number[]) => void;
    sound: ChimeId;
    setSound: (v: ChimeId) => void;
    busy: boolean;
    onSubmit: () => void;
    onCancel: () => void;
}> = ({ idPrefix, label, setLabel, time, setTime, days, setDays, sound, setSound, busy, onSubmit, onCancel }) => (
    <>
        <div className="timer-field-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
            <div className="timer-field">
                <label className="form-label" htmlFor={`${idPrefix}-label`}>Label</label>
                <input
                    id={`${idPrefix}-label`}
                    className="form-control"
                    value={label}
                    maxLength={40}
                    onChange={event => setLabel(event.target.value)}
                />
            </div>
            <div className="timer-field">
                <label className="form-label" htmlFor={`${idPrefix}-time`}>Time</label>
                <input
                    id={`${idPrefix}-time`}
                    className="form-control"
                    value={time}
                    inputMode="numeric"
                    placeholder="07:30"
                    onChange={event => setTime(event.target.value.replace(/[^\d:]/g, '').slice(0, 5))}
                />
            </div>
        </div>

        <div className="timer-field" style={{ marginTop: '0.6rem' }}>
            <span className="form-label" id={`${idPrefix}-repeat-label`}>Repeat</span>
            <div className="timer-days" role="group" aria-labelledby={`${idPrefix}-repeat-label`}>
                {WEEKDAY_ORDER.map(day => (
                    <button
                        key={day}
                        type="button"
                        className={`timer-day${days.includes(day) ? ' timer-day--on' : ''}`}
                        onClick={() => setDays(toggleDay(days, day))}
                        aria-pressed={days.includes(day)}
                        aria-label={DAY_LABELS[day]}
                    >
                        {DAY_LABELS[day].slice(0, 2)}
                    </button>
                ))}
            </div>
            {/* Spelled out, because "no days selected" is not something a row of
                unlit buttons can explain by itself. This is also the line that
                tells somebody an empty selection means one-shot. */}
            <span className="timer-empty-hint" style={{ textAlign: 'left', padding: '0.3rem 0 0' }}>
                {describeAlarmDays(days)}
            </span>
        </div>

        <div className="timer-field" style={{ marginTop: '0.5rem' }}>
            <span className="form-label">Sound</span>
            <div className="timer-sounds">
                {CHIMES.map(chime => (
                    <button
                        key={chime.id}
                        type="button"
                        className={`timer-sound${sound === chime.id ? ' timer-sound--on' : ''}`}
                        onClick={() => setSound(chime.id)}
                        aria-pressed={sound === chime.id}
                    >
                        {chime.label}
                    </button>
                ))}
            </div>
        </div>

        <div className="timer-controls" style={{ justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button type="button" className="btn-form-cancel" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn-form-submit" onClick={onSubmit} disabled={busy}>Save</button>
        </div>
    </>
);

/**
 * Alarms: a time, the days it repeats on, and whether it is on.
 *
 * Each row shows how long until it next goes off, recomputed from a `now` the
 * page already ticks. That number is the reason to sort by next occurrence rather
 * than by creation: the row somebody cares about is always nearest the top, and
 * "in 7h 20m" answers "do I need to worry" without opening anything. Alarms that
 * are off sort below the enabled ones, so the list leads with what will actually
 * ring.
 */
const AlarmsPanel: React.FC<AlarmsPanelProps> = ({
    alarms, onCreate, onUpdate, onDelete, onToggle, busy, now,
}) => {
    const [adding, setAdding] = useState(false);
    const [label, setLabel] = useState('Alarm');
    const [time, setTime] = useState('07:30');
    const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [sound, setSound] = useState<ChimeId>('chime');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editTime, setEditTime] = useState('07:30');
    const [editDays, setEditDays] = useState<number[]>([]);
    const [editSound, setEditSound] = useState<ChimeId>('chime');

    const submitAdd = () => {
        const { hour, minute } = parseTime(time);
        onCreate({ label: label.trim() || 'Alarm', hour, minute, days, enabled: true, sound });
        setAdding(false);
        setTime('07:30');
        setDays([1, 2, 3, 4, 5]);
        setSound('chime');
    };

    const submitEdit = (id: string) => {
        const { hour, minute } = parseTime(editTime);
        // `enabled` is preserved rather than reset. The switch on the row is what
        // turns an alarm off; opening the editor and saving is not an instruction
        // to switch it back on.
        const existing = alarms.find(alarm => alarm.id === id);
        onUpdate(id, {
            label: editLabel.trim() || 'Alarm',
            hour,
            minute,
            days: editDays,
            enabled: existing?.enabled ?? true,
            sound: editSound,
        });
        setEditingId(null);
    };

    /** Adapt a row to the shape the scheduler works with. */
const schedulable = (alarm: TimerAlarm) => ({
        hour: alarm.hour,
        minute: alarm.minute,
        days: alarm.days_of_week,
    });

    const sorted = [...alarms].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return nextAlarmFire(schedulable(a), new Date(now)).getTime()
            - nextAlarmFire(schedulable(b), new Date(now)).getTime();
    });

    return (
        <div className="timer-block">
            <div className="timer-block__head">
                <h3 className="timer-block__title">
                    <AlarmClock size={14} aria-hidden="true" /> Alarms
                </h3>
                <div className="timer-block__actions">
                    <button
                        type="button"
                        className="book-action-btn"
                        onClick={() => setAdding(v => !v)}
                        data-tip={adding ? 'Cancel' : 'Add an alarm'}
                        aria-label={adding ? 'Cancel adding an alarm' : 'Add an alarm'}
                    >
                        {adding ? <X /> : <Plus />}
                    </button>
                </div>
            </div>

            {adding && (
                <div style={{ marginBottom: '0.85rem' }}>
                    <AlarmForm
                        idPrefix="alarm-new"
                        label={label} setLabel={setLabel}
                        time={time} setTime={setTime}
                        days={days} setDays={setDays}
                        sound={sound} setSound={setSound}
                        busy={busy}
                        onSubmit={submitAdd}
                        onCancel={() => setAdding(false)}
                    />
                </div>
            )}

            {sorted.length === 0 && !adding ? (
                <p className="timer-empty-hint">
                    No alarms. One set for the time you actually get up beats one set
                    for the time you intend to.
                </p>
            ) : (
                sorted.map(alarm => (
                    <div
                        key={alarm.id}
                        className={`course-row${alarm.enabled ? '' : ' timer-row--off'}`}
                        style={{ marginBottom: '0.4rem' }}
                    >
                        {editingId === alarm.id ? (
                            <AlarmForm
                                idPrefix={`alarm-${alarm.id}`}
                                label={editLabel} setLabel={setEditLabel}
                                time={editTime} setTime={setEditTime}
                                days={editDays} setDays={setEditDays}
                                sound={editSound} setSound={setEditSound}
                                busy={busy}
                                onSubmit={() => submitEdit(alarm.id)}
                                onCancel={() => setEditingId(null)}
                            />
                        ) : (
                            <div className="course-head">
                                <div className="course-head__text">
                                    <div className="timer-row__main">
                                        <span className="timer-row__clock">
                                            {formatAlarmTime(alarm.hour, alarm.minute)}
                                        </span>
                                        <span className="course-title">{alarm.label}</span>
                                    </div>
                                    <span className="course-sub">
                                        <span>{describeAlarmDays(alarm.days_of_week)}</span>
                                        {!alarm.enabled && <span>· Off</span>}
                                    </span>
                                </div>

                                <div className="course-scores">
                                    <span className={`timer-row__when${alarm.enabled ? '' : ' timer-row__when--off'}`}>
                                        {alarm.enabled
                                            ? formatUntil(nextAlarmFire(schedulable(alarm), new Date(now)).getTime() - now)
                                            : 'Paused'}
                                    </span>
                                    <span className="flex gap-1">
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={alarm.enabled}
                                            aria-label={`${alarm.enabled ? 'Turn off' : 'Turn on'} ${alarm.label}`}
                                            className={`timer-switch${alarm.enabled ? ' timer-switch--on' : ''}`}
                                            onClick={() => onToggle(alarm.id, !alarm.enabled)}
                                            data-tip={alarm.enabled ? 'Turn off' : 'Turn on'}
                                        />
                                        <button
                                            type="button"
                                            className="book-action-btn"
                                            onClick={() => {
                                                setEditingId(alarm.id);
                                                setEditLabel(alarm.label);
                                                setEditTime(toInput(alarm.hour, alarm.minute));
                                                setEditDays(alarm.days_of_week);
                                                setEditSound(alarm.sound);
                                            }}
                                            data-tip="Edit alarm"
                                            aria-label={`Edit ${alarm.label}`}
                                        >
                                            <SquarePen />
                                        </button>
                                        <button
                                            type="button"
                                            className="book-action-btn book-action-btn--danger"
                                            onClick={() => onDelete(alarm.id)}
                                            data-tip="Delete alarm"
                                            aria-label={`Delete ${alarm.label}`}
                                        >
                                            <Trash2 />
                                        </button>
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
};

export default AlarmsPanel;