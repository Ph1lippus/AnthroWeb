import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import MeasurementEditor from '../Components/Measurement/MeasurementEditor';
import { useBodyMeasurements, useLatestMeasurement } from '../hooks/useMeasurements';
import { useUserSettings } from '../hooks/useUserSettings';
import { usePRs } from '../hooks/useWorkouts';
import { ageFromDob, measureDateToInput } from '../utils/measurementCalculations';
import { Ruler, ChevronLeft, ChevronRight, CalendarCheck2, CalendarClock, LineChart, ArrowRight } from 'lucide-react';

const toDateString = measureDateToInput;

const addDays = (dateStr: string, delta: number): string => {
    const base = new Date(dateStr + 'T00:00:00');
    base.setDate(base.getDate() + delta);
    return toDateString(base);
};

const MeasurementsPage: React.FC = () => {
    const navigate = useNavigate();
    const today = toDateString(new Date());
    const [date, setDate] = useState(today);

    const { data: records = [], isLoading } = useBodyMeasurements();
    const { data: lastMeasurementDate } = useLatestMeasurement();
    const { settings } = useUserSettings();
    const { data: prs = [] } = usePRs();

    const byDate = useMemo(() => {
        const map = new Map<string, (typeof records)[number]>();
        for (const r of records) map.set(r.measure_date, r);
        return map;
    }, [records]);

    const initial = byDate.get(date) ?? null;
    const recordDates = records.map(r => r.measure_date).reverse();

    const context = useMemo(() => {
        const maxPRWeight = prs.reduce((max, p) => (p.weight != null && p.weight > max ? p.weight : max), 0);
        return {
            gender: settings?.gender ?? '',
            height_cm: settings?.height_cm ?? null,
            age: ageFromDob(settings?.date_of_birth),
            relativeBestLift: maxPRWeight > 0 ? maxPRWeight : null,
        };
    }, [settings, prs]);

    const recency = useMemo(() => {
        if (!lastMeasurementDate) return { kind: 'none' as const, days: null };
        const last = new Date(lastMeasurementDate + 'T00:00:00').getTime();
        const now = new Date();
        const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return { kind: 'known' as const, days: Math.floor((todayTs - last) / 86400000) };
    }, [lastMeasurementDate]);

    return (
        <>
            <Title title="Measurements" />
            <div className="books-page-wrapper">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Measurements</h2>
                        <span>Track your body measurements and progress</span>
                    </div>

                    <div className="dashboard-section__head-action">
                        <button onClick={() => navigate('/Workouts/Dashboard')} className="btn-action">
                            <LineChart className="mr-1" />View Trends on Dashboard
                            <ArrowRight className="ml-1" />
                        </button>
                    </div>

                    {/* Recency callout */}
                    <div className="card mb-4">
                        {recency.kind === 'none' ? (
                            <div className="measurement-due measurement-due--none">
                                <Ruler className="measurement-due__icon" />
                                <div>
                                    <h4>No measurements yet</h4>
                                    <p>Log your first measurement below — a full week at 100 score, with a 10-point daily penalty on the 8th day if you skip.</p>
                                </div>
                            </div>
                        ) : recency.kind === 'known' && recency.days! <= 7 ? (
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
                    </div>

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

                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">
                                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                {initial ? ' — saved' : ''}
                            </h3>
                        </div>
                        <div className="card-body">
                            {isLoading ? (
                                <div className="profile-loading">
                                    <div className="profile-loading-spinner"></div>
                                    <p>Loading measurements...</p>
                                </div>
                            ) : (
                                <MeasurementEditor
                                    key={date}
                                    date={date}
                                    initial={initial}
                                    context={context}
                                    fallbackWeight={null}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default MeasurementsPage;