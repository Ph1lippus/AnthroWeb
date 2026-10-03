import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dumbbell, Layers, Plus, Trophy } from 'lucide-react';
import Title from '../Components/Title';
import Tabs, { TabPanel, type TabDefinition } from '../Components/Tabs';
import WorkoutYearHeatmap from '../Components/Workout/WorkoutYearHeatmap';
import WorkoutStatsRail from '../Components/Workout/WorkoutStatsRail';
import WeekCard from '../Components/Workout/WeekCard';
import SessionList from '../Components/Workout/SessionList';
import SessionEditor from '../Components/Workout/SessionEditor';
import RecordsPanel from '../Components/Workout/RecordsPanel';
import TemplateCard from '../Components/Workout/TemplateCard';
import TemplateEditorModal from '../Components/Workout/TemplateEditorModal';
import SessionEditorModal from '../Components/Workout/SessionEditorModal';
import LoadingSpinner from '../Components/LoadingSpinner';
import {
    useActiveTemplate,
    useWorkoutsOverview,
    useExerciseStats,
    useSetGymForDate,
    useCreateWorkoutTemplate,
    useUpdateWorkoutTemplate,
    useDeleteWorkoutTemplate,
    useDuplicateWorkoutTemplate,
    useSetActiveTemplate,
    useWorkoutTemplate,
    useSeedPRsFromTemplate,
    useCreatePlanSession,
    useUpdatePlanSession,
} from '../hooks/useWorkouts';
import { useUserSettings } from '../hooks/useUserSettings';
import { isDateString, todayString } from '../utils/dates';
import { describeTargets } from '../utils/workoutSets';

const SUBTITLE: Record<string, string> = {
    day: 'What you actually did. This changes that day only — the template stays as it is.',
};

/**
 * Two tabs, not four. Sessions and Progress were tabs of their own and neither
 * earned it: what you have done sits beside today in the Today tab, because that
 * is when you want it, and the per-exercise table belongs under the template it
 * describes. A tab per view of the same data is four places to look and one more
 * thing to remember.
 */
const TABS: TabDefinition[] = [
    { id: 'today', label: 'Today' },
    { id: 'templates', label: 'Templates' },
];

/**
 * Workouts, as one page.
 *
 * Three rails inside one height-locked card, which is the academic page's shape:
 * a narrow rail of glanceable facts, the work in a wide column beside it, and the
 * figures on the right. Each rail scrolls on its own, so nothing reflows as you
 * move down one, and below 1023px every lock is released and the page itself
 * scrolls -- nested scroll areas trap content on a touch device.
 *
 * What is in each rail, and why:
 *   left    the week at a glance, then your records. Both are facts you read
 *           rather than work you do, both fit a narrow rail as stacked rows, and
 *           both are worth having on screen while you work on anything else.
 *   middle  the work. A top bar whose buttons open dialogs, tabs over the four
 *           things you can do here, and the year pinned below all of them --
 *           it is the one thing true across every tab, and clicking any square
 *           in it opens that day.
 *   right   the figures.
 *
 * Everything is URL-driven, as it was: `?day=`, `?tab=` and `?tpl=` (the dialog
 * that is open) so a state is linkable, Back closes whatever was open, and the
 * daily log's Gym link lands on the right day.
 */
