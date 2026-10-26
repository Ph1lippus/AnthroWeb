import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { AlertTriangle, Calendar, CalendarCheck2, ChevronLeft, ChevronRight, History, MoreVertical, Pencil, PenLine, Plus, Rows3 } from 'lucide-react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { createDailyLog, updateDailyLog, setDailyLogHabit, getDailyLogByDate, getDailyLogById, saveDailyLogProjects, getDailyLogProjects } from '../services/dailyLogService';
import type { DailyLog, DailyLogHabitColumn } from '../services/dailyLogService';
import { updateUserSettings } from '../services/profileService';
import { useUserSettings } from '../hooks/useUserSettings';
import { getUserHabits, toggleHabitForDate, createHabit, deleteHabit, getCompletedHabitsForDate } from '../services/habitService';
import { useUpdateHabit } from '../hooks/useHabitData';
import { getUserProjects } from '../services/projectService';
import type { UserSettings } from '../services/profileService';
import type { Habit } from '../services/habitService';
import type { Project } from '../services/projectService';
import { computeDailyScore, calculateSleepDuration, BUILTIN_HABIT_COUNT } from '../utils/dailyScoring';
import { cheatDayStatus } from '../utils/cheatDays';
import { recalcCheatDayScores } from '../services/cheatDayRecalc';
import { useDailyLogs } from '../hooks/useDailyLogs';
import { moodFor, meanMood } from '../utils/moodSeries';
import { MoodReadout } from '../Components/Journal/Mood';
import type { ActiveGoals } from '../utils/dailyScoring';
import { parseGoalHistory, resolveGoalsForDay, withVersion, latestGoals } from '../utils/goalHistory';
import { useLatestMeasurement } from '../hooks/useMeasurements';
import { useSetGymForDate } from '../hooks/useWorkouts';
import { queryKeys } from '../utils/queryKeys';
import ScoreCard from '../Components/DailyLog/ScoreCard';
import DayGoalsEditor from '../Components/DailyLog/DayGoalsEditor';
import type { CheatDayBudget } from '../Components/DailyLog/DayGoalsEditor';
import HabitEditorModal from '../Components/DailyLog/HabitEditorModal';
import type { HabitEditorUpdates, HabitEditorValue } from '../Components/DailyLog/HabitEditorModal';
import ConfirmModal from '../Components/ConfirmModal';
import ContextMenu from '../Components/ContextMenu';
import type { ContextMenuItem } from '../Components/ContextMenu';
import { useContextMenu } from '../Components/useContextMenu';
import { hasJournalContent } from '../utils/journalHabit';
import { addDays, formatDayLabel, isDateString, todayString } from '../utils/dates';
import LoadingSpinner from '../Components/LoadingSpinner';
import { useBootHold } from '../services/bootScreen';

const getScoreColor = (score: number): string => {
    if (score >= 80) return '#00ffa6';
    if (score >= 60) return '#a8e600';
    if (score >= 30) return '#ffa500';
    return 'var(--color-danger)';
};

/**
 * The built-in habits this page draws, and the label they ship with.
 *
 * Morning and evening routine remain in the scorer for historical rows, but they
 * have no checkbox on this page, so they are not editable here. The key is the
 * one `user_settings.habit_settings` stores overrides under; the label is only a
 * fallback for when no override exists.
 */
type EditableBuiltinHabitKey =
    | 'fruitServing'
    | 'studied'
    | 'journal'
    | 'stretching'
    | 'reading'
    | 'projectWorkDone'
    | 'gym';

const BUILTIN_HABIT_LABELS: Record<EditableBuiltinHabitKey, string> = {
    fruitServing: 'Fruit Serving',
    studied: 'Studied',
    journal: 'Journaled',
    stretching: 'Stretching',
    reading: 'Reading',
    projectWorkDone: 'Projects',
    gym: 'Gym',
};

const DailyLogPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id?: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const [saveError, setSaveError] = useState<string | null>(null);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);

// True once the user deliberately re-saves this day's goals. Lifts the snapshot
// freeze for any date, so an explicit edit is never overwritten by the autosave
// and an accidental one never happens.
const [goalsExplicitlyEdited, setGoalsExplicitlyEdited] = useState(false);
const [showGoalsEditor, setShowGoalsEditor] = useState(false);
    /* Open by default on a screen with room for it: the breakdown is what says *why* a
 * day scored what it did, and a card that opens to nothing but a ring is a number
 * with nothing to say.
 *
 * Closed on a phone, where it is six categories of chips pushed the daily log's
 * actual form -- sleep, food, weight, mood -- off the first screen. The reading
 * happens on the ring there and the breakdown is one tap away, which is the right
 * way round when the tap is a thumb and the screen is short.
 *
 * A lazy initialiser rather than an effect, so there is no first paint with the
 * wrong one. Lifted out of ScoreCard because the row of controls above the card
 * toggles it too, and two controls over one thing have to be looking at one value. */
