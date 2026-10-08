import React, { useCallback, useMemo, useState } from 'react';
import Title from '../Components/Title';
import MeasurementEditor from '../Components/Measurement/MeasurementEditor';
import DerivedMetrics from '../Components/Measurement/DerivedMetrics';
import { useBodyMeasurements } from '../hooks/useMeasurements';
import { useUserSettings } from '../hooks/useUserSettings';
import { usePRHistory } from '../hooks/useWorkouts';
import { ageFromDob, measureDateToInput, computeBodyCalculations } from '../utils/measurementCalculations';
import { addDays, formatDayLabel, isDateString } from '../utils/dates';
import { ChevronLeft, ChevronRight, Calendar, CalendarCheck2, Rows3 } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner';
import { useBootHold } from '../services/bootScreen';

const toDateString = measureDateToInput;

/** The twenty-three fields, as the string-keyed form the inputs hold. */
type MeasurementValues = Record<string, string>;

const MeasurementsPage: React.FC = () => {
    const today = toDateString(new Date());
    const [date, setDate] = useState(today);
    /* Same call as the daily log's: open where there is room for it, closed on a
     * phone, and a lazy initialiser rather than an effect so there is no first
     * paint with the wrong one. */
    const [breakdownOpen, setBreakdownOpen] = useState(
        () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches
    );

    const { data: records = [], isLoading } = useBodyMeasurements();
    const { settings, isLoading: settingsLoading } = useUserSettings();
    const { data: prHistory = [], isLoading: prLoading } = usePRHistory();

    /**
     * The editor's field values, held here rather than inside it.
     *
     * The calculated-metrics block used to live at the bottom of the editor and
     * recompute as you typed, which meant the only way to watch a number respond
     * to an input was to scroll past twenty-three fields. Moving that block into
     * the left rail means it has to see the values as they are being typed, and
     * a child component cannot hand that back up -- so the state moves to the page
     * and the editor becomes controlled.
     *
     * Remounting on day change is what resets it: the editor is keyed on `date`,
     * so a new day starts from the stored record without an effect that would
     * overwrite a keystroke.
     */
    const [values, setValues] = useState<MeasurementValues>({});
    const onValuesChange = useCallback((next: MeasurementValues) => setValues(next), []);

    // The strongest lift on record is the reference the derived body ratios use.
    // Read from pr_entries + pr_history rather than the old flat list, so a
    // seeded-but-unfilled entry does not count as a lift.
    const maxPRWeight = useMemo(
        () => prHistory.reduce((max, row) => (row.weight != null && row.weight > max ? row.weight : max), 0),
        [prHistory],
    );

    const byDate = useMemo(() => {
        const map = new Map<string, (typeof records)[number]>();
        for (const r of records) map.set(r.measure_date, r);
        return map;
    }, [records]);

    const initial = byDate.get(date) ?? null;
    const recordDates = records.map(r => r.measure_date).reverse();

    const context = useMemo(() => ({
        gender: settings?.gender ?? '',
        height_cm: settings?.height_cm ?? null,
        age: ageFromDob(settings?.date_of_birth),
        relativeBestLift: maxPRWeight > 0 ? maxPRWeight : null,
    }), [settings, maxPRWeight]);

    /**
     * The rail's numbers come from the live form, not from what is stored.
     *
     * `computeBodyCalculations` is a pure function of the typed values, so the rail
     * can call it on every keystroke without a request and without touching the
     * database. This is the whole reason the metrics moved out of the editor: a
     * read-only preview cannot show what the box is about to save, and a save
     * takes a button press.
     */
    const derived = useMemo(() => {
        const raw: Record<string, number | null> = {};
        for (const [key, text] of Object.entries(values)) {
            const trimmed = text?.trim();
            raw[key] = trimmed ? parseFloat(trimmed) : null;
        }
        return computeBodyCalculations(raw, {
            gender: (context.gender || '') as 'male' | 'female' | 'other' | 'prefer_not_to_say' | '',
            height_cm: context.height_cm ?? null,
            age: context.age ?? null,
            relativeBestLift: context.relativeBestLift ?? null,
        });
    }, [values, context]);

    // Every query this page renders from, since all three gate what is on screen.
    // Without the hold the splash lifts over the spinner below and the handover
    // plays out as two loading states in a row. `settings` rather than
    // `settingsLoading`: a user with no settings row legitimately has none, and
    // waiting on the row rather than the request is what lets that be an answer.
    useBootHold(isLoading || settingsLoading || prLoading);

    return (
        <>
            <Title title="Measurements" />
            <div className="daily-logs-page-wrapper">
                <div className="dashboard-section daily-logs-section">
                    <div className="daily-logs-card measurements-card">
                        <aside className="daily-log-score-col measurements-stats">
                            {/* The controls for this day, in the same row and the same
                                order as the daily log's: the breakdown toggle first,
                                because it is the one control here that does not act on
                                the day, then the arrows and the picker. The way back to
                                today is drawn only off today, which also keeps the row a
                                fixed set of controls. */}
                            <div className="daily-score-daynav">
                                <div className="daily-log-daynav">
                                    <button
                                        type="button"
                                        className={`daily-log-daynav-btn${breakdownOpen ? ' daily-log-daynav-btn--on' : ''}`}
                                        onClick={() => setBreakdownOpen(open => !open)}
                                        data-tip={breakdownOpen ? 'Hide breakdown' : 'Show breakdown'}
                                        aria-label={breakdownOpen ? 'Hide breakdown' : 'Show breakdown'}
                                        aria-pressed={breakdownOpen}
                                    >
                                        <Rows3 size={14} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="daily-log-daynav-btn"
                                        onClick={() => setDate(addDays(date, -1))}
                                        data-tip="Previous day"
                                        aria-label="Previous day"
                                    >
                                        <ChevronLeft size={15} />
                                    </button>
                                    <span className="daily-log-daynav-label" aria-live="polite">
                                        {formatDayLabel(date)}
                                    </span>
                                    <label className="daily-log-daynav-btn" data-tip="Pick a day">
                                        <Calendar size={14} aria-hidden="true" />
                                        <span className="sr-only">Pick a day</span>
                                        <input
                                            type="date"
                                            className="daily-log-daynav-input"
                                            value={date}
                                            max={today}
                                            onChange={e => {
                                                if (isDateString(e.target.value)) setDate(e.target.value);
                                            }}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="daily-log-daynav-btn"
                                        onClick={() => setDate(addDays(date, 1))}
                                        data-tip="Next day"
                                        aria-label="Next day"
                                        disabled={date >= today}
                                    >
                                        <ChevronRight size={15} />
                                    </button>
                                    {date !== today && (
                                        <button
                                            type="button"
                                            className="daily-log-daynav-btn"
                                            onClick={() => setDate(today)}
                                            data-tip="Go to today"
                                            aria-label="Go to today"
                                        >
                                            <CalendarCheck2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

{/* What the twenty-three boxes currently add up to,
                                     live as they are typed rather than read back off a
                                     saved snapshot: a number you can watch move is more
                                     use than one you have to look up. */}
                                <DerivedMetrics values={derived} expanded={breakdownOpen} />

                        </aside>

                        <section className="daily-log-form measurements-inputs">
                                {recordDates.length > 0 && (
                                    <div className="measurement-history">
                                        {recordDates.map(d => (
                                            <button
                                                key={d}
                                                className={`measurement-history__chip ${d === date ? 'measurement-history__chip--active' : ''}`}
                                                onClick={() => setDate(d)}
                                            >
                                                {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="measurements-scroll daily-log-main">
                                    {isLoading ? (
                                        <LoadingSpinner />
                                    ) : (
                                        <MeasurementEditor
                                            key={date}
                                            date={date}
                                            initial={initial}
                                            context={context}
                                            fallbackWeight={null}
                                            values={values}
                                            onValuesChange={onValuesChange}
                                        />
                                    )}
                                </div>
                            </section>
                    </div>
                </div>
            </div>
        </>
    );
};

export default MeasurementsPage;