const WorkoutsPage: React.FC = () => {
    const [params, setParams] = useSearchParams();
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';
    const [notice, setNotice] = useState<string | null>(null);

    // ---- The URL, read first ----
    //
    // Everything below is derived from the query string, and several hooks need
    // values that only exist after it is parsed. Reading it up front keeps the
    // hooks together instead of interleaved with the parsing that feeds them.

    const today = todayString();
    const todayIndex = new Date().getDay();

    const dayParam = params.get('day');
    const openDay = isDateString(dayParam) ? dayParam : null;

    const tabParam = params.get('tab');
    const tab = TABS.some(t => t.id === tabParam) ? tabParam! : 'today';

    const openTemplateId = params.get('tpl');

    /* `?sess=` is the session dialog, always `<templateId>:<sessionId>` with an
       optional `:<day>` when creating one so it can pre-select the weekday. The
       session id is the literal "new" for a session that does not exist yet.
       Three states in one parameter, because a second parameter for "which
       dialog" would let the URL ask for two at once.

       The order is template first, always. It used to be written
       `new:<template>:<day>` by the caller while this read
       `<template>:<session>`, which put the string "new" where the template id
       belonged -- the lookup failed, so the dialog silently never opened. */
    const sessionParam = params.get('sess');
    const [sessionTemplateId, sessionId, sessionDay] = useMemo(() => {
        if (!sessionParam) return [null, null, null] as const;
        const [tpl, sess, day] = sessionParam.split(':');
        return [tpl || null, sess || null, day ? Number(day) : null] as const;
    }, [sessionParam]);

    /** The one place the URL changes, so the views cannot disagree about it. */
    const go = useMemo(() => (next: Record<string, string | undefined>) => {
        const merged = new URLSearchParams(params);
        for (const [key, value] of Object.entries(next)) {
            if (value === undefined) merged.delete(key);
            else merged.set(key, value);
        }
        setParams(merged, { replace: false });
        setNotice(null);
    }, [params, setParams]);

    // ---- Data ----
    const overview = useWorkoutsOverview();
    const { activeTemplate, templates } = useActiveTemplate();
    const setGym = useSetGymForDate(onPRs => {
        setNotice(`New record — ${onPRs.map(pr => pr.exercise_name).join(', ')}`);
    });

    const createTemplate = useCreateWorkoutTemplate();
    const updateTemplate = useUpdateWorkoutTemplate();
    const deleteTemplate = useDeleteWorkoutTemplate();
    const duplicateTemplate = useDuplicateWorkoutTemplate();
    const setActive = useSetActiveTemplate();
    const seedPRs = useSeedPRsFromTemplate();

    // The session dialog needs its template, its sessions and its exercises.
    // Read straight from the id in the URL rather than looked up in the
    // `templates` array: that lookup returned null whenever the array had not
    // finished loading, and the guard below treated null as "nothing to show",
    // so the Add button appeared to do nothing at all.
    const { data: sessionBundle, isLoading: sessionBundleLoading } = useWorkoutTemplate(sessionTemplateId);
    const createSession = useCreatePlanSession(sessionTemplateId ?? '');
    const updateSessionMutation = useUpdatePlanSession(sessionTemplateId ?? '');

    const stats = useExerciseStats(overview.sessions, activeTemplate?.days);
    const todayRecord = overview.days.get(today);

    const editingTemplate = useMemo(
        () => templates.find(t => t.id === openTemplateId) ?? null,
        [templates, openTemplateId],
    );

    const editingSession = useMemo(() => {
        if (!sessionBundle?.template) return null;
        const found = sessionBundle.sessions.find(s => s.id === sessionId);
        return { template: sessionBundle.template, session: found ?? null };
    }, [sessionBundle, sessionId]);

    const todayPlan = useMemo(
        () => (activeTemplate?.days ?? []).filter(row => row.day_of_week === todayIndex),
        [activeTemplate, todayIndex],
    );

    const loading = overview.isLoading && overview.sessions.length === 0;
    const completedSessions = overview.sessions.filter(s => s.completed);

    // There is deliberately no "no templates, so show one big empty card" branch
    // here. That was the page's shape when the only thing it had to say was "make
    // a template first", and it meant the most common first impression -- an
    // empty account -- was the one screen that looked nothing like every other
    // screen. A missing template is an empty state inside the layout instead.

    // ---- A single day, opened from the year grid or the session list ----
    if (openDay) {
        return (
            <>
                <Title title={`Session — ${openDay}`} />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card workout-card--pane">
                            <div className="workout-card__pane">
                                <div className="books-top-bar">
                                    <button
                                        type="button"
                                        className="btn-action"
                                        onClick={() => go({ day: undefined })}
                                    >
                                        Back to workouts
                                    </button>
                                </div>
                                <div className="dashboard-section__subtitle" style={{ textAlign: 'left' }}>
                                    {SUBTITLE.day}
                                </div>
                                <SessionEditor date={openDay} onNavigate={next => go({ day: next })} />
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const tabList: TabDefinition[] = TABS.map(t => (
        t.id === 'templates'
            ? { ...t, badge: templates.length || undefined }
            : t
    ));

    return (
        <>
            <Title title="Workouts" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
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

                        {/* No page subtitle. The academic page has none -- it goes from the card
                            straight to the top bar -- and the line of prose was
                            taking a fixed slice of the card's height to say
                            something the controls underneath already said. */}
                        {loading ? <LoadingSpinner /> : (
                            <div className="workout-rails">
                                {/* ---- Left: the week, then your records ---- */}
                                <div className="workout-rail workout-rail--plan">
                                    <WeekCard
                                        plan={activeTemplate?.days ?? []}
                                        days={overview.days}
                                        sessionsThisWeek={overview.last7.sessions}
                                        setsThisWeek={overview.last7.sets}
                                    />
                                    <RecordsPanel />
                                </div>

                                {/* ---- Middle: the work ---- */}
                                <div className="workout-rail workout-rail--work">
                                    <div className="books-top-bar">
                                        {/* Only "Add template". "Edit template" and
                                            "Log workout" used to sit here as well, and
                                            both had a better home: edit is on the card
                                            that owns it, and starting a session belongs
                                            to today rather than to the page chrome.
                                            This now matches the academic page, whose top
                                            bar carries only "Add semester". */}
                                        <div className="flex gap-2 flex-wrap">
                                            <button
                                                type="button"
                                                className="btn-action"
                                                onClick={() => go({ tpl: 'new' })}
                                            >
                                                <Plus size={13} /> Add template
                                            </button>
                                        </div>
                                    </div>

                                    <Tabs
                                        tabs={tabList}
                                        active={tab}
                                        onChange={id => go({ tab: id === 'today' ? undefined : id })}
                                        label="Workouts"
                                    />

                                    {/* The panels scroll; the year sits at the end of
                                        them rather than pinned below. Pinning it
                                        cost a fixed band of height on every screen
                                        to save a scroll, which is the wrong trade
                                        when the thing is a summary and not a
                                        control. */}
                                    <div className="workout-panels">
                                        <TabPanel id="today" hidden={tab !== 'today'}>
                                            <div className="card">
                                                <div className="card-header">
                                                    <h3 className="card-title">Today</h3>
                                                    <span className="semester-meta" style={{ marginLeft: 'auto' }}>
                                                        {new Date().toLocaleDateString(undefined, {
                                                            weekday: 'long',
                                                            day: 'numeric',
                                                            month: 'long',
                                                        })}
                                                    </span>
                                                </div>
                                                <div className="card-body">
                                                    {!activeTemplate ? (
                                                        /* No template is not an error state, it is the
                                                           starting position. Both doors are offered because
                                                           either alone is a dead end. */
                                                        <div className="plan-preview">
                                                            <p className="workout-empty__title" style={{ margin: 0 }}>
                                                                No active template
                                                            </p>
                                                            <p className="workout-empty__text" style={{ marginTop: '0.3rem' }}>
                                                                A template gives every day of the week its own
                                                                exercises, so starting a session fills it in and you
                                                                only change the weights. You can also skip it and just
                                                                log what you did.
                                                            </p>
                                                            <div className="plan-preview__actions">
                                                                <button
                                                                    className="btn-action btn-action--primary"
                                                                    onClick={() => go({ tpl: 'new' })}
                                                                >
                                                                    <Plus size={11} className="mr-1" />Create a template
                                                                </button>
                                                                <button
                                                                    className="btn-action"
                                                                    onClick={() => go({ day: today })}
                                                                >
                                                                    <Dumbbell size={11} className="mr-1" />Log a session
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : todayPlan.length === 0 ? (
                                                        <p className="form-label">
                                                            Rest day. You can still log a session.
                                                        </p>
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
                                                            <div className="plan-preview__actions">
                                                                <button
                                                                    className="btn-action btn-action--primary"
                                                                    onClick={() => go({ day: today })}
                                                                >
                                                                    <Dumbbell size={11} className="mr-1" />
                                                                    {todayRecord?.completed ? 'Review session' : 'Start session'}
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* What you have actually done sits here rather than behind a tab
                                                of its own: "what did I do, and what am I about to do" is one
                                                question, and this is where you ask it. */}
                                            <div className="card">
                                                <div className="card-header">
                                                    <h3 className="card-title">Logged</h3>
                                                    <span className="semester-meta" style={{ marginLeft: 'auto' }}>
                                                        last year
                                                    </span>
                                                </div>
                                                <div className="card-body">
                                                    <SessionList
                                                        sessions={completedSessions}
                                                        weightUnit={weightUnit}
                                                        onOpen={date => go({ day: date })}
                                                    />
                                                </div>
                                            </div>
                                        </TabPanel>

                                        <TabPanel id="templates" hidden={tab !== 'templates'}>
                                            {templates.length === 0 ? (
                                                <div className="card">
                                                    <div className="card-body">
                                                        <div className="academic-empty">
                                                            <Layers size={32} className="academic-empty__icon" />
                                                            <span className="academic-empty__title">No templates yet</span>
                                                            <span className="academic-empty__text">
                                                                A template is a week: each day holds its own
                                                                exercises. Starting a session copies the plan in so
                                                                you only change what you actually did.
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="btn-action"
                                                                style={{ marginTop: '0.5rem' }}
                                                                onClick={() => go({ tpl: 'new' })}
                                                            >
                                                                <Plus size={13} /> Add your first template
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                templates.map(template => (
                                                    <TemplateCard
                                                        key={template.id}
                                                        templateId={template.id!}
                                                        /* Only the routine you actually use opens.
                                                            Sessions inside it all start closed, so
                                                            the Templates tab opens to one routine
                                                            at a time rather than every card at once. */
                                                        defaultOpen={template.is_active}
                                                        todayIndex={todayIndex}
                                                        onEdit={() => go({ tpl: template.id! })}
                                                        onEditSession={sid => go({
                                                            sess: `${template.id}:${sid}`,
                                                            tpl: undefined,
                                                        })}
                                                        onAddSession={day => go({
                                                            sess: `${template.id}:new:${day}`,
                                                            tpl: undefined,
                                                        })}
                                                    />
                                                ))
                                            )}
                                        </TabPanel>

                                        {/* The year closes the column: always
                                            last, so the tabs' own content is what
                                            you land on. */}
                                        <div className="card workout-year">
                                            <div className="card-header">
                                                <h3 className="card-title">The last year</h3>
                                                <span className="semester-meta" style={{ marginLeft: 'auto' }}>
                                                    click a square to open that day
                                                </span>
                                            </div>
                                            <div className="card-body">
                                                <WorkoutYearHeatmap
                                                    weeks={overview.weeks}
                                                    isSaving={setGym.isPending}
                                                    isLoading={overview.isLoading}
                                                    weightUnit={weightUnit}
                                                    onSetIntensity={(date, intensity) =>
                                                        setGym.mutate({ date, trained: true, intensity })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ---- Right: the figures ---- */}
                                <div className="workout-rail workout-rail--stats">
                                    <WorkoutStatsRail
                                        days={overview.days}
                                        last7={overview.last7}
                                        last30={overview.last30}
                                        year={overview.year}
                                        streak={overview.streak}
                                        rollups={stats}
                                        weightUnit={weightUnit}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* `tpl=new` opens the dialog in create mode; anything else is a
                        template id. An unknown id opens create rather than an empty
                        form, because the URL is editable. */}
                    {openTemplateId !== null && (
                        <TemplateEditorModal
                            key={openTemplateId || 'new'}
                            template={editingTemplate}
                            exerciseCount={editingTemplate?.days.length ?? 0}
                            busy={createTemplate.isPending || updateTemplate.isPending}
                            onClose={() => go({ tpl: undefined })}
                            onSubmit={async input => {
                                if (editingTemplate) {
                                    await updateTemplate.mutateAsync({ id: editingTemplate.id!, updates: input });
                                    go({ tpl: undefined });
                                    return;
                                }

                                const created = await createTemplate.mutateAsync(input);
                                // The first template you make is the one you meant,
                                // so it becomes the active one rather than leaving
                                // every day with no plan and an "activate this"
                                // button to find.
                                if (created.id && !activeTemplate) {
                                    setActive.mutate(created.id);
                                }
                                // Straight to it. An empty template is a form with
                                // nothing in it, and sending someone back to the
                                // Today tab to realise that is a wasted step.
                                go({ tpl: undefined, tab: 'templates' });
                            }}
                            onDelete={editingTemplate ? async () => {
                                await deleteTemplate.mutateAsync(editingTemplate.id!);
                                go({ tpl: undefined });
                            } : undefined}
                            onDuplicate={editingTemplate ? async () => {
                                const copy = await duplicateTemplate.mutateAsync(editingTemplate.id!);
                                go({ tpl: copy?.id ?? undefined });
                            } : undefined}
                            onSetActive={editingTemplate && !editingTemplate.is_active ? () => {
                                setActive.mutate(editingTemplate.id!);
                                setNotice(`${editingTemplate.name} is now your active template.`);
                                go({ tpl: undefined });
                            } : undefined}
                            onTrackAsPRs={editingTemplate ? () => {
                                seedPRs.mutate(editingTemplate.id!);
                                setNotice('Added this template’s exercises to your records.');
                                go({ tpl: undefined });
                            } : undefined}
                        />
                    )}

                    {/* The session dialog. `sess=new:<template>:<day>` creates and
                        leaves the card open so the exercises can be added straight
                        away; anything else edits that session. */}
                    {/* Anything in `sess` opens the dialog. If the template cannot be resolved the
                        dialog says so rather than vanishing, because a button that
                        silently does nothing is worse than a wrong one. */}
                    {sessionParam !== null && (
                        !sessionBundleLoading && !editingSession ? (
                            <div className="import-modal-overlay" onClick={() => go({ sess: undefined })}>
                                <div className="import-modal-card" onClick={event => event.stopPropagation()}>
                                    <h3>That template is gone</h3>
                                    <div className="flex gap-2 justify-end mt-5">
                                        <button
                                            type="button"
                                            className="btn-form-submit"
                                            onClick={() => go({ sess: undefined })}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : editingSession ? (
                        <SessionEditorModal
                            key={sessionParam}
                            session={editingSession.session}
                            defaultDay={sessionDay ?? todayIndex}
                            busy={createSession.isPending || updateSessionMutation.isPending}
                            onClose={() => go({ sess: undefined })}
                            onSubmit={async input => {
                                if (editingSession.session?.id) {
                                    await updateSessionMutation.mutateAsync({
                                        id: editingSession.session.id,
                                        updates: input,
                                    });
                                } else {
                                    await createSession.mutateAsync(input);
                                }
                                go({ sess: undefined });
                            }}
                        />
                        ) : null
                    )}
                </div>
            </div>
        </>
    );
};

export default WorkoutsPage;