const [breakdownOpen, setBreakdownOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches
);
    const [isEditing, setIsEditing] = useState(false);
    /**
     * Settings come from React Query, not from a `useState` filled once at mount.
     *
     * The mount-time copy was the reason editing today's goals appeared to do
     * nothing. `handleSaveDayGoals` writes the new `goal_history` to Postgres and
     * then invalidates `queryKeys.userSettings` -- but this page was not reading
     * that key, so the invalidation was a no-op here and the page kept the
     * pre-edit copy for the rest of the session. Every goal on the page then
     * resolved against the old history, and the debounced autosave wrote that old
     * value straight back into today's `goal_snapshot`. The edit reappeared only
     * tomorrow, when the new history version finally won for a date that was no
     * longer "today" -- and was then frozen into the row permanently.
     *
     * Reading the key that is already being invalidated fixes all of that at the
     * source. `useUserSettings` is that reader; it is what every other page uses.
     */
    const { settings, isLoading: settingsLoading, isError: settingsError } = useUserSettings();
    const [habits, setHabits] = useState<Habit[]>([]);
    const [completedHabits, setCompletedHabits] = useState<Set<string>>(new Set());
    const [loadingHabits, setLoadingHabits] = useState(true);
    /**
     * "Asked and answered", not "have a value".
     *
     * A user with no settings row legitimately has `settings === null`, so this
     * flag -- not the settings object -- is what the boot hold and the
     * onboarding redirect read. `isLoading` covers it, including on error, which
     * is the same condition this describes.
     */
    const settingsLoaded = !settingsLoading;

    /**
     * Send first-time users to onboarding -- but only when we actually know.
     *
     * This was a bare `settingsLoaded && !settings?.active_goals` calling
     * `navigate` during render, which is a side effect in the render phase and
     * would fire a second time under StrictMode's double render. Worse, a failed
     * fetch used to arrive here as `settings === null`, so a transient network
     * error threw a returning user into the setup page -- where saving replaces
     * their `goal_history` with a single version. Hence the three conditions:
     * the answer arrived, it was not an error, and it has no goals in it.
     */
    const needsGoalSetup = settingsLoaded && !settingsError && !settings?.active_goals;
    useEffect(() => {
        if (needsGoalSetup) navigate('/Daily-Log/Setup');
    }, [needsGoalSetup, navigate]);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /**
     * The save callbacks are invoked from a timer and from the unmount cleanup,
     * neither of which has a render to close over. Holding the latest one in a ref
     * is what makes a flush write what the form holds *now*: the alternative was a
     * closure stashed when the timer was set, which wrote yesterday's values.
     */
    const saveNowRef = useRef<(() => Promise<unknown>) | null>(null);
    /**
     * Whole-row writes, one at a time.
     *
     * Two of them can otherwise be in flight together -- a habit tick's follow-up
     * autosave and a field edit landing in the same moment -- and they carry
     * snapshots of the form taken at different times. If the older request reached
     * Postgres second it won, and the newer edit was silently gone. Chaining them
     * makes "the last edit wins" true rather than "the last response wins".
     */
    const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
    /** Habit writes still open, so the "Saved" flash waits for the last of a burst. */
    const habitWritesRef = useRef(0);
    const habitSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [habitSaveState, setHabitSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [isLoadingData, setIsLoadingData] = useState(true);

    // The day being edited lives in the URL (?date=YYYY-MM-DD) so a refresh, a
    // shared link, and the browser's back/forward buttons all keep you on it.
    // In edit-by-id mode the loaded log owns the date instead and we never
    // write the param. An absent or malformed ?date= falls back to today.
    const dateParam = searchParams.get('date');
    /**
     * The local calendar date, read once per render and shared.
     *
     * Hoisted above the goal resolution because "is this today" is what decides
     * whether a day's goals come from the editable history or from the frozen
     * snapshot. Two separate `todayString()` calls can straddle midnight and
     * disagree with each other, and the page then resolves one question with two
     * different answers in the same render.
     */
    const today = todayString();
    const logDate = id
        ? (existingLog?.log_date ?? '')
        : (isDateString(dateParam) ? dateParam : today);

    const setLogDate = useCallback((date: string) => {
        if (!isDateString(date)) return;
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('date', date);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const [wakeTime, setWakeTime] = useState('');
    const [bedtime, setBedtime] = useState('');
    const [sleepQuality, setSleepQuality] = useState('');
    const [morningSystolic, setMorningSystolic] = useState('');
    const [morningDiastolic, setMorningDiastolic] = useState('');
    const [morningBpm, setMorningBpm] = useState('');
    const [eveningSystolic, setEveningSystolic] = useState('');
    const [eveningDiastolic, setEveningDiastolic] = useState('');
    const [eveningBpm, setEveningBpm] = useState('');
    const [bodyTemperature, setBodyTemperature] = useState('');
    const [calories, setCalories] = useState('');
    const [protein, setProtein] = useState('');
    const [carbs, setCarbs] = useState('');
    const [fat, setFat] = useState('');
    const [water, setWater] = useState('');
    // Mood has no state here. It is rated on the journal page -- one slider above
    // each half of the day's writing -- and this page only reads it back, so
    // there is nothing to hold. Keeping a local copy would be a second source of
    // truth for a number this page cannot change, and the daily autosave below
    // would write it back out on every edit to every other field.
    const [journalEntry, setJournalEntry] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [projectWorkDone, setProjectWorkDone] = useState(false);

    const [morningRoutine, setMorningRoutine] = useState(false);
    const [eveningRoutine, setEveningRoutine] = useState(false);
    const [fruitServing, setFruitServing] = useState(false);
    const [studied, setStudied] = useState(false);
    const [journal, setJournal] = useState(false);
    const [stretching, setStretching] = useState(false);
    const [reading, setReading] = useState(false);
    const [noSleep, setNoSleep] = useState(false);
    // A cheat day leaves every food value stored exactly as typed and only stops
    // them counting in the score -- see the note on `cheatDay` in dailyScoring.
    const [cheatDay, setCheatDay] = useState(false);

    // Gym is a built-in habit, but it is written by the workout pages rather
    // than by this form: ticking it here and marking the same day on /Workouts
    // are the same call, so the habit charts, the score ring and the workout
    // heatmap can never report a different answer for one date.
    const setGym = useSetGymForDate();
    const [gym, setGymLocal] = useState(false);


    const toggleGym = async () => {
        const next = !gym;
        setGymLocal(next);
        try {
            await setGym.mutateAsync({ date: logDate, trained: next, materialize: true });
        } catch (error) {
            setGymLocal(!next);
            console.error('Could not update the gym habit:', error);
        }
    };

    const [showHabitCreateModal, setShowHabitCreateModal] = useState(false);
    const [customHabitPriority, setCustomHabitPriority] = useState<'high' | 'medium' | 'low'>('medium');
    const [customHabitNegative, setCustomHabitNegative] = useState(false);
    const [customHabitSchedule, setCustomHabitSchedule] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
    const [customHabitName, setCustomHabitName] = useState('');
    const [customHabitDesc, setCustomHabitDesc] = useState('');
    const [addingHabit, setAddingHabit] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deletingHabit, setDeletingHabit] = useState(false);
    const updateHabit = useUpdateHabit();
    const [savingBuiltinHabit, setSavingBuiltinHabit] = useState(false);

    /**
     * The single editor, for both kinds of habit.
     *
     * Custom habits are `habits` rows; built-ins live in
     * `user_settings.habit_settings`. The editor value carries both cases so the
     * rest of the page does not need to know which storage it is about to write.
     */
    const [editingHabit, setEditingHabit] = useState<HabitEditorValue | null>(null);
    const [habitEditError, setHabitEditError] = useState<string | null>(null);
    const habitMenu = useContextMenu();

    const builtinHabitSetting = useCallback((key: EditableBuiltinHabitKey) =>
        settings?.habit_settings?.[key] ?? {}, [settings]);

    const builtinHabitLabel = useCallback((key: EditableBuiltinHabitKey) =>
        builtinHabitSetting(key).name?.trim() || BUILTIN_HABIT_LABELS[key],
    [builtinHabitSetting]);

    /**
     * What the right click offers: one Edit, whatever kind of habit it is.
     *
     * The menu used to be the only route to priority, polarity, schedule and
     * removal, which meant five little actions whose consequences were explained
     * nowhere. The editor shows all of them together, and the menu is just the way
     * to open it.
     */
    const openHabitEditor = useCallback((habit: HabitEditorValue) => {
        setHabitEditError(null);
        setEditingHabit(habit);
    }, []);

    const editMenuItem = useCallback((habit: HabitEditorValue): ContextMenuItem => ({
        id: 'edit',
        label: 'Edit',
        icon: PenLine,
        onSelect: () => openHabitEditor(habit),
    }), [openHabitEditor]);

    const openBuiltinHabitEditor = useCallback((key: EditableBuiltinHabitKey) => {
        const cfg = builtinHabitSetting(key);
        openHabitEditor({
            builtIn: true,
            builtInKey: key,
            id: null,
            name: cfg.name?.trim() || BUILTIN_HABIT_LABELS[key],
            description: cfg.description ?? null,
            priority: cfg.priority ?? 'medium',
            is_negative: cfg.is_negative ?? false,
            schedule_days: cfg.schedule_days ?? null,
        });
    }, [builtinHabitSetting, openHabitEditor]);

    const builtinHabitMenu = useCallback((key: EditableBuiltinHabitKey): ContextMenuItem[] => [{
        id: 'edit',
        label: 'Edit',
        icon: PenLine,
        onSelect: () => openBuiltinHabitEditor(key),
    }], [openBuiltinHabitEditor]);

    const fillForm = (log: DailyLog) => {
        setWakeTime(log.wake_time || '');
        setBedtime(log.bedtime || '');
        setSleepQuality(log.sleep_quality?.toString() || '');
        setMorningSystolic(log.morning_systolic?.toString() || '');
        setMorningDiastolic(log.morning_diastolic?.toString() || '');
        setMorningBpm(log.morning_bpm?.toString() || '');
        setEveningSystolic(log.evening_systolic?.toString() || '');
        setEveningDiastolic(log.evening_diastolic?.toString() || '');
        setEveningBpm(log.evening_bpm?.toString() || '');
        setBodyTemperature(log.body_temperature?.toString() || '');
        setCalories(log.calories?.toString() || '');
        setProtein(log.protein?.toString() || '');
        setCarbs(log.carbs?.toString() || '');
        setFat(log.fat?.toString() || '');
        setWater(log.water?.toString() || '');
        // Mood is not copied into form state -- see the note on where it moved to.
        setJournalEntry(log.journal_entry || '');
        setProjectWorkDone(log.project_work_done || false);
        setMorningRoutine(log.morning_routine || false);
        setEveningRoutine(log.evening_routine || false);
        setFruitServing(log.fruit_serving || false);
        setStudied(log.studied || false);
        // Content wins over the stored tick: a day with a journal entry is a
        // journalled day, however the boolean got left. A day with no entry keeps
        // whatever the user ticked, which is the whole point of the asymmetry in
        // journalHabitFor.
        setJournal(hasJournalContent(log.journal_entry) || (log.journal || false));
        setStretching(log.stretching || false);
        setReading(log.reading || false);
        setNoSleep(log.no_sleep || false);
        setCheatDay(log.cheat_day || false);
        setGymLocal(log.gym || false);
    };

    const resetForm = () => {
        setWakeTime('');
        setBedtime('');
        setSleepQuality('');
        setMorningSystolic('');
        setMorningDiastolic('');
        setMorningBpm('');
        setEveningSystolic('');
        setEveningDiastolic('');
        setEveningBpm('');
        setBodyTemperature('');
        setCalories('');
        setProtein('');
        setCarbs('');
        setFat('');
        setWater('');
        setJournalEntry('');
        setProjectWorkDone(false);
        setMorningRoutine(false);
        setEveningRoutine(false);
        setFruitServing(false);
        setStudied(false);
        setJournal(false);
        setStretching(false);
        setReading(false);
        setNoSleep(false);
        setCheatDay(false);
        setGymLocal(false);
        setSelectedProjectIds(new Set());
    };

    // Load log by ID if in edit mode
    useEffect(() => {
        if (!id) return;
        const loadLog = async () => {
            setIsLoadingData(true);
            try {
                const log = await getDailyLogById(id);
                if (log) {
                    setExistingLog(log);
                    setIsEditing(true);
                    fillForm(log);
                    const projectIds = await getDailyLogProjects(log.id!);
                    if (projectIds.length > 0) {
                        setSelectedProjectIds(new Set(projectIds));
                    }
                }
            } finally {
                // Cleared in a `finally` because this flag is part of the boot
                // hold below. A rejected fetch has to still count as "asked and
                // answered", or the splash waits on a load that is never coming.
                setIsLoadingData(false);
            }
        };
        loadLog();
    }, [id]);

    // Load habits
    useEffect(() => {
        const loadHabits = async () => {
            setLoadingHabits(true);
            try {
                const userHabits = await getUserHabits();
                setHabits(userHabits);
            } finally {
                setLoadingHabits(false);
            }
        };
        loadHabits();
    }, []);

    // Load completed habits for the current date (cached per date, so revisiting
    // a day renders instantly and background-refreshes)
    const { data: completedHabitSet, isPlaceholderData: completedHabitsPlaceholder } = useQuery({
        queryKey: queryKeys.completedHabits(logDate || 'no-date'),
        queryFn: () => getCompletedHabitsForDate(logDate),
        enabled: !!logDate && !id,
        placeholderData: keepPreviousData,
    });
    const lastHabitDateRef = useRef<string | null>(null);
    useEffect(() => {
        if (completedHabitsPlaceholder || completedHabitSet === undefined) return;
        if (lastHabitDateRef.current === logDate) return;
        lastHabitDateRef.current = logDate;
        setCompletedHabits(
            new Set(Array.isArray(completedHabitSet) ? completedHabitSet : []),
        );
    }, [completedHabitSet, completedHabitsPlaceholder, logDate]);

    // Load projects
    useEffect(() => {
        const loadProjects = async () => {
            setLoadingProjects(true);
            try {
                const userProjects = await getUserProjects();
                setProjects(userProjects);
            } finally {
                setLoadingProjects(false);
            }
        };
        loadProjects();
    }, []);

    // Goals for the day being viewed, not the goals in force right now.
    //
    // Resolution order:
    //   1. the log's own snapshot, which is what the day was actually scored
    //      against and therefore the most trustworthy record;
    //   2. the goal version effective on that date, so a day logged before any
    //      snapshot exists still resolves to the targets of its era;
    //   3. active_goals, for rows predating goal versioning.
    //
    // Keyed on logDate rather than `id`: reaching a past day via ?date= used to
    // fall through to today's goals, which is what made old days move whenever
    // a goal was edited.
    const activeGoals = useMemo<ActiveGoals | null>(
        () =>
            resolveGoalsForDay({
                snapshot: existingLog?.goal_snapshot,
                history: parseGoalHistory(settings?.goal_history),
                date: logDate,
                fallback: (settings?.active_goals as ActiveGoals | undefined) ?? null,
                today: today,
            }),
        /**
         * `today` is a dependency, not an incidental read.
         *
         * `resolveGoalsForDay` treats today differently from every other day --
         * today resolves from the history, a past day resolves from its frozen
         * snapshot. Calling `todayString()` inside the memo without depending on
         * it meant the memo could keep classifying a day as "past" after
         * midnight, so the snapshot won and today's goals went stale. The
         * roll-forward effect does move `logDate`, which hides this most of the
         * time -- but it polls every 60 seconds, so there is a window where the
         * two disagree about which day it is.
         */
        [existingLog, settings, logDate, today],
    );

    // Only what scoring reads: the day's goals plus the body targets.
    const effectiveSettings = useMemo(
        () => (activeGoals
            ? { ...settings, active_goals: activeGoals }
            : settings),
        [settings, activeGoals]
    );
    const nutritionGoals = activeGoals?.nutrition;

    // Latest body-measurement date drives the measurement-recent-worthy daily metric.
    const { data: lastMeasurementDate } = useLatestMeasurement();

    // Compute sleep duration from wake/bed times (null on "no sleep" nights)
    const computedSleepDuration = useMemo(() => {
        return noSleep ? null : calculateSleepDuration(wakeTime, bedtime);
    }, [noSleep, wakeTime, bedtime]);

// What can honestly be ticked off as "worked on today": work that is live
    // (`active`) or shipped-and-being-fixed (`maintenance`).
    //
    // `maintenance` belongs here. It means the build shipped and something in it
    // needs fixing, which is real work a person genuinely spends a day on -- it
    // just doesn't move the build forward. Reading it as "not really worked on"
    // is what made maintenance work impossible to log, which in turn made the
    // honest answer to a day spent fixing things impossible to record.
    //
    // Still excluded: not started, deliberately halted, done, filed away.
    //
    // Anything already attached to this log is force-included whatever its status.
    // `saveDailyLogProjects` replaces the whole association set, and the 2s
    // debounced autosave calls it on any form change -- so a project that was
    // `active` when it was logged and has since been paused would be invisible
    // here *and* silently deleted from the log on the next save. Visibility is
    // what keeps an existing association from being a write-once liability.
    //
    // Ordered so the two live groups read in the same order as the projects page:
    // active, then maintenance, then anything else, each by priority, then
    // deadline, then title.
    const selectableProjects = useMemo(() => {
        const statusRank = (p: Project) =>
            p.status === 'active' ? 0 : p.status === 'maintenance' ? 1 : 2;
        const priorityRank = { high: 0, medium: 1, low: 2 } as const;

        return projects
            .filter(p =>
                p.status === 'active'
                || p.status === 'maintenance'
                || selectedProjectIds.has(p.id!))
            .sort((a, b) =>
                statusRank(a) - statusRank(b)
                || priorityRank[a.priority] - priorityRank[b.priority]
                // Projects with no deadline sort last rather than first, hence
                // the sentinel: an empty string would compare before any date.
                || (a.deadline || '\uffff').localeCompare(b.deadline || '\uffff')
                || a.title.localeCompare(b.title));
    }, [projects, selectedProjectIds]);

    // --- Cheat-day budget ---
    //
    // Every log is needed, not just this day's, because "is this cheat day the
    // first of the week or the third" is a fact about the window. The shared
    // `daily-logs` query is already fetched and invalidated around saves, so this
    // costs no extra request when the history or dashboard have been visited.
    const { logs: allLogs } = useDailyLogs();
    const cheatStatus = useMemo(() => cheatDayStatus({
        logs: allLogs ?? [],
        date: logDate,
        // The form is the source of truth for this day: the toggle moves before
        // the write, and the stored row may still hold yesterday's answer.
        isCheat: cheatDay,
        allowed: settings?.cheat_days_allowed ?? null,
        period: settings?.cheat_days_period ?? 'week',
    }), [allLogs, logDate, cheatDay, settings]);
    // A day off the plan the budget cannot cover: macros scored 0 and counted.
    // Within the allowance the macros score a full 100 instead (see the scorer),
    // so the boxes keep their normal green border on a covered cheat day.
    const cheatOverBudget = cheatDay && !cheatStatus.exempt;
    const cheatPeriodLabel = (settings?.cheat_days_period ?? 'week') === 'month' ? 'month' : 'week';

    // --- Weighted habit score (priority tiers, negatives, scheduling) ---
    const habitScore = useMemo(() => {
        const priorityWeight = (p?: string | null) => (p === 'high' ? 3 : p === 'low' ? 1 : 2);

        const dayOfWeek = new Date(logDate + 'T00:00:00').getDay();

        const habitSetting = (key: string) => settings?.habit_settings?.[key] ?? {};

        const builtinHabits = [
            { key: 'gym', done: gym, baseWeight: 3 },
            { key: 'fruitServing', done: fruitServing, baseWeight: 2 },
            { key: 'studied', done: studied, baseWeight: 3 },
            { key: 'journal', done: journal, baseWeight: 2 },
            { key: 'stretching', done: stretching, baseWeight: 1 },
            { key: 'reading', done: reading, baseWeight: 2 },
            { key: 'projectWorkDone', done: projectWorkDone, baseWeight: 3 },
        ];

        let totalWeight = 0;
        let doneWeight = 0;
        for (const h of builtinHabits) {
            const cfg = habitSetting(h.key);
            const priorityWeight = cfg.priority === 'high' ? 3 : cfg.priority === 'low' ? 1 : 2;
            const w = priorityWeight;
            const scheduled = !cfg.schedule_days || cfg.schedule_days.length === 0
                || cfg.schedule_days.includes(dayOfWeek);
            if (!scheduled) continue;
            totalWeight += w;
            const isNegative = cfg.is_negative ?? false;
            const countsAsDone = isNegative ? !h.done : h.done;
            if (countsAsDone) doneWeight += w;
        }
        for (const habit of habits) {
            if (!habit.is_active) continue;
            if (habit.schedule_days && habit.schedule_days.length > 0 && !habit.schedule_days.includes(dayOfWeek)) continue;
            const w = priorityWeight(habit.priority);
            totalWeight += w;
            const completed = completedHabits.has(habit.id!);
            const countsAsDone = habit.is_negative ? !completed : completed;
            if (countsAsDone) doneWeight += w;
        }
        if (totalWeight === 0) return 0;
        return (doneWeight / totalWeight) * 100;
    }, [fruitServing, studied, journal, stretching, reading, projectWorkDone, gym, habits, completedHabits, logDate, settings]);

    // --- Scoring (fair, grouped) ---
    const scoreResult = useMemo(() => computeDailyScore({
        wakeTime,
        bedtime,
        sleepQuality,
        morningSystolic,
        morningDiastolic,
        morningBpm,
        eveningSystolic,
        eveningDiastolic,
        eveningBpm,
        bodyTemperature,
        calories,
        protein,
        carbs,
        fat,
        water,
        weight: null,
        bodyFat: null,
        // Read straight off the stored log rather than through form state, so the
        // score ring picks up a rating made on the journal page the next time this
        // day is opened -- even though this page cannot itself change it.
        morningMood: moodFor(existingLog, 'morning')?.toString() ?? '',
        eveningMood: moodFor(existingLog, 'evening')?.toString() ?? '',
        habits: { morningRoutine, eveningRoutine, fruitServing, studied, stretching, reading, journal, projectWorkDone, gym },
        customCompleted: completedHabits.size,
        customTotal: habits.length,
        habitScore,
        activeGoals,
        settings: effectiveSettings,
        noSleep,
        cheatDay,
        cheatDayExempt: cheatStatus.exempt,
        lastMeasurementDate,
    }), [wakeTime, bedtime, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, existingLog, morningRoutine, eveningRoutine, fruitServing, studied, stretching, reading, journal, projectWorkDone, gym, completedHabits, habits, activeGoals, effectiveSettings, noSleep, cheatDay, cheatStatus, lastMeasurementDate, habitScore]);

    const calculatedScore = scoreResult.score;
    // The day's average rating, for the mood card's header. Null rather than zero
    // when nothing was rated, so an empty card does not advertise a flat mood.
    const dayMeanMood = meanMood(existingLog);
    const scoreOf = (key: string): number | null => {
        const m = scoreResult.metrics[key];
        return m && m.logged ? m.score : null;
    };

    // Check for existing log by date (non-edit mode). Cached per date via React
    // Query so navigating between previously-viewed days is instant; each date
    // refreshes in the background while the previous data is shown.
    //
    // `staleTime: 0` is load-bearing, not a performance choice. The whole query
    // cache is persisted to IndexedDB and restored before the first render, so with
    // the default two minute staleTime a refresh inside that window mounted with
    // yesterday's snapshot still considered fresh: the server was never asked, and
    // the form was filled from a snapshot taken before the last edit. Refusing to
    // trust a restored snapshot means the answer that fills the form is the one the
    // server actually gives.
    const { data: dayLog, isPlaceholderData: dayLogPlaceholder, isFetching: dayLogFetching } = useQuery({
        queryKey: queryKeys.dailyLogByDate(logDate || 'no-date'),
        queryFn: () => getDailyLogByDate(logDate),
        enabled: !!logDate && !id,
        placeholderData: keepPreviousData,
        staleTime: 0,
    });
    const lastAppliedLogDateRef = useRef<string | null>(null);
    useEffect(() => {
        if (id) return;
        if (dayLogPlaceholder || dayLog === undefined) return;
        // Waiting out the refetch is the other half of `staleTime: 0`. Without it
        // this effect applies whatever the cache held the moment it mounted and the
        // guard below then refuses to let the real answer replace it, so the page
        // showed the snapshot for as long as the tab stayed open -- and the autosave
        // below, keyed on the same state, wrote that snapshot back over the server.
        if (dayLogFetching) return;
        if (lastAppliedLogDateRef.current === logDate) return;
        lastAppliedLogDateRef.current = logDate;
        if (dayLog) {
            // Populating the form from the fetched log is an external-system
            // sync (server data -> local state), which is what effects are for.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setExistingLog(dayLog);
            setIsEditing(true);
            fillForm(dayLog);
            getDailyLogProjects(dayLog.id!).then(projectIds => {
                setSelectedProjectIds(projectIds.length > 0 ? new Set(projectIds) : new Set());
            });
        } else {
            setExistingLog(null);
            setIsEditing(false);
            resetForm();
        }
    }, [dayLog, dayLogPlaceholder, dayLogFetching, logDate, id]);

    // True while the current day's log is still being fetched (non-edit mode).
    // Uses query flags instead of a state toggle so the auto-save guard below
    // stays derived and doesn't trigger cascading renders.
    const dayLogLoading = !id && (dayLogPlaceholder || dayLog === undefined);

    // Follow the calendar day forward, but only when the user was already
    // looking at "today". Switching tabs/windows to copy a value fires `focus`
    // and `visibilitychange` constantly, and an unconditional reset to today
    // here used to silently move every edit onto today's log. The 60s interval
    // covers a tab left open across midnight without a focus event.
    const lastKnownTodayRef = useRef<string>(todayString());
    useEffect(() => {
        if (id) return;
        const rollForwardIfNewDay = () => {
            const today = todayString();
            const previousToday = lastKnownTodayRef.current;
            lastKnownTodayRef.current = today;
            if (today !== previousToday && logDate === previousToday) {
                setLogDate(today);
            }
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') rollForwardIfNewDay();
        };
        window.addEventListener('focus', rollForwardIfNewDay);
        document.addEventListener('visibilitychange', onVisibilityChange);
        const intervalId = window.setInterval(rollForwardIfNewDay, 60_000);
        return () => {
            window.removeEventListener('focus', rollForwardIfNewDay);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.clearInterval(intervalId);
        };
    }, [id, logDate, setLogDate]);

    // Auto-save function
    const performSave = useCallback(async () => {
        if (!settings) return;

        // Don't create a brand-new log unless the user has actually entered something
        if (!isEditing) {
            const hasAnyData =
                wakeTime || bedtime || sleepQuality ||
                morningSystolic || morningDiastolic || morningBpm ||
                eveningSystolic || eveningDiastolic || eveningBpm ||
                bodyTemperature || calories || protein || carbs || fat ||
                water || journalEntry ||
                noSleep || cheatDay || projectWorkDone || morningRoutine || eveningRoutine ||
                fruitServing || studied || journal || stretching || reading ||
                selectedProjectIds.size > 0;
            if (!hasAnyData) return;
        }

        setSaveError(null);
        try {
            // The day's goals, frozen onto the log itself.
            //
            // A past day's snapshot is authoritative and is never rewritten: it
            // holds the targets that day was actually scored against, and the 2s
            // debounced autosave fires on any form change, so overwriting
            // unconditionally would restamp history every time an old day was
            // opened.
            //
            // Today is the exception, and it has to be. Goals edited today write a
            // new history version, so today's snapshot must be allowed to follow or
            // the edit would not register until tomorrow. That is safe because
            // `activeGoals` for today resolves from the history, so re-stamping
            // writes back the same values rather than drifting.
            //
            // `goalsExplicitlyEdited` covers the deliberate case for any date: the
            // user opened this day's goals and changed them, which is exactly the
            // action the freeze is meant to protect against happening by accident.
            let goalSnapshot: Record<string, unknown> | undefined | null;
            const viewingToday = isDateString(logDate) && logDate === todayString();
            if (existingLog?.goal_snapshot && !viewingToday && !goalsExplicitlyEdited) {
                goalSnapshot = existingLog.goal_snapshot;
            } else {
                const base = activeGoals ?? (settings?.active_goals as ActiveGoals | undefined) ?? null;
                goalSnapshot = base || settings ? {
                    nutrition: {
                        calories: base?.nutrition?.calories ?? (settings?.target_weight != null ? Math.round(settings.target_weight * 30) : null),
                        protein: base?.nutrition?.protein ?? (settings?.starting_weight != null ? Math.round(settings.starting_weight * 1.6) : null),
                        carbs: base?.nutrition?.carbs ?? null,
                        fat: base?.nutrition?.fat ?? null,
                        water: base?.nutrition?.water ?? 2500,
                    },
                    sleep: {
                        hours: base?.sleep?.hours ?? 8,
                        wake_time: base?.sleep?.wake_time ?? null,
                        bedtime: base?.sleep?.bedtime ?? null,
                    }
                } : null;
            }

            const logData: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'> = {
                log_date: logDate,
                wake_time: noSleep ? null : (wakeTime || null),
                bedtime: noSleep ? null : (bedtime || null),
                sleep_duration: noSleep ? null : computedSleepDuration,
                sleep_quality: noSleep ? null : (sleepQuality ? Math.round(parseFloat(sleepQuality)) : null),
                morning_systolic: morningSystolic ? parseInt(morningSystolic) : null,
                morning_diastolic: morningDiastolic ? parseInt(morningDiastolic) : null,
                morning_bpm: morningBpm ? parseInt(morningBpm) : null,
                evening_systolic: eveningSystolic ? parseInt(eveningSystolic) : null,
                evening_diastolic: eveningDiastolic ? parseInt(eveningDiastolic) : null,
                evening_bpm: eveningBpm ? parseInt(eveningBpm) : null,
                body_temperature: bodyTemperature ? parseFloat(bodyTemperature) : null,
                calories: calories ? parseInt(calories) : null,
                protein: protein ? parseInt(protein) : null,
                carbs: carbs ? parseInt(carbs) : null,
                fat: fat ? parseInt(fat) : null,
                water: water ? parseInt(water) : null,
                // morning_mood / evening_mood are absent on purpose, not null.
                //
                // They are written by the journal page, and this page's save is a
                // whole-row upsert. PostgREST only sets the columns a payload
                // actually carries, so leaving these out preserves whatever the
                // journal wrote -- whereas `null` here would silently wipe a day's
                // mood on the next edit to any unrelated field, which is the sort
                // of bug that only shows up a week later.
                daily_score: calculatedScore,
                journal_entry: journalEntry || null,
                project_work_done: projectWorkDone,
                goal_snapshot: goalSnapshot ?? null,
                morning_routine: morningRoutine,
                evening_routine: eveningRoutine,
                fruit_serving: fruitServing,
                studied: studied,
                journal: journal,
                stretching: stretching,
                reading: reading,
                no_sleep: noSleep,
                cheat_day: cheatDay,
            };

            if (isEditing && existingLog?.id) {
                await updateDailyLog(existingLog.id, logData);
                await saveDailyLogProjects(existingLog.id, Array.from(selectedProjectIds));
            } else {
                const newLog = await createDailyLog(logData);
                if (newLog) {
                    setExistingLog(newLog as DailyLog);
                    setIsEditing(true);
                    await saveDailyLogProjects(newLog.id, Array.from(selectedProjectIds));
                }
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogByDate(logDate) });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save. Please try again.';
            setSaveError(message);
            console.error('Auto-save error:', err);
        }
    }, [settings, activeGoals, logDate, goalsExplicitlyEdited, wakeTime, bedtime, computedSleepDuration, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, journalEntry, selectedProjectIds, projectWorkDone, noSleep, cheatDay, calculatedScore, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, isEditing, existingLog, queryClient]);

    /**
     * Queues a whole-row write behind any that are already open.
     *
     * `performSave` reads the form at the moment it runs, so chaining it rather
     * than firing it is what makes the outcome "the last edit wins" instead of
     * "whichever response arrives last wins".
     */
    const enqueueSave = useCallback(() => {
        const run = () => performSave();
        const next = saveChainRef.current.then(run, run);
        saveChainRef.current = next.catch(() => {});
        return next;
    }, [performSave]);

    // Published for the timer and the unmount cleanup, which cannot see a render.
    useEffect(() => {
        saveNowRef.current = enqueueSave;
    }, [enqueueSave]);

    const scheduleSave = useCallback((delay = 600) => {
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null;
            void saveNowRef.current?.();
        }, delay);
    }, []);

    const flushSave = useCallback(() => {
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        }
        void saveNowRef.current?.();
    }, []);

    /**
     * Ticking a built-in habit.
     *
     * The checkbox moves first and the write follows immediately, because a habit
     * is one column and there is nothing to gain from waiting for a debounce that
     * exists to coalesce typing. Waiting was the bug: the tick sat in a timer, so a
     * refresh inside that window lost it, and nothing on screen said whether the
     * write had landed or not.
     *
     * The checkbox is rolled back if the write fails, and the day's queries are
     * invalidated so the dashboard and the history read the same fact. The debounced
     * autosave still runs a moment later on the strength of the state change, which
     * is what brings `daily_score` and the day's project links back in step.
     */
    const saveBuiltinHabit = useCallback((
        column: DailyLogHabitColumn,
        value: boolean,
        setValue: (next: boolean) => void,
    ) => {
        setValue(value);
        if (!logDate) return;
        setSaveError(null);
        habitWritesRef.current += 1;
        setHabitSaveState('saving');
        if (habitSavedTimerRef.current) {
            clearTimeout(habitSavedTimerRef.current);
            habitSavedTimerRef.current = null;
        }
        let written = false;
        void setDailyLogHabit(logDate, column, value)
            .then(() => {
                written = true;
                queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogByDate(logDate) });
                queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
                if (column === 'cheat_day' && settings) {
                    // A cheat day moves the window's free/over-budget line, so the
                    // other cheat days in the window have to be re-scored from their
                    // stored rows. Today is left to its own autosave, which is a beat
                    // behind this write and would otherwise race it.
                    void recalcCheatDayScores({
                        allowed: settings.cheat_days_allowed ?? null,
                        period: settings.cheat_days_period ?? 'week',
                        anchorDate: logDate,
                        excludeDates: [logDate],
                    })
                        .then(() => {
                            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
                        })
                        .catch(error => console.error('Cheat-day recalculation failed:', error));
                }
            })
            .catch(error => {
                setValue(!value);
                // Supabase rejects with a plain error object rather than an Error,
                // so the message is read off it rather than through instanceof.
                const detail = (error as { message?: string } | null)?.message;
                setSaveError(detail || 'Could not save that habit. Please try again.');
                console.error('Could not save the habit:', error);
            })
            .finally(() => {
                habitWritesRef.current -= 1;
                if (habitWritesRef.current > 0) return;
                // Not on the failure path: the checkbox has been put back and there
                // is nothing on the server to report as saved.
                if (!written) {
                    setHabitSaveState('idle');
                    return;
                }
                setHabitSaveState('saved');
                habitSavedTimerRef.current = setTimeout(() => {
                    habitSavedTimerRef.current = null;
                    setHabitSaveState('idle');
                }, 2000);
            });
    }, [logDate, queryClient, settings]);

    useEffect(() => {
        if (saveError) {
            const timer = setTimeout(() => setSaveError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [saveError]);

    // Flush any pending save when the component unmounts (SPA navigation).
    // Leaving the page inside the debounce window used to throw the edit away
    // silently; now it lands on the day it was made for.
    useEffect(() => {
        return () => {
            flushSave();
            if (habitSavedTimerRef.current) clearTimeout(habitSavedTimerRef.current);
        };
    }, [flushSave]);

    // Debounced auto-save on any state change.
    //
    // The built-in habit booleans are in this list on purpose: a tick is written on
    // the click, and this is the write that follows it to put the day's score and
    // its project links back in step. `noSleep` belongs here too -- it is a habit
    // column, and it is also what nulls out the sleep fields, which only this
    // whole-row write can do. `cheatDay` is here for the same first reason: one
    // column, written on the click, and the score it changes only this write
    // stores.
    //
    // What is deliberately absent is the "add a custom habit" form. Those two
    // fields are not part of the day's log at all, and having them here wrote every
    // column of the log to the database on each keystroke of a habit name.
    useEffect(() => {
        if (!settings || (id ? isLoadingData : dayLogLoading)) return;
        scheduleSave(600);
        return () => {
            // Timer cleanup is handled by flushSave on unmount; this cleanup
            // only cancels the timer if the effect re-runs for another reason.
        };
    }, [wakeTime, bedtime, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, journalEntry, selectedProjectIds, projectWorkDone, noSleep, cheatDay, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, completedHabits, scheduleSave, settings, isLoadingData, dayLogLoading, id]);

    const handleProjectToggle = (projectId: string) => {
        setSelectedProjectIds(prev => {
            const next = new Set(prev);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
        });
    };

    const handleAddCustomHabit = async () => {
        if (!customHabitName.trim()) return;
        setAddingHabit(true);
        try {
            await createHabit({
                name: customHabitName.trim(),
                description: customHabitDesc.trim() || undefined,
                priority: customHabitPriority,
                is_negative: customHabitNegative,
                schedule_days: customHabitSchedule.length === 7 ? null : customHabitSchedule,
            });
            const userHabits = await getUserHabits();
            setHabits(userHabits);
            queryClient.invalidateQueries({ queryKey: queryKeys.habits });
            setCustomHabitName('');
            setCustomHabitDesc('');
            setCustomHabitPriority('medium');
            setCustomHabitNegative(false);
            setCustomHabitSchedule([0, 1, 2, 3, 4, 5, 6]);
            setShowHabitCreateModal(false);
        } catch (err) {
            console.error('Error creating habit:', err);
        } finally {
            setAddingHabit(false);
        }
    };

    /**
     * Saves goals for the day being viewed.
     *
     * Two writes, with deliberately different reach:
     *
     *  - The day's own `goal_snapshot`. This is the per-day record the day's score
     *    is computed against, so writing it changes this day and nothing else.
     *
     *  - Only when the day is today, a new version in `user_settings.goal_history`
     *    plus the `active_goals` pointer. A goal changed for today should also be
     *    the goal tomorrow starts from. A past day's edit deliberately does *not*
     *    touch the history: "this one day was different" must not silently become
     *    the new normal for every day after it, which is the exact leak migration
     *    0005 was written to close.
     *
     * Editing today therefore also lifts the snapshot freeze, so the next autosave
     * re-stamps today's snapshot from the same resolved values instead of writing
     * the pre-edit targets back over this change.
     */
    const handleSaveDayGoals = async (goals: ActiveGoals, cheat: CheatDayBudget) => {
        const viewingToday = isDateString(logDate) && logDate === todayString();

        // The cheat-day budget is a global setting, not a per-day one, so it is
        // written whichever day is open. The goals stay tied to the day: only
        // today's edit feeds goal_history -- passing a past date to withVersion
        // would drop every version after that date. The two are therefore
        // combined into one settings write, but only the goal half is gated on
        // today.
        const cheatChanged = (settings?.cheat_days_allowed ?? null) !== cheat.allowed
            || (settings?.cheat_days_period ?? 'week') !== cheat.period;

        if (settings && (viewingToday || cheatChanged)) {
            const updated: UserSettings = {
                ...settings,
                cheat_days_allowed: cheat.allowed,
                cheat_days_period: cheat.period,
            };
            if (viewingToday) {
                const history = withVersion(parseGoalHistory(settings.goal_history), logDate, goals);
                updated.active_goals = latestGoals(history, goals) as unknown as Record<string, unknown>;
                updated.goal_history = history;
            }
            const savedSettings = await updateUserSettings(updated);
            /**
             * Put the row that was just written into the cache directly, *and*
             * invalidate. The invalidation alone leaves a window between the write
             * and the refetch landing in which the page is still reading the
             * pre-edit history -- and the debounced autosave runs 600ms after the
             * next field change, well inside that window, writing the stale
             * resolution back into the row. Seeding the cache with the server's
             * own response closes the window without a round trip.
             */
            if (savedSettings) {
                queryClient.setQueryData(queryKeys.userSettings, savedSettings);
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.userSettings });
            if (cheatChanged) {
                // The budget is a global rule, so a change to it can move the
                // free/over-budget line in every window, not just this day's. The
                // open day is left to its autosave, which follows the settings change.
                void recalcCheatDayScores({
                    allowed: cheat.allowed,
                    period: cheat.period,
                    excludeDates: logDate ? [logDate] : [],
                })
                    .then(() => {
                        queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
                    })
                    .catch(error => console.error('Cheat-day recalculation failed:', error));
            }
        }

        if (existingLog?.id) {
            await updateDailyLog(existingLog.id, { goal_snapshot: goals as unknown as Record<string, unknown> });
            setGoalsExplicitlyEdited(true);
            /**
             * Reflect the new snapshot locally instead of waiting for the refetch.
             *
             * The effect that applies a fetched row is guarded on the day it last
             * applied, precisely so an autosave-triggered refetch does not refill
             * the form under the cursor -- which means the refetch that follows
             * this invalidation is *discarded*. So `existingLog.goal_snapshot`
             * stayed at the pre-edit value for the rest of the session, and for a
             * past day the next autosave read its resolution straight back out of
             * that stale snapshot and undid the edit. Patching the object here
             * makes the local copy agree with the database immediately.
             */
            setExistingLog(prev => prev ? { ...prev, goal_snapshot: goals as unknown as Record<string, unknown> } : prev);
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogByDate(logDate) });
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
        }

        // A day with no log row yet has nothing to attach a snapshot to, so the
        // change is written to the history alone (today) and picked up when the
        // page creates the row. For a past day with no row there is nothing to
        // change and nothing to say.
        setShowGoalsEditor(false);
    };

    /**
     * Save whichever habit the one editor is showing.
     *
     * A custom habit is one row in `habits`; a built-in is one entry in
     * `user_settings.habit_settings`. Both arrive here as the same set of fields,
     * which is what makes "edit any habit" one action rather than two.
     */
    const handleHabitEditorSave = async (updates: HabitEditorUpdates) => {
        const target = editingHabit;
        if (!target) return;
        setHabitEditError(null);

        if (target.builtIn && target.builtInKey) {
            if (!settings) return;
            setSavingBuiltinHabit(true);
            try {
                const key = target.builtInKey;
                const next: UserSettings = {
                    ...settings,
                    habit_settings: {
                        ...(settings.habit_settings ?? {}),
                        [key]: {
                            ...(settings.habit_settings?.[key] ?? {}),
                            ...updates,
                        },
                    },
                };
                const saved = await updateUserSettings(next);
                queryClient.setQueryData(queryKeys.userSettings, saved);
                queryClient.invalidateQueries({ queryKey: queryKeys.userSettings });
                setEditingHabit(null);
            } catch (err) {
                console.error('Error editing built-in habit:', err);
                setHabitEditError(
                    err instanceof Error ? err.message : 'Could not save the habit.',
                );
            } finally {
                setSavingBuiltinHabit(false);
            }
            return;
        }

        if (!target.id) return;
        try {
            const updated = await updateHabit.mutateAsync({ id: target.id, updates });
            setHabits(prev =>
                prev.map(habit => (habit.id === target.id ? { ...habit, ...updated } : habit)),
            );
            queryClient.invalidateQueries({ queryKey: queryKeys.habits });
            setEditingHabit(null);
        } catch (err) {
            // The only refusal a custom habit edit can get is a name already
            // taken, and it is worth saying which one -- so the dialog stays open
            // with the typed text still in it.
            console.error('Error editing habit:', err);
            setHabitEditError(
                err instanceof Error ? err.message : 'Could not save the habit.',
            );
        }
    };

    const handleDeleteHabit = async (id: string) => {
        setDeletingHabit(true);
        try {
            await deleteHabit(id);
            setHabits(prev => prev.filter(h => h.id !== id));
            setCompletedHabits(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.habits });
            queryClient.invalidateQueries({ queryKey: queryKeys.habitLogs });
            setDeleteTarget(null);
        } catch (err) {
            console.error('Error deleting habit:', err);
        } finally {
            setDeletingHabit(false);
        }
    };

    // This is the page a signed-in user lands on, and it loads its settings,
    // habits and projects with raw awaits rather than through React Query. That
    // makes all of it invisible to the app-level boot gate, which only knows what
    // the query cache is doing -- so without this the splash lifted on top of the
    // spinner below and the handover played out as two black screens in a row.
    //
    // `settingsLoaded` rather than `settings`: the gate below reads `!settings`,
    // and a user with no settings row legitimately has `settings === null`, which
    // would hold the splash forever. The flag means "asked and answered".
    //
    // `isLoadingData` only in edit-by-id mode. It starts `true` and nothing ever
    // clears it when there is no `id`, so holding on it unconditionally would
    // never release.
    useBootHold(!settingsLoaded || loadingHabits || loadingProjects || (id ? isLoadingData : false));

    if (!settings) {
        return (
            <div className="daily-logs-page-wrapper">
                <div className="dashboard-section daily-logs-section">
                    <div className="daily-logs-card">
                        <LoadingSpinner />
                    </div>
                </div>
            </div>
        );
    }

    if (needsGoalSetup) {
        return null;
    }

    const dateLabel = logDate
        ? new Date(logDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : '';

    const isToday = logDate === today;

    // These lived in the top navbar, then inside the score card. They are above
    // the card and above the Goals button now, which is where a control for the day
    // belongs: the arrows and the calendar act on every day on this page, so they
    // come before anything that only describes the day being shown.
    const dayNav = (
        <div className="daily-log-daynav">
            {/* The breakdown toggle, first because it is the one control here that
                does not act on the day: everything after it picks a day or edits it. */}
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
                onClick={() => setLogDate(addDays(logDate, -1))}
                data-tip="Previous day"
                aria-label="Previous day"
            >
                <ChevronLeft size={15} />
            </button>
            <span className="daily-log-daynav-label" aria-live="polite">
                {formatDayLabel(logDate)}
            </span>
            <label className="daily-log-daynav-btn" data-tip="Pick a day">
                <Calendar size={14} aria-hidden="true" />
                <span className="sr-only">Pick a day</span>
                <input
                    type="date"
                    className="daily-log-daynav-input"
                    value={logDate}
                    max={today}
                    onChange={e => {
                        if (isDateString(e.target.value)) setLogDate(e.target.value);
                    }}
                />
            </label>
            <button
                type="button"
                className="daily-log-daynav-btn"
                onClick={() => setLogDate(addDays(logDate, 1))}
                data-tip="Next day"
                aria-label="Next day"
                disabled={logDate >= today}
            >
                <ChevronRight size={15} />
            </button>
            <button
                type="button"
                className="daily-log-daynav-btn"
                onClick={() => navigate('/Daily-Log/History')}
                data-tip="View History"
                aria-label="View History"
            >
                <History size={14} />
            </button>

            {/* The way back to today. The arrows and the calendar can take you
                anywhere but here without paging forward one day at a time, and
                this is nothing to press on the day you are already on -- so it is
                drawn only once you are off it, which also keeps the row a fixed set
                of five controls.

                A round control like its neighbours rather than a labelled pill. The
                panel is about 277px wide at the breakpoint where the score column
                is narrowest, and five fixed-width controls already leave the date
                label roughly 97px; a pill wide enough to spell "Today" takes that to
                about 35px, which truncates "Mon, Sep 29" every day of the year. The
                check in the icon is what tells it apart from the plain calendar
                beside it, which opens the picker instead. */}
            {!isToday && (
                <button
                    type="button"
                    className="daily-log-daynav-btn"
                    onClick={() => setLogDate(today)}
                    data-tip="Go to today"
                    aria-label="Go to today"
                >
                    <CalendarCheck2 size={14} />
                </button>
            )}

            {/* Per-day goals, as the row's edit control. The goals shown inline in
                the form are read-only, so without this the only way to change them
                is the setup page, which writes a version effective today and cannot
                express "this one day was different".

                Last in the row because it is the odd one out: every control before it
                picks a day, and this one changes the day you are on. The name stays
                on the button for a screen reader even though the row is all icons
                now, so the action is still announced as what it is. */}
            <button
                type="button"
                className="daily-log-daynav-btn"
                onClick={() => setShowGoalsEditor(true)}
                data-tip="Goals for this day"
                aria-label="Goals for this day"
            >
                <Pencil size={14} />
            </button>
        </div>
    );

    const builtinHabitDone = [morningRoutine, eveningRoutine, fruitServing, studied, stretching, reading, journal, projectWorkDone, gym].filter(Boolean).length;
    const habitTotal = BUILTIN_HABIT_COUNT + habits.length;

    const timeInputHandlers = (setter: (v: string) => void) => ({
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length >= 3) {
                val = val.slice(0, 2) + ':' + val.slice(2, 4);
            }
            if (val.length > 5) val = val.slice(0, 5);
            if (/^(\d{2}:)?(\d{0,2})$/.test(val)) {
                const parts = val.split(':');
                if (parts[0] && parseInt(parts[0]) > 23) return;
                if (parts[1] && parseInt(parts[1]) > 59) return;
                setter(val);
            }
        },
        onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
            const val = e.target.value;
            if (val.length === 4 && !val.includes(':')) {
                setter(val.slice(0, 2) + ':' + val.slice(2));
            }
        },
    });

    const formatTimeToken = (token: string): string => {
        const v = token.replace(/\D/g, '');
        if (v.length >= 4) return v.slice(0, 2) + ':' + v.slice(2, 4);
        if (v.length >= 3) return v.slice(0, 2) + ':' + v.slice(2);
        return v;
    };

    // Pasting a row like "2148 108.2 232.6 81.6 350" into the first input of a
    // card fills every later input in that card from the tokens, so a block of
    // numbers can be dropped in and applied in one go instead of being typed one
    // field at a time. Enter / Space moves the caret to the next input of the
    // same card, so navigating a whole row takes one keystroke.
    const advanceToNextInput = (current: HTMLInputElement): boolean => {
        const card = current.closest('.puzzle-card') ?? current.closest('.card');
        if (!card) return false;
        const candidates = Array.from(card.querySelectorAll('input')).filter(
            (el): el is HTMLInputElement => (el as HTMLInputElement).type !== 'checkbox',
        );
        const index = candidates.indexOf(current);
        if (index === -1 || index >= candidates.length - 1) return false;
        candidates[index + 1].focus();
        try { candidates[index + 1].select(); } catch { /* inputs in number mode may not select */ }
        return true;
    };

    const seriesHandlers = (
        setters: Array<(v: string) => void>,
        index: number,
        format?: (token: string) => string,
    ) => ({
        onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => {
            const text = e.clipboardData?.getData('text') ?? '';
            const parts = text.trim().split(/\s+/).filter(Boolean);
            if (parts.length < 2) return; // single value: default paste
            e.preventDefault();
            parts.forEach((part, k) => {
                const target = index + k;
                if (target < setters.length) {
                    setters[target](format ? format(part) : part);
                }
            });
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                // A non-empty space inside a number input is invalid anyway, so
                // turning it into navigation cannot eat a character.
                advanceToNextInput(e.currentTarget);
            }
        },
    });

    // Takes the column and the setter rather than a finished handler, so the write
    // is wired up where the checkbox is drawn and every call site names the habit it
    // writes. Built-ins carry their stable key so the same row can be right-clicked
    // into the one editor, and so touch screens get an explicit way in.
    const habitCheckbox = (
        checked: boolean,
        column: DailyLogHabitColumn,
        setValue: (next: boolean) => void,
        builtinKey: EditableBuiltinHabitKey
    ) => {
        const label = builtinHabitLabel(builtinKey);
        return (
            <div
                className="habit-row"
                onContextMenu={event =>
                    habitMenu.openFromEvent(
                        event,
                        `${label} actions`,
                        builtinHabitMenu(builtinKey),
                    )
                }
            >
                <label className="checkbox-label flex-1 min-w-0">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => saveBuiltinHabit(column, e.target.checked, setValue)}
                        className="checkbox-input"
                    />
                    <span className="text-sm opacity-90 truncate">{label}</span>
                </label>
                <button
                    type="button"
                    className="habit-row-more"
                    data-tip={`Edit ${label}`}
                    aria-label={`Edit ${label}`}
                    onClick={() => openBuiltinHabitEditor(builtinKey)}
                >
                    <MoreVertical size={14} />
                </button>
            </div>
        );
    };

    // Gym is different from the others: the tick writes a workout session, so
    // it is async, it can fail, and marking it opens a real session rather than
    // only setting a flag. Kept separate from habitCheckbox so that difference
    // is visible rather than hidden behind an identical-looking control.
    const gymCheckbox = (() => {
        const label = builtinHabitLabel('gym');
        return (
            <div
                className="habit-row"
                onContextMenu={event =>
                    habitMenu.openFromEvent(
                        event,
                        `${label} actions`,
                        builtinHabitMenu('gym'),
                    )
                }
            >
                <label className="checkbox-label daily-log-habits__gym flex-1 min-w-0">
                    <input
                        type="checkbox"
                        checked={gym}
                        onChange={toggleGym}
                        disabled={setGym.isPending}
                        className="checkbox-input"
                    />
                    <span className="daily-log-habits__gym-label">
                        <span>{label}</span>
                        {gym && (
                            <Link
                                className="daily-log-habits__gym-link"
                                to={`/Workouts?day=${logDate}`}
                                onClick={event => event.stopPropagation()}
                            >
                                View session
                            </Link>
                        )}
                    </span>
                </label>
                <button
                    type="button"
                    className="habit-row-more"
                    data-tip={`Edit ${label}`}
                    aria-label={`Edit ${label}`}
                    onClick={() => openBuiltinHabitEditor('gym')}
                >
                    <MoreVertical size={14} />
                </button>
            </div>
        );
    })();

    return (
        <div className="daily-logs-page-wrapper">
            <div className="dashboard-section daily-logs-section">
                <div className="daily-logs-card">
                    {id && (
                        <div className="flex gap-2 mb-4 flex-wrap daily-logs-edit-row">
                            <button onClick={() => navigate('/Daily-Log')} className="btn-action">Today's Log</button>
                        </div>
                    )}

                    {/* Sticky score panel. On wide screens it is the first of the three
                        columns; below the breakpoint the card grid collapses and it sits
                        above the form again. */}
                    <div className="daily-log-score-col">
                        {/* The controls for this day, in one row above the card: the arrows
                            and the calendar choose which day, and the pencil edits what
                            that day's targets are. The full date they all act on stays
                            on the card, which is what describes the score underneath it. */}
                        {(dayNav || saveError) && (
                            <div className="daily-score-daynav">
                                {saveError && (
                                    <span
                                        className="daily-score-save-error"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        <AlertTriangle size={12} aria-hidden="true" />
                                        {saveError}
                                    </span>
                                )}
                                {dayNav}
                            </div>
                        )}
                        <ScoreCard
                            score={scoreResult.score}
                            dateLabel={dateLabel}
                            metrics={scoreResult.metrics}
                            expanded={breakdownOpen}
                        />
                    </div>

                    <div className="daily-log-form">
                        {/* Column 2. Holds the two-up card grid plus the full-width
                            blood pressure card beneath it. */}
                        <div className="daily-log-main">
                        {/* Two-column grid: sleep | nutrition, then body metrics | mood */}
                        <div className="daily-log-puzzle">
                            <div className="daily-log-col">
                            {/* Sleep */}
                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title">Sleep</h3>
                                    {noSleep ? (
                                        <span className="text-sm opacity-70 ml-2" style={{ color: 'var(--color-danger)' }}>0h</span>
                                    ) : computedSleepDuration != null && (
                                        <span className="text-sm opacity-70 ml-2">{computedSleepDuration}h</span>
                                    )}
                                </div>
                                <div className="card-body">
                                    <label className="checkbox-label mb-3">
                                        <input
                                            type="checkbox"
                                            checked={noSleep}
                                            onChange={(e) => saveBuiltinHabit('no_sleep', e.target.checked, setNoSleep)}
                                            className="checkbox-input"
                                        />
                                        <span className="text-sm opacity-90">Didn't Sleep</span>
                                    </label>
                                    <div className="scored-input-wrap">
                                        <input
                                            type="text"
                                            value={wakeTime || ''}
                                            {...timeInputHandlers(setWakeTime)}
                                            {...seriesHandlers([setWakeTime, setBedtime, setSleepQuality], 0, formatTimeToken)}
                                            disabled={noSleep}
                                            className={"scored-input font-mono" + (wakeTime ? '' : ' scored-input--empty') + (noSleep ? ' scored-input--disabled' : '')}
                                            placeholder=" "
                                            maxLength={5}
                                            style={wakeTime && !noSleep ? { borderColor: getScoreColor(scoreOf('wakeTime')! ?? 0) } : undefined}
                                        />
                                        <label className="scored-input-label">Wake Time<span className="scored-input-goal-inline">{activeGoals?.sleep?.wake_time || '--:--'}</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input
                                            type="text"
                                            value={bedtime || ''}
                                            {...timeInputHandlers(setBedtime)}
                                            {...seriesHandlers([setWakeTime, setBedtime, setSleepQuality], 1, formatTimeToken)}
                                            disabled={noSleep}
                                            className={"scored-input font-mono" + (bedtime ? '' : ' scored-input--empty') + (noSleep ? ' scored-input--disabled' : '')}
                                            placeholder=" "
                                            maxLength={5}
                                            style={bedtime && !noSleep ? { borderColor: getScoreColor(scoreOf('bedtime')! ?? 0) } : undefined}
                                        />
                                        <label className="scored-input-label">Bedtime<span className="scored-input-goal-inline">{activeGoals?.sleep?.bedtime || '--:--'}</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input
                                            type="number"
                                            min="0"
                                            max="10"
                                            step="1"
                                            value={sleepQuality}
                                            disabled={noSleep}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!isNaN(val) && val >= 0 && val <= 10) setSleepQuality(e.target.value);
                                                else if (e.target.value === '') setSleepQuality('');
                                            }}
                                            {...seriesHandlers([setWakeTime, setBedtime, setSleepQuality], 2)}
                                            className={"scored-input" + (sleepQuality ? '' : ' scored-input--empty') + (noSleep ? ' scored-input--disabled' : '')}
                                            placeholder=" "
                                            style={sleepQuality && !noSleep ? { borderColor: getScoreColor(scoreOf('sleepQuality')! ?? 0) } : undefined}
                                        />
                                        <label className="scored-input-label">Sleep Quality (0-10)</label>
                                    </div>
                                </div>
                            </div>

                            {/* Mood is rated on the journal page; show it here now that
                                body metrics have moved to the Measurements page. */}
                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title">Mood</h3>
                                    {dayMeanMood !== null && (
                                        <span className="text-sm opacity-70 ml-2">avg {Math.round(dayMeanMood * 10) / 10}/10</span>
                                    )}
                                </div>
                                <div className="card-body">
                                    <MoodReadout log={existingLog} linkTo={`/Journal?date=${logDate}`} />
                                </div>
                            </div>
                            </div>

                            <div className="daily-log-col">
                            {/* Nutrition */}
                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title">Nutrition</h3>
                                </div>
                                <div className="card-body">
                                    <label className="checkbox-label mb-3">
                                        <input
                                            type="checkbox"
                                            checked={cheatDay}
                                            onChange={(e) => saveBuiltinHabit('cheat_day', e.target.checked, setCheatDay)}
                                            className="checkbox-input"
                                        />
                                        <span className="text-sm opacity-90">Cheat Day</span>
                                        <span
                                            className="text-sm opacity-60"
                                            data-tip={cheatStatus.allowed === null
                                                ? "Cheat day: calories scored against your maintenance target. At or below maintenance = 100, above your ceiling = 0, graded between. Calories not entered = 0. Protein and water score normally."
                                                : cheatOverBudget
                                                    ? `Over your cheat-day allowance (${cheatStatus.allowed} per ${cheatPeriodLabel}). Calories score normally today.`
                                                    : `Within your cheat-day allowance. Up to ${cheatStatus.allowed} per ${cheatPeriodLabel}; calories scored against your maintenance target. Protein and water score normally.`}
                                        >
                                            {cheatStatus.allowed === null
                                                ? '(maintenance rule)'
                                                : `(${cheatStatus.used}/${cheatStatus.allowed} this ${cheatPeriodLabel})`}
                                        </span>
                                    </label>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={calories}
                                            {...seriesHandlers([setCalories, setProtein, setCarbs, setFat, setWater], 0)}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!isNaN(val) && val >= 0) { setCalories(e.target.value); } else if (e.target.value === '') { setCalories(''); }
                                                // else if (e.target.value === '') setCalories('');<rfl:parameter name="
                                        }} className={"scored-input" + (calories ? '' : ' scored-input--empty')} placeholder=" " style={calories ? { borderColor: getScoreColor(scoreOf('calories')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Calories <span className="scored-input-goal-inline">{nutritionGoals?.calories || 2000}</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={protein}
                                            {...seriesHandlers([setCalories, setProtein, setCarbs, setFat, setWater], 1)}
                                            onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setProtein(e.target.value);
                                            else if (e.target.value === '') setProtein('');
                                        }} className={"scored-input" + (protein ? '' : ' scored-input--empty')} placeholder=" " style={protein ? { borderColor: getScoreColor(scoreOf('protein')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Protein <span className="scored-input-goal-inline">{nutritionGoals?.protein || 150}g</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={carbs}
                                            {...seriesHandlers([setCalories, setProtein, setCarbs, setFat, setWater], 2)}
                                            onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setCarbs(e.target.value);
                                            else if (e.target.value === '') setCarbs('');
                                        }} className={"scored-input" + (carbs ? '' : ' scored-input--empty')} placeholder=" " style={carbs ? { borderColor: getScoreColor(scoreOf('carbs')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Carbs <span className="scored-input-goal-inline">{nutritionGoals?.carbs || 200}g</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={fat}
                                            {...seriesHandlers([setCalories, setProtein, setCarbs, setFat, setWater], 3)}
                                            onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setFat(e.target.value);
                                            else if (e.target.value === '') setFat('');
                                        }} className={"scored-input" + (fat ? '' : ' scored-input--empty')} placeholder=" " style={fat ? { borderColor: getScoreColor(scoreOf('fat')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Fat <span className="scored-input-goal-inline">{nutritionGoals?.fat || 65}g</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={water}
                                            {...seriesHandlers([setCalories, setProtein, setCarbs, setFat, setWater], 4)}
                                            onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setWater(e.target.value);
                                            else if (e.target.value === '') setWater('');
                                        }} className={"scored-input" + (water ? '' : ' scored-input--empty')} placeholder=" " style={water ? { borderColor: getScoreColor(scoreOf('water')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Water <span className="scored-input-goal-inline">{nutritionGoals?.water || 2500}ml</span></label>
                                    </div>
                                </div>
                            </div>



                            </div>
                        </div>

                        {/* Blood Pressure & Heart Rate spans the full width of this
                            column only - it does not extend into the habits column. */}
                        <div className="daily-log-wide">
                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title">Blood Pressure & Heart Rate</h3>
                                </div>
                                <div className="card-body">
                                    <div className="grid grid-cols-2">
                                        <div className="flex flex-col">
                                            <div className="scored-input-wrap">
                                                <input type="number" value={morningSystolic}
                                                {...seriesHandlers([setMorningSystolic, setMorningDiastolic, setMorningBpm], 0)}
                                                onChange={(e) => setMorningSystolic(e.target.value)} className={"scored-input" + (morningSystolic ? '' : ' scored-input--empty')} placeholder=" " style={morningSystolic ? { borderColor: getScoreColor(scoreOf('morningSystolic')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Morning Systolic <span className="scored-input-goal-inline">120</span></label>
                                            </div>
                                            <div className="scored-input-wrap">
                                                <input type="number" value={morningDiastolic}
                                                {...seriesHandlers([setMorningSystolic, setMorningDiastolic, setMorningBpm], 1)}
                                                onChange={(e) => setMorningDiastolic(e.target.value)} className={"scored-input" + (morningDiastolic ? '' : ' scored-input--empty')} placeholder=" " style={morningDiastolic ? { borderColor: getScoreColor(scoreOf('morningDiastolic')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Morning Diastolic <span className="scored-input-goal-inline">80</span></label>
                                            </div>
                                            <div className="scored-input-wrap">
                                                <input type="number" value={morningBpm}
                                                {...seriesHandlers([setMorningSystolic, setMorningDiastolic, setMorningBpm], 2)}
                                                onChange={(e) => setMorningBpm(e.target.value)} className={"scored-input" + (morningBpm ? '' : ' scored-input--empty')} placeholder=" " style={morningBpm ? { borderColor: getScoreColor(scoreOf('morningBpm')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Morning BPM <span className="scored-input-goal-inline">60-100</span></label>
                                            </div>
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="scored-input-wrap">
                                                <input type="number" value={eveningSystolic}
                                                {...seriesHandlers([setEveningSystolic, setEveningDiastolic, setEveningBpm], 0)}
                                                onChange={(e) => setEveningSystolic(e.target.value)} className={"scored-input" + (eveningSystolic ? '' : ' scored-input--empty')} placeholder=" " style={eveningSystolic ? { borderColor: getScoreColor(scoreOf('eveningSystolic')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Evening Systolic <span className="scored-input-goal-inline">120</span></label>
                                            </div>
                                            <div className="scored-input-wrap">
                                                <input type="number" value={eveningDiastolic}
                                                {...seriesHandlers([setEveningSystolic, setEveningDiastolic, setEveningBpm], 1)}
                                                onChange={(e) => setEveningDiastolic(e.target.value)} className={"scored-input" + (eveningDiastolic ? '' : ' scored-input--empty')} placeholder=" " style={eveningDiastolic ? { borderColor: getScoreColor(scoreOf('eveningDiastolic')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Evening Diastolic <span className="scored-input-goal-inline">80</span></label>
                                            </div>
                                            <div className="scored-input-wrap">
                                                <input type="number" value={eveningBpm}
                                                {...seriesHandlers([setEveningSystolic, setEveningDiastolic, setEveningBpm], 2)}
                                                onChange={(e) => setEveningBpm(e.target.value)} className={"scored-input" + (eveningBpm ? '' : ' scored-input--empty')} placeholder=" " style={eveningBpm ? { borderColor: getScoreColor(scoreOf('eveningBpm')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Evening BPM <span className="scored-input-goal-inline">60-100</span></label>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={bodyTemperature}
                                            {...seriesHandlers([setBodyTemperature], 0)}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (!isNaN(val) && val >= 0) setBodyTemperature(e.target.value);
                                                else if (e.target.value === '') setBodyTemperature('');
                                            }}
                                            className={"scored-input" + (bodyTemperature ? '' : ' scored-input--empty')}
                                            placeholder=" "
                                            style={bodyTemperature ? { borderColor: getScoreColor(scoreOf('bodyTemperature')! ?? 0) } : undefined}
                                        />
                                        <label className="scored-input-label">Body Temperature (°C) <span className="scored-input-goal-inline">36.5</span></label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                        {/* Habits occupies its own right-hand column, outside column 2. */}
                        <div className="daily-log-habits">
                            <div className="card puzzle-card">
                                <div className="card-header" style={{ justifyContent: 'space-between', width: '100%' }}>
                                    <h3 className="card-title">Habits</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs opacity-60 flex items-center gap-2" aria-live="polite">
                                            {habitSaveState === 'saving' && <span>Saving…</span>}
                                            {habitSaveState === 'saved' && <span>Saved</span>}
                                            <span>{builtinHabitDone + completedHabits.size}/{habitTotal}</span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setShowHabitCreateModal(true)}
                                            className="book-action-btn"
                                            aria-label="Add custom habit"
                                            data-tip="Add a custom habit"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="card-body">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1">
                                            {habitCheckbox(fruitServing, 'fruit_serving', setFruitServing, 'fruitServing')}
                                            {habitCheckbox(studied, 'studied', setStudied, 'studied')}
                                            {habitCheckbox(journal, 'journal', setJournal, 'journal')}
                                            {habitCheckbox(stretching, 'stretching', setStretching, 'stretching')}
                                            {habitCheckbox(reading, 'reading', setReading, 'reading')}
                                            {gymCheckbox}
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            {habitCheckbox(projectWorkDone, 'project_work_done', setProjectWorkDone, 'projectWorkDone')}

                                            {projectWorkDone && (
                                                <div className="border-t border-[rgba(255,255,255,0.1)] pt-2 mt-1">
                                                    <p className="text-xs opacity-50 mb-2">Projects Worked On:</p>
                                                    <div className="projects-checkbox-list">
                                                        {loadingProjects ? (
                                                            <p className="text-xs opacity-50">Loading projects...</p>
                                                        ) : selectableProjects.length > 0 ? (
                                                            selectableProjects.map(project => (
                                                                <label key={project.id} className="checkbox-label">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedProjectIds.has(project.id!)}
                                                                        onChange={() => handleProjectToggle(project.id!)}
                                                                        className="checkbox-input"
                                                                    />
                                                                    <span className="text-sm opacity-90 truncate min-w-0 flex-1">{project.title}</span>
                                                                    {/* Only the force-included strays get a tag; active
                                                                        and maintenance are already ordered above. Uppercase
                                                                        to read as a tag, matching the project section
                                                                        headers. */}
                                                                    {project.status !== 'active' && project.status !== 'maintenance' && (
                                                                        <span className="text-xs uppercase opacity-40 shrink-0">{project.status}</span>
                                                                    )}
                                                                </label>
                                                            ))
                                                        ) : (
                                                            <p className="text-xs opacity-50">No active or maintenance projects</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {loadingHabits ? (
                                        <p className="Custom-habit-text text-xs opacity-60 mt-3">Loading custom habits...</p>
                                    ) : habits.length > 0 && (
                                        <div>
                                            <p className="Custom-habit-text text-xs opacity-50 mb-1">Custom Habits:</p>
                                            <div className="grid gap-1">
                                                {habits.map((habit) => (
                                                    <div
                                                        key={habit.id}
                                                        className="habit-row"
                                                        onContextMenu={event =>
                                                            habitMenu.openFromEvent(
                                                                event,
                                                                `${habit.name} actions`,
                                                                [editMenuItem(habit)],
                                                            )
                                                        }
                                                        onDoubleClick={() => openHabitEditor(habit)}
                                                    >
                                                        <label className="checkbox-label flex-1 min-w-0">
                                                            <input
                                                                type="checkbox"
                                                                checked={completedHabits.has(habit.id!)}
                                                                onChange={async () => {
                                                                    const id = habit.id!;
                                                                    const wasChecked = completedHabits.has(id);
                                                                    setCompletedHabits(prev => {
                                                                        const next = new Set(prev);
                                                                        if (wasChecked) next.delete(id);
                                                                        else next.add(id);
                                                                        return next;
                                                                    });
                                                                    try {
                                                                        await toggleHabitForDate(id, logDate);
                                                                        queryClient.invalidateQueries({ queryKey: queryKeys.completedHabits(logDate) });
                                                                        queryClient.invalidateQueries({ queryKey: queryKeys.habitLogs });
                                                                    } catch (err) {
                                                                        console.error('Error toggling habit:', err);
                                                                        setCompletedHabits(prev => {
                                                                            const next = new Set(prev);
                                                                            if (wasChecked) next.add(id);
                                                                            else next.delete(id);
                                                                            return next;
                                                                        });
                                                                    }
                                                                }}
                                                                className="checkbox-input"
                                                            />
                                                            <span className="text-sm opacity-90 truncate">{habit.name}</span>
                                                        </label>
                                                        {/* The way in where there is no right click. Hidden
                                                            wherever hovering works, because the menu already
                                                            offers the one action this row has. */}
                                                        <button
                                                            type="button"
                                                            className="habit-row-more"
                                                            data-tip={`Edit ${habit.name}`}
                                                            aria-label={`Edit ${habit.name}`}
                                                            onClick={() => openHabitEditor(habit)}
                                                        >
                                                            <PenLine size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                        <p className="text-xs opacity-50">Right-click any habit to edit it.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showHabitCreateModal && (
                <div className="import-modal-overlay" onClick={() => { if (!addingHabit) setShowHabitCreateModal(false); }}>
                    <div className="import-modal-card edit-modal-card" role="dialog" aria-modal="true" aria-label="Add custom habit" onClick={event => event.stopPropagation()}>
                        <h3>Add custom habit</h3>
                        <form onSubmit={event => { event.preventDefault(); void handleAddCustomHabit(); }}>
                            <div className="mb-4">
                                <label className="form-label" htmlFor="new-habit-name">Name</label>
                                <input
                                    id="new-habit-name"
                                    type="text"
                                    value={customHabitName}
                                    onChange={event => setCustomHabitName(event.target.value)}
                                    className="form-control"
                                    placeholder="Habit name"
                                    maxLength={50}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="mb-4">
                                <label className="form-label" htmlFor="new-habit-description">
                                    Description <span className="form-label__optional">optional</span>
                                </label>
                                <textarea
                                    id="new-habit-description"
                                    value={customHabitDesc}
                                    onChange={event => setCustomHabitDesc(event.target.value)}
                                    className="form-control"
                                    rows={2}
                                    maxLength={100}
                                    placeholder="What this habit is, or when"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Priority</label>
                                <select
                                    value={customHabitPriority}
                                    onChange={e => setCustomHabitPriority(e.target.value as 'high' | 'medium' | 'low')}
                                    className="form-control"
                                >
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                            <div className="mb-4">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={customHabitNegative} onChange={e => setCustomHabitNegative(e.target.checked)} className="checkbox-input" />
                                    <span className="text-sm">Negative habit (avoid it)</span>
                                </label>
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Schedule days</label>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                                        <label key={d} className="checkbox-label" style={{ fontSize: '0.75rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={customHabitSchedule.includes(i)}
                                                onChange={e => {
                                                    setCustomHabitSchedule(prev =>
                                                        e.target.checked ? [...prev, i] : prev.filter(x => x !== i)
                                                    );
                                                }}
                                                className="checkbox-input"
                                            />
                                            {d}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" className="btn-form-cancel" onClick={() => { setCustomHabitName(''); setCustomHabitDesc(''); setCustomHabitPriority('medium'); setCustomHabitNegative(false); setCustomHabitSchedule([0,1,2,3,4,5,6]); setShowHabitCreateModal(false); }} disabled={addingHabit}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-form-submit" disabled={addingHabit || !customHabitName.trim()}>
                                    {addingHabit ? 'Adding...' : 'Add'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <DayGoalsEditor
                open={showGoalsEditor}
                goals={activeGoals}
                dateLabel={dateLabel}
                cheatAllowed={settings?.cheat_days_allowed ?? null}
                cheatPeriod={settings?.cheat_days_period ?? 'week'}
                onClose={() => setShowGoalsEditor(false)}
                onSave={handleSaveDayGoals}
            />

            {/* One menu for every row on the page, opened by whichever row was
                right clicked. Held here rather than per row so a second right click
                replaces the first instead of stacking two of them. */}
            {habitMenu.state && (
                <ContextMenu {...habitMenu.state} onClose={habitMenu.close} />
            )}

            {/* Unmounted on close, so a cancelled edit leaves nothing behind for the
                next one to open into. */}
            {editingHabit && (
                <HabitEditorModal
                    key={editingHabit.builtInKey ?? editingHabit.id ?? 'habit'}
                    habit={editingHabit}
                    busy={savingBuiltinHabit || updateHabit.isPending}
                    error={habitEditError}
                    onClose={() => {
                        if (savingBuiltinHabit || updateHabit.isPending) return;
                        setEditingHabit(null);
                    }}
                    onSave={handleHabitEditorSave}
                    onDelete={
                        !editingHabit.builtIn && editingHabit.id
                            ? () => {
                                  setDeleteTarget({
                                      id: editingHabit.id!,
                                      name: editingHabit.name,
                                  });
                                  setEditingHabit(null);
                              }
                            : undefined
                    }
                />
            )}

            <ConfirmModal
                open={!!deleteTarget}
                title={deleteTarget ? `Remove "${deleteTarget.name}"?` : ''}
                confirmLabel="Remove"
                danger
                busy={deletingHabit}
                onConfirm={() => { if (deleteTarget?.id) handleDeleteHabit(deleteTarget.id); }}
                onCancel={() => { if (!deletingHabit) setDeleteTarget(null); }}
            />
        </div>
    );
};

export default DailyLogPage;
