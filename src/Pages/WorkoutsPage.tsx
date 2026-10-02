import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Dumbbell, Plus, Trophy } from 'lucide-react';
import Title from '../Components/Title';
import WorkoutYearHeatmap from '../Components/Workout/WorkoutYearHeatmap';
import MarkDayPanel from '../Components/Workout/MarkDayPanel';
import WorkoutStatsCard from '../Components/Workout/WorkoutStatTiles';
import RecentWorkouts from '../Components/Workout/RecentWorkouts';
import SessionList from '../Components/Workout/SessionList';
import SessionEditor from '../Components/Workout/SessionEditor';
import RecordsPanel from '../Components/Workout/RecordsPanel';
import TemplatePanel from '../Components/Workout/TemplatePanel';
import TemplateExerciseStats from '../Components/Workout/TemplateExerciseStats';
import LoadingSpinner from '../Components/LoadingSpinner';
import {
    useActiveTemplate,
    useWorkoutsOverview,
    useExerciseStats,
    useSetGymForDate,
    useSetActiveTemplate,
} from '../hooks/useWorkouts';
import { useUserSettings } from '../hooks/useUserSettings';
import { isDateString, todayString } from '../utils/dates';
import { describeTargets } from '../utils/workoutSets';
import { DAY_SHORT } from '../utils/workoutStats';

const SUBTITLE: Record<string, string> = {
    day: 'What you actually did. This changes that day only — the template stays as it is.',
    records: 'The heaviest set you have logged for each exercise.',
    overview: 'Mark a day, or log what you actually did.',
};

/**
 * Workouts, as one page.
 *
 * Everything lives here rather than behind six tabs: the figures, today's plan,
 * mark-a-day, the template, the records, every session you have logged, and the
 * year grid. Only template creation lives elsewhere, because editing a week is a
 * different job from looking at one.
 *
 * The URL decides what is on screen -- `?day=` opens the session editor for that
 * date, `?view=records` expands the records grid -- so every state is linkable,
 * the browser's Back closes whatever was open, and the daily log's Gym link, the
 * heatmap and the session list all open the same day through the same route.
 *
 * The layout is the daily log's mosaic: grid placement outside, independent flex
 * columns inside each track so the cards pack instead of leaving holes.
 */
