import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import MeasurementEditor from '../Components/Measurement/MeasurementEditor';
import MeasurementStatsCards from '../Components/Measurement/MeasurementStatsCards';
import DerivedMetrics from '../Components/Measurement/DerivedMetrics';
import { useBodyMeasurements, useLatestMeasurement } from '../hooks/useMeasurements';
import { useUserSettings } from '../hooks/useUserSettings';
import { usePRHistory } from '../hooks/useWorkouts';
import { ageFromDob, measureDateToInput, computeBodyCalculations } from '../utils/measurementCalculations';
import { addDays } from '../utils/dates';
import { Ruler, ChevronLeft, ChevronRight, CalendarCheck2, CalendarClock, LineChart, ArrowRight } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner';
import { useBootHold } from '../services/bootScreen';

const toDateString = measureDateToInput;

/** The twenty-three fields, as the string-keyed form the inputs hold. */
type MeasurementValues = Record<string, string>;

const MeasurementsPage: React.FC = () => {
    const navigate = useNavigate();
    const today = toDateString(new Date());
    const [date, setDate] = useState(today);

    const { data: records = [], isLoading } = useBodyMeasurements();
    const { data: lastMeasurementDate } = useLatestMeasurement();
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

    const recency = useMemo(() => {
        if (!lastMeasurementDate) return { kind: 'none' as const, days: null };
        const last = new Date(lastMeasurementDate + 'T00:00:00').getTime();
        const now = new Date();
        const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return { kind: 'known' as const, days: Math.floor((todayTs - last) / 86400000) };
    }, [lastMeasurementDate]);

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
            <div className="books-page-wrapper">
                <div className="dashboard-section measurements-section">
                    <div className="measurements-card">
                        <div className="measurements-body">
                            {/* Stats rail on the left, inputs on the right. Same
                                shape as the academic page so the two read as one
                                design rather than two separate apps. */}
                            <aside className="measurements-stats">
                                <div className="measurements-stats__head">
                                    <h2 className="measurements-stats__title">Body metrics</h2>
                                    <button
                                        onClick={() => navigate('/Workouts')}
                                        className="btn-action"
                                    >
                                        <LineChart className="mr-1" />Trends
                                        <ArrowRight className="ml-1" />
                                    </button>
                                </div>

                                {/* Recency callout */}
                                {recency.kind === 'none' ? (
                                    <div className="measurement-due measurement-due--none">
                                        <Ruler className="measurement-due__icon" />
                                        <div>
                                            <h4>No measurements yet</h4>
                                            <p>Log your first measurement on the right — a full week at 100 score, with a 10-point daily penalty on the 8th day if you skip.</p>
                                        </div>
                                    </div>
                                ) : recency.days! <= 7 ? (
                                    <div className="measurement-due measurement-due--ok">
                                        <CalendarCheck2 className="measurement-due__icon" />
                                        <div>
                                            <h4>Measurements current</h4>
                                            <p>Last logged {new Date(lastMeasurementDate! + 'T00:00:00').toLocaleDateString()} · score 100. Re-measure by {new Date(addDays(lastMeasurementDate!, 7) + 'T00:00:00').toLocaleDateString()} to keep it.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="measurement-due measurement-due--late">
                                        <CalendarClock className="measurement-due__icon" />
                                        <div>
                                            <h4>{recency.days} day{recency.days! === 1 ? '' : 's'} overdue</h4>
                                            <p>Last logged {new Date(lastMeasurementDate! + 'T00:00:00').toLocaleDateString()}. Measure today to reset the recency score.</p>
                                        </div>
                                    </div>
                                )}

                                {/* What the twenty-three boxes currently add up to,
                                    above the stored figures below. Live first, then
                                    history: a number you can watch move is more use
                                    than one you have to look up. */}
                                <DerivedMetrics values={derived} />

                                <MeasurementStatsCards
                                    records={records}
                                    context={context}
                                    targetWeight={settings?.target_weight ?? null}
                                    targetBodyFat={settings?.target_bodyfat ?? null}
                                    recencyDays={recency.kind === 'known' ? recency.days : null}
                                />
                            </aside>

                            <section className="measurements-inputs">
                                {/* Date + navigation */}
                                <div className="measurement-navbar">
                                    <button className="measurement-navbar__btn" onClick={() => setDate(addDays(date, -1))}>
                                        <ChevronLeft />
                                    </button>
                                    <input
                                        type="date"
                                        className="measurement-navbar__date"
                                        value={date}
                                        max={today}
                                        onChange={(e) => e.target.value && setDate(e.target.value)}
                                    />
                                    <button className="measurement-navbar__btn" onClick={() => setDate(addDays(date, 1))}>
                                        <ChevronRight />
                                    </button>
                                    {date !== today && (
                                        <button className="btn-form-cancel" onClick={() => setDate(today)}>Today</button>
                                    )}
                                </div>

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

                                <div className="measurements-inputs__head">
                                    <h3 className="measurements-inputs__title">
                                        {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                        {initial ? ' — saved' : ''}
                                    </h3>
                                </div>

                                <div className="measurements-scroll">
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
            </div>
        </>
    );
};

export default MeasurementsPage;