import React, { useState } from 'react';
import type { ActiveGoals } from '../../utils/dailyScoring';

export interface CheatDayBudget {
    /** How many cheat days are allowed, or `null` for no limit. */
    allowed: number | null;
    period: 'week' | 'month';
}

interface DayGoalsEditorProps {
    open: boolean;
    /** Goals currently in force for this day, used to prefill the fields. */
    goals: ActiveGoals | null;
    /** The date being edited, shown in the heading so it is unambiguous. */
    dateLabel: string;
    /**
     * The cheat-day budget. Unlike the goals, this is a global setting, so the
     * editor prefills it from here and hands the edited value back on save.
     */
    cheatAllowed: number | null;
    cheatPeriod: 'week' | 'month';
    onClose: () => void;
    onSave: (goals: ActiveGoals, cheat: CheatDayBudget) => Promise<void>;
}

const FIELD = 'form-control';
const LABEL = 'form-label';

const toStr = (value: number | null | undefined) =>
    value === null || value === undefined ? '' : String(value);

/**
 * Per-day goal editor.
 *
 * Goals are normally changed from /Daily-Log/Setup, which writes a new version of
 * the history effective today. That is the right shape for "my targets changed"
 * but the wrong tool for "this one day was different" -- a bad day of sleep, a
 * deliberate rest day -- which is what this dialog is for. It writes the day's
 * snapshot directly, so the change is confined to the day it was made on.
 */
const DayGoalsEditor: React.FC<DayGoalsEditorProps> = ({
    open,
    goals,
    dateLabel,
    cheatAllowed,
    cheatPeriod,
    onClose,
    onSave,
}) => {
    const [calories, setCalories] = useState('');
    const [protein, setProtein] = useState('');
    const [carbs, setCarbs] = useState('');
    const [fat, setFat] = useState('');
    const [water, setWater] = useState('');
    const [wakeTime, setWakeTime] = useState('');
    const [bedtime, setBedtime] = useState('');
    // Held as a string so an empty box can mean "no limit" rather than 0.
    const [cheatAllowedInput, setCheatAllowedInput] = useState('');
    const [cheatPeriodInput, setCheatPeriodInput] = useState<'week' | 'month'>('week');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Prefill when the dialog opens, done during render rather than in an effect:
    // the repo's react-hooks rules forbid setState in an effect body, and it also
    // saves a render pass. Tracking the open flag means switching days and coming
    // back re-reads the new day's goals.
    const [wasOpen, setWasOpen] = useState(false);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setCalories(toStr(goals?.nutrition?.calories));
            setProtein(toStr(goals?.nutrition?.protein));
            setCarbs(toStr(goals?.nutrition?.carbs));
            setFat(toStr(goals?.nutrition?.fat));
            setWater(toStr(goals?.nutrition?.water));
            setWakeTime(goals?.sleep?.wake_time ?? '');
            setBedtime(goals?.sleep?.bedtime ?? '');
            setCheatAllowedInput(cheatAllowed != null ? String(cheatAllowed) : '');
            setCheatPeriodInput(cheatPeriod === 'month' ? 'month' : 'week');
            setError(null);
        }
    }

    if (!open) return null;

    const num = (value: string) => (value.trim() === '' ? null : Number(value));

    const handleSave = async () => {
        // Blank means no limit, so only a filled box has to be a real count.
        const parsedCheat = cheatAllowedInput.trim() === '' ? null : Number(cheatAllowedInput);
        if (parsedCheat !== null && (!Number.isFinite(parsedCheat) || parsedCheat < 0)) {
            setError('Cheat days must be a whole number of 0 or more, or left blank for no limit.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            await onSave({
                nutrition: {
                    calories: num(calories),
                    protein: num(protein),
                    carbs: num(carbs),
                    fat: num(fat),
                    water: num(water),
                },
                sleep: {
                    // Derived from the times the user typed rather than carried
                    // over, so editing bedtime without wake time does not leave a
                    // stale duration behind.
                    hours: hoursBetween(bedtime, wakeTime),
                    wake_time: wakeTime || null,
                    bedtime: bedtime || null,
                },
            }, {
                allowed: parsedCheat === null ? null : Math.trunc(parsedCheat),
                period: cheatPeriodInput,
            });
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save goals');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="import-modal-overlay" onClick={onClose}>
            <div
                className="import-modal-card day-goals-card"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-label={`Goals for ${dateLabel}`}
            >
                <h3 className="mb-4">Goals for {dateLabel}</h3>
                <p className="day-goals-note">
                    These apply to this day only. Your everyday targets are unchanged.
                </p>

                {error && <p className="day-goals-error">{error}</p>}

                <div className="day-goals-grid">
                    {([
                        ['Calories', calories, setCalories],
                        ['Protein (g)', protein, setProtein],
                        ['Carbs (g)', carbs, setCarbs],
                        ['Fat (g)', fat, setFat],
                        ['Water (ml)', water, setWater],
                    ] as const).map(([label, value, setter]) => (
                        <div key={label}>
                            <label className={LABEL}>{label}</label>
                            <input
                                type="number"
                                className={FIELD}
                                value={value}
                                onChange={e => setter(e.target.value)}
                                inputMode="numeric"
                            />
                        </div>
                    ))}

                    <div>
                        <label className={LABEL}>Wake time</label>
                        <input
                            type="time"
                            className={FIELD}
                            value={wakeTime}
                            onChange={e => setWakeTime(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className={LABEL}>Bedtime</label>
                        <input
                            type="time"
                            className={FIELD}
                            value={bedtime}
                            onChange={e => setBedtime(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className={LABEL}>Cheat days allowed</label>
                        <input
                            type="number"
                            className={FIELD}
                            value={cheatAllowedInput}
                            onChange={e => setCheatAllowedInput(e.target.value)}
                            inputMode="numeric"
                            placeholder="No limit"
                        />
                    </div>
                    <div>
                        <label className={LABEL}>Cheat days per</label>
                        <select
                            className={FIELD}
                            value={cheatPeriodInput}
                            onChange={e => setCheatPeriodInput(e.target.value === 'month' ? 'month' : 'week')}
                        >
                            <option value="week">Week (Mon–Sun)</option>
                            <option value="month">Month</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-2 justify-end mt-4">
                    <button type="button" className="btn-form-cancel" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn-form-submit"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save goals'}
                    </button>
                </div>
            </div>
        </div>
    );
};

/** Hours between bedtime and wake time, crossing midnight when needed. */
const hoursBetween = (bedtime: string, wakeTime: string): number | null => {
    if (!bedtime || !wakeTime) return null;
    const [bH, bM] = bedtime.split(':').map(Number);
    const [wH, wM] = wakeTime.split(':').map(Number);
    if (Number.isNaN(bH) || Number.isNaN(wH)) return null;
    const bed = bH * 60 + bM;
    const wake = wH * 60 + wM;
    // Going to bed at 23:00 and waking at 07:00 is 8 hours, not -16.
    const minutes = wake >= bed ? wake - bed : 24 * 60 - bed + wake;
    return Math.round((minutes / 60) * 100) / 100;
};

export default DayGoalsEditor;