const WorkoutsPage: React.FC = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';
    const [notice, setNotice] = useState<string | null>(null);

    const overview = useWorkoutsOverview();
    const { activeTemplate, templates, isLoading: templatesLoading } = useActiveTemplate();
    const setGym = useSetGymForDate(onPRs => {
        setNotice(`New record — ${onPRs.map(pr => pr.exercise_name).join(', ')}`);
    });
    const activate = useSetActiveTemplate();

    const stats = useExerciseStats(overview.sessions, activeTemplate?.days);

    const today = todayString();
    const todayIndex = new Date().getDay();
    const todayRecord = overview.days.get(today);
    const recordsOpen = params.get('view') === 'records';
    const dayParam = params.get('day');
    const openDay = isDateString(dayParam) ? dayParam : null;

    const todayPlan = useMemo(
        () => (activeTemplate?.days ?? []).filter(row => row.day_of_week === todayIndex),
        [activeTemplate, todayIndex],
    );

    /** The one place the URL changes, so the views cannot disagree about it. */
    const go = (next: Record<string, string | undefined>) => {
        const merged = new URLSearchParams(params);
        for (const [key, value] of Object.entries(next)) {
            if (value === undefined) merged.delete(key);
            else merged.set(key, value);
        }
        setParams(merged, { replace: false });
        setNotice(null);
    };

    const loading = overview.isLoading && overview.sessions.length === 0;
    const isEmpty = !loading && !templatesLoading && templates.length === 0;

    // ---- Sub-views ----
    if (openDay) {
        return (
            <>
                <Title title={`Session — ${openDay}`} />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card workout-card--scroll">
                            <div className="dashboard-section__subtitle" style={{ textAlign: 'left' }}>
                                {SUBTITLE.day}
                            </div>
                            <SessionEditor date={openDay} onNavigate={next => go({ day: next })} />
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (recordsOpen) {
        return (
            <>
                <Title title="Personal Records" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card workout-card--scroll">
                            {notice && (
                                <div className="workout-notice" role="status">
                                    <Trophy size={13} />
                                    <span>{notice}</span>
                                    <button
                                        className="workout-notice__close"
                                        onClick={() => setNotice(null)}
                                    >
                                        ×
                                    </button>
                                </div>
                            )}
                            <div className="dashboard-section__subtitle" style={{ textAlign: 'left' }}>
                                {SUBTITLE.records}
                            </div>
                            <RecordsPanel
                                expanded
                                onExpand={() => undefined}
                                onCollapse={() => go({ view: undefined })}
                            />
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // ---- First run ----
    if (isEmpty) {
        return (
            <>
                <Title title="Workouts" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card">
                            <div className="workout-empty" style={{ marginTop: '1rem' }}>
                                <Dumbbell size={20} style={{ opacity: 0.4 }} />
                                <p className="workout-empty__title" style={{ marginTop: '0.5rem' }}>
                                    Build your first routine
                                </p>
                                <p className="workout-empty__text">
                                    A template gives every day of the week its own exercises and fills
                                    today's session for you. You can also mark a day without a plan at all.
                                </p>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.9rem' }}>
                                    <button
                                        className="btn-action btn-action--primary"
                                        onClick={() => navigate('/Workouts/Templates')}
                                    >
                                        <Plus size={11} className="mr-1" />Create a template
                                    </button>
                                    <button className="btn-action" onClick={() => go({ day: today })}>
                                        Log a session
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Title title="Workouts" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card workout-card--scroll">
                        {notice && (
                            <div className="workout-notice" role="status">
                                <Trophy size={13} />
                                <span>{notice}</span>
                                <button className="workout-notice__close" onClick={() => setNotice(null)}>
                                    ×
                                </button>
                            </div>
                        )}

                        <div className="dashboard-section__subtitle" style={{ textAlign: 'left' }}>
                            {SUBTITLE.overview}
                        </div>

                        {loading ? <LoadingSpinner /> : (
                            <div className="workout-mosaic">

                                <RecentWorkouts sessions={overview.recent} weightUnit={weightUnit} />

                                {/* ---- Left: the numbers ---- */}
                                <div className="workout-mosaic__col workout-mosaic__stats">
                                    <WorkoutStatsCard
                                        last7={overview.last7}
                                        last30={overview.last30}
                                        streak={overview.streak}
                                        weightUnit={weightUnit}
                                    />

                                    <div className="workout-mosaic__tpl">
                                        <div className="card">
                                            <div className="card-header">
                                                <h3 className="card-title">This week</h3>
                                            </div>
                                            <div className="card-body">
                                                <div className="workout-week">
                                                    {DAY_SHORT.map((label, index) => {
                                                        const weekday = (index + 1) % 7;
                                                        const trained = overview.days.get(
                                                            mondayOf(weekday),
                                                        )?.completed === true;
                                                        return (
                                                            <span
                                                                key={label}
                                                                className={[
                                                                    'workout-week__day',
                                                                    trained ? 'workout-week__day--on' : '',
                                                                    weekday === todayIndex ? 'workout-week__day--today' : '',
                                                                ].filter(Boolean).join(' ')}
                                                                title={`${label} — ${trained ? 'trained' : 'rest'}`}
                                                            >
                                                                <span className="workout-week__label">{label.slice(0, 2)}</span>
                                                                <span className={`workout-week__count ${trained ? '' : 'workout-week__count--rest'}`}>
                                                                    {trained ? '✓' : '·'}
                                                                </span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                <div className="workout-meter-row" style={{ marginTop: '0.6rem' }}>
                                                    <span>Sessions · sets</span>
                                                    <strong style={{ marginLeft: 'auto' }}>
                                                        {overview.last7.sessions} · {overview.last7.sets}
                                                    </strong>
                                                </div>
                                                <div className="workout-meter">
                                                    <div
                                                        className="workout-meter__fill"
                                                        style={{ width: `${Math.min(100, overview.last7.sessions / 5 * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ---- Middle: the plan, then every session ---- */}
                                <div className="workout-mosaic__col workout-mosaic__plan">
                                    <div className="card">
                                        <div className="card-header">
                                            <h3 className="card-title">Today</h3>
                                            <button
                                                className="btn-action btn-action--primary"
                                                style={{ marginLeft: 'auto' }}
                                                onClick={() => go({ day: today })}
                                            >
                                                <Dumbbell size={11} className="mr-1" />
                                                {todayRecord?.completed ? 'Review session' : 'Log workout'}
                                            </button>
                                        </div>
                                        <div className="card-body">
                                            {!activeTemplate ? (
                                                <p className="form-label">No active template, so today has no plan.</p>
                                            ) : todayPlan.length === 0 ? (
                                                <p className="form-label">Rest day. You can still log a session.</p>
                                            ) : (
                                                <>
                                                    <div className="workout-rows">
                                                        {todayPlan.map(row => (
                                                            <div className="workout-row" key={row.id}>
                                                                <span className="workout-row__name">{row.exercise_name}</span>
                                                                <span className="workout-row__value">
                                                                    {describeTargets(row, weightUnit)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <p className="form-label" style={{ marginTop: '0.6rem' }}>
                                                        {todayRecord?.completed
                                                            ? `Logged today${todayRecord.intensity ? ` at ${todayRecord.intensity}/10` : ''}.`
                                                            : 'Not logged yet.'}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="workout-mosaic__history">
                                        <div className="card">
                                            <div className="card-header">
                                                <h3 className="card-title">Sessions</h3>
                                                <span className="semester-meta" style={{ marginLeft: 'auto' }}>
                                                    last year
                                                </span>
                                            </div>
                                            <div className="card-body">
                                                <SessionList
                                                    sessions={overview.sessions.filter(s => s.completed)}
                                                    weightUnit={weightUnit}
                                                    onOpen={date => go({ day: date })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ---- Right: mark a day, template, records ---- */}
                                <div className="workout-mosaic__col">
                                    <div className="workout-mosaic__mark">
                                        <MarkDayPanel
                                            days={overview.days}
                                            isSaving={setGym.isPending}
                                            onToggle={(date, trained, intensity) =>
                                                setGym.mutate({ date, trained, intensity })}
                                        />
                                    </div>

                                    <TemplatePanel
                                        activeTemplate={activeTemplate}
                                        templates={templates}
                                        todayIndex={todayIndex}
                                        onActivate={id => activate.mutate(id)}
                                        isActivating={activate.isPending}
                                    />

                                    <div className="workout-mosaic__records">
                                        <RecordsPanel
                                            expanded={false}
                                            onExpand={() => go({ view: 'records' })}
                                            onCollapse={() => go({ view: undefined })}
                                        />
                                    </div>
                                </div>

                                {/* ---- Template exercises: two tracks wide ---- */}
                                <div className="workout-mosaic__exstats">
                                    <div className="card">
                                        <div className="card-header">
                                            <h3 className="card-title">Template exercises</h3>
                                            {activeTemplate && (
                                                <span className="semester-meta" style={{ marginLeft: 'auto' }}>
                                                    {activeTemplate.name}
                                                </span>
                                            )}
                                        </div>
                                        <div className="card-body">
                                            <TemplateExerciseStats rows={stats} weightUnit={weightUnit} />
                                        </div>
                                    </div>
                                </div>

                                {/* ---- The year: all three tracks ---- */}
                                <div className="workout-mosaic__chart">
                                    <div className="card">
                                        <div className="card-header">
                                            <h3 className="card-title">The last year</h3>
                                            <span className="semester-meta" style={{ marginLeft: 'auto' }}>
                                                click a square to mark or unmark
                                            </span>
                                        </div>
                                        <div className="card-body">
                                            <WorkoutYearHeatmap
                                                weeks={overview.weeks}
                                                isSaving={setGym.isPending}
                                                isLoading={overview.isLoading}
                                                weightUnit={weightUnit}
                                                onToggleDay={(date, trained) =>
                                                    setGym.mutate({
                                                        date,
                                                        trained,
                                                        intensity: trained ? 5 : undefined,
                                                    })}
                                                onSetIntensity={(date, intensity) =>
                                                    setGym.mutate({ date, trained: true, intensity })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

/** The date of `weekday` inside the current week, Monday-first. */
const mondayOf = (weekday: number): string => {
    const today = new Date();
    const offset = (weekday + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
};

export default WorkoutsPage;