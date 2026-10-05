import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { AlertTriangle, Calendar, CalendarCheck2, ChevronLeft, ChevronRight, History, Pencil } from 'lucide-react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { createDailyLog, updateDailyLog, getDailyLogByDate, getDailyLogById, saveDailyLogProjects, getDailyLogProjects } from '../services/dailyLogService';
import { getUserSettings, updateUserSettings } from '../services/profileService';
import { getUserHabits, toggleHabitForDate, createHabit, deleteHabit, getCompletedHabitsForDate } from '../services/habitService';
import { getUserProjects } from '../services/projectService';
import type { DailyLog } from '../services/dailyLogService';
import type { UserSettings } from '../services/profileService';
import type { Habit } from '../services/habitService';
import type { Project } from '../services/projectService';
import { computeDailyScore, calculateSleepDuration, BUILTIN_HABIT_COUNT } from '../utils/dailyScoring';
import type { ActiveGoals } from '../utils/dailyScoring';
import { parseGoalHistory, resolveGoalsForDay, withVersion, latestGoals } from '../utils/goalHistory';
import { useLatestMeasurement, useBodyMeasurementByDate, useLogBodyComposition } from '../hooks/useMeasurements';
import { useSetGymForDate } from '../hooks/useWorkouts';
import { queryKeys } from '../utils/queryKeys';
import ScoreCard from '../Components/DailyLog/ScoreCard';
import DayGoalsEditor from '../Components/DailyLog/DayGoalsEditor';
import ConfirmModal from '../Components/ConfirmModal';
import { hasJournalContent } from '../utils/journalHabit';
import { addDays, formatDayLabel, isDateString, todayString } from '../utils/dates';
import LoadingSpinner from '../Components/LoadingSpinner';
import { useBootHold } from '../services/bootScreen';

const getScoreColor = (score: number): string => {
    if (score >= 80) return 'var(--color-primary)';
    if (score >= 60) return '#a8e600';
    if (score >= 30) return '#ffa500';
    return 'var(--color-danger)';
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
    const [isEditing, setIsEditing] = useState(false);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [habits, setHabits] = useState<Habit[]>([]);
    const [completedHabits, setCompletedHabits] = useState<Set<string>>(new Set());
    const [loadingHabits, setLoadingHabits] = useState(true);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // The day being edited lives in the URL (?date=YYYY-MM-DD) so a refresh, a
    // shared link, and the browser's back/forward buttons all keep you on it.
    // In edit-by-id mode the loaded log owns the date instead and we never
    // write the param. An absent or malformed ?date= falls back to today.
    const dateParam = searchParams.get('date');
    const logDate = id
        ? (existingLog?.log_date ?? '')
        : (isDateString(dateParam) ? dateParam : todayString());

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
    const [mood, setMood] = useState('');
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

    // Gym is a built-in habit, but it is written by the workout pages rather
    // than by this form: ticking it here and marking the same day on /Workouts
    // are the same call, so the habit charts, the score ring and the workout
    // heatmap can never report a different answer for one date.
    const setGym = useSetGymForDate();
    const [gym, setGymLocal] = useState(false);

    // Weight and body fat live in body_measurements, not in the daily log -- one
    // record per date, written from here or from the Measurements page. These two
    // boxes are the second door onto it, not a second copy of it.
    //
    // Prefilled from that day's measurement and saved back to it, so they show
    // what is already on record for the date rather than starting blank.
    const { data: dayMeasurement } = useBodyMeasurementByDate(logDate, !!logDate);
    const logComposition = useLogBodyComposition();
    const [weight, setWeight] = useState('');
    const [bodyFat, setBodyFat] = useState('');
    const [weightTouched, setWeightTouched] = useState(false);
    const [bodyFatTouched, setBodyFatTouched] = useState(false);

    /**
     * What the boxes show, and what the score reads.
     *
     * A box shows what is already on record for the date until it is touched,
     * then it shows what was typed -- including nothing. That is the part that
     * makes a reading removable: with the stored figure always winning, emptying
     * the box would put the old number straight back and there would be no way
     * to clear a mistyped weight from here.
     *
     * Derived rather than copied into state on load, because an effect writing
     * state on every arrival of the day's row would overwrite a fresh keystroke.
     */
    const parsed = (typed: string): number | null => {
        const value = parseFloat(typed);
        return Number.isNaN(value) ? null : value;
    };
    const measuredWeight = !weightTouched && weight === ''
        ? dayMeasurement?.weight ?? null
        : parsed(weight);
    const measuredBodyFat = !bodyFatTouched && bodyFat === ''
        ? dayMeasurement?.body_fat ?? null
        : parsed(bodyFat);
    const weightValue = weightTouched ? weight : measuredWeight != null ? String(measuredWeight) : '';
    const bodyFatValue = bodyFatTouched ? bodyFat : measuredBodyFat != null ? String(measuredBodyFat) : '';

    /**
     * Writes to that day's measurement.
     *
     * Only the field that changed is sent, as `undefined` or `null`: an untouched
     * field is left out entirely so the circumferences recorded for the same date
     * survive, and an emptied one is sent as null so it actually clears. These are
     * the same rules every other optional field in this form follows.
     */
    const saveComposition = useCallback((fields: {
        weight?: number | null;
        body_fat?: number | null;
        body_fat_method?: 'manual' | null;
    }) => {
        if (!logDate) return;
        logComposition.mutate({ measure_date: logDate, ...fields });
    }, [logDate, logComposition]);

    const onWeightBlur = useCallback(() => {
        if (!weightTouched) return;
        saveComposition({ weight: measuredWeight });
    }, [weightTouched, measuredWeight, saveComposition]);

    const onBodyFatBlur = useCallback(() => {
        if (!bodyFatTouched) return;
        saveComposition({
            body_fat: measuredBodyFat,
            // `manual` because it was typed here; the Measurements page derives its
            // own from the tape fields instead, and leaves the method null.
            body_fat_method: measuredBodyFat === null ? null : 'manual',
        });
    }, [bodyFatTouched, measuredBodyFat, saveComposition]);

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

    const [showCustomHabit, setShowCustomHabit] = useState(false);
    const [customHabitName, setCustomHabitName] = useState('');
    const [customHabitDesc, setCustomHabitDesc] = useState('');
    const [addingHabit, setAddingHabit] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Habit | null>(null);
    const [deletingHabit, setDeletingHabit] = useState(false);

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
        setMood(log.mood?.toString() || '');
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
        setMood('');
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

    // Load user settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const userSettings = await getUserSettings();
                setSettings(userSettings);
            } finally {
                // In a `finally` because this flag is what the page gates its
                // render on, and it is what the boot splash waits for. A rejected
                // request must still count as "asked and answered": leaving it
                // false strands the page on its spinner forever, and strands
                // anything waiting on the page behind the splash too.
                setSettingsLoaded(true);
            }
        };
        loadSettings();
    }, []);

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
        setCompletedHabits(completedHabitSet);
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
                today: todayString(),
            }),
        [existingLog, settings, logDate],
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
        weight: measuredWeight,
        bodyFat: measuredBodyFat,
        mood,
        habits: { morningRoutine, eveningRoutine, fruitServing, studied, stretching, reading, journal, projectWorkDone, gym },
        customCompleted: completedHabits.size,
        customTotal: habits.length,
        activeGoals,
        settings: effectiveSettings,
        noSleep,
        lastMeasurementDate,
    }), [wakeTime, bedtime, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, measuredWeight, measuredBodyFat, mood, morningRoutine, eveningRoutine, fruitServing, studied, stretching, reading, journal, projectWorkDone, gym, completedHabits, habits, activeGoals, effectiveSettings, noSleep, lastMeasurementDate]);

    const calculatedScore = scoreResult.score;
    const scoreOf = (key: string): number | null => {
        const m = scoreResult.metrics[key];
        return m && m.logged ? m.score : null;
    };

    // Check for existing log by date (non-edit mode). Cached per date via React
    // Query so navigating between previously-viewed days is instant; each date
    // refreshes in the background while the previous data is shown.
    const { data: dayLog, isPlaceholderData: dayLogPlaceholder } = useQuery({
        queryKey: queryKeys.dailyLogByDate(logDate || 'no-date'),
        queryFn: () => getDailyLogByDate(logDate),
        enabled: !!logDate && !id,
        placeholderData: keepPreviousData,
    });
    const lastAppliedLogDateRef = useRef<string | null>(null);
    useEffect(() => {
        if (id) return;
        if (dayLogPlaceholder || dayLog === undefined) return;
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
    }, [dayLog, dayLogPlaceholder, logDate, id]);

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
                water || mood || journalEntry ||
                noSleep || projectWorkDone || morningRoutine || eveningRoutine ||
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
                mood: mood ? Math.round(parseFloat(mood)) : null,
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
    }, [settings, activeGoals, logDate, goalsExplicitlyEdited, wakeTime, bedtime, computedSleepDuration, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, mood, journalEntry, selectedProjectIds, projectWorkDone, noSleep, calculatedScore, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, isEditing, existingLog, queryClient]);

    useEffect(() => {
        if (saveError) {
            const timer = setTimeout(() => setSaveError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [saveError]);

    // Debounced auto-save on any state change
    useEffect(() => {
        // Block auto-saving until the current log has finished loading
        // (edit mode uses isLoadingData, non-edit mode derives from the query).
        if (!settings || (id ? isLoadingData : dayLogLoading)) return;

        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = setTimeout(() => {
            performSave();
        }, 2000);

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [wakeTime, bedtime, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, mood, journalEntry, selectedProjectIds, projectWorkDone, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, customHabitName, customHabitDesc, performSave, settings, isLoadingData, dayLogLoading, id]);

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
            });
            const userHabits = await getUserHabits();
            setHabits(userHabits);
            queryClient.invalidateQueries({ queryKey: queryKeys.habits });
            closeCustomHabitForm();
        } catch (err) {
            console.error('Error creating habit:', err);
        } finally {
            setAddingHabit(false);
        }
    };

    // Reset custom-habit form fields
    const closeCustomHabitForm = () => {
        setCustomHabitName('');
        setCustomHabitDesc('');
        setShowCustomHabit(false);
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
    const handleSaveDayGoals = async (goals: ActiveGoals) => {
        const viewingToday = isDateString(logDate) && logDate === todayString();

        if (viewingToday && settings) {
            const history = withVersion(parseGoalHistory(settings.goal_history), logDate, goals);
            await updateUserSettings({
                ...settings,
                active_goals: latestGoals(history, goals) as unknown as Record<string, unknown>,
                goal_history: history,
            });
            queryClient.invalidateQueries({ queryKey: queryKeys.userSettings });
        }

        if (existingLog?.id) {
            await updateDailyLog(existingLog.id, { goal_snapshot: goals as unknown as Record<string, unknown> });
            setGoalsExplicitlyEdited(true);
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogByDate(logDate) });
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
        }

        // A day with no log row yet has nothing to attach a snapshot to, so the
        // change is written to the history alone (today) and picked up when the
        // page creates the row. For a past day with no row there is nothing to
        // change and nothing to say.
        setShowGoalsEditor(false);
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

    if (settingsLoaded && !settings?.active_goals) {
        navigate('/Daily-Log/Setup');
        return null;
    }

    const dateLabel = logDate
        ? new Date(logDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : '';

    const today = todayString();
    const isToday = logDate === today;

    // These lived in the top navbar, then inside the score card. They are above
    // the card and above the Goals button now, which is where a control for the day
    // belongs: the arrows and the calendar act on every day on this page, so they
    // come before anything that only describes the day being shown.
    const dayNav = (
        <div className="daily-log-daynav">
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

    const habitCheckbox = (
        checked: boolean,
        onChange: (checked: boolean) => void,
        label: string
    ) => (
        <label className="checkbox-label">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="checkbox-input" />
            <span className="text-sm opacity-90">{label}</span>
        </label>
    );

    // Gym is different from the others: the tick writes a workout session, so
    // it is async, it can fail, and marking it opens a real session rather than
    // only setting a flag. Kept separate from habitCheckbox so that difference
    // is visible rather than hidden behind an identical-looking control.
    const gymCheckbox = (
        <label className="checkbox-label daily-log-habits__gym">
            <input
                type="checkbox"
                checked={gym}
                onChange={toggleGym}
                disabled={setGym.isPending}
                className="checkbox-input"
            />
            <span className="daily-log-habits__gym-label">
                <span>Gym</span>
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
    );

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
                                            onChange={(e) => setNoSleep(e.target.checked)}
                                            className="checkbox-input"
                                        />
                                        <span className="text-sm opacity-90">Didn't Sleep</span>
                                    </label>
                                    <div className="scored-input-wrap">
                                        <input
                                            type="text"
                                            value={wakeTime || ''}
                                            {...timeInputHandlers(setWakeTime)}
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
                                            className={"scored-input" + (sleepQuality ? '' : ' scored-input--empty') + (noSleep ? ' scored-input--disabled' : '')}
                                            placeholder=" "
                                            style={sleepQuality && !noSleep ? { borderColor: getScoreColor(scoreOf('sleepQuality')! ?? 0) } : undefined}
                                        />
                                        <label className="scored-input-label">Sleep Quality (0-10)</label>
                                    </div>
                                </div>
                            </div>

                            {/* Left column of the second row: body metrics stacked
                                one field per row. */}
                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title">Body Metrics</h3>
                                </div>
                                <div className="card-body">
                                    <div className="scored-input-wrap">
                                        <input type="number" step="0.1" value={weightValue} onChange={(e) => {
                                            setWeightTouched(true);
                                            setWeight(e.target.value);
                                        }} onBlur={onWeightBlur} className={"scored-input" + (weightValue ? '' : ' scored-input--empty')} placeholder=" " style={weightValue ? { borderColor: getScoreColor(scoreOf('weight')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Weight (kg) <span className="scored-input-goal-inline">{settings?.target_weight || '--'}kg</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" step="0.1" value={bodyFatValue} onChange={(e) => {
                                            setBodyFatTouched(true);
                                            setBodyFat(e.target.value);
                                        }} onBlur={onBodyFatBlur} className={"scored-input" + (bodyFatValue ? '' : ' scored-input--empty')} placeholder=" " style={bodyFatValue ? { borderColor: getScoreColor(scoreOf('bodyFat')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Body Fat (%) <span className="scored-input-goal-inline">{settings?.target_bodyfat || '--'}%</span></label>
                                    </div>
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
                                    <div className="scored-input-wrap">
                                        <input type="number" value={calories} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setCalories(e.target.value);
                                            else if (e.target.value === '') setCalories('');
                                        }} className={"scored-input" + (calories ? '' : ' scored-input--empty')} placeholder=" " style={calories ? { borderColor: getScoreColor(scoreOf('calories')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Calories <span className="scored-input-goal-inline">{nutritionGoals?.calories || 2000}</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={protein} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setProtein(e.target.value);
                                            else if (e.target.value === '') setProtein('');
                                        }} className={"scored-input" + (protein ? '' : ' scored-input--empty')} placeholder=" " style={protein ? { borderColor: getScoreColor(scoreOf('protein')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Protein <span className="scored-input-goal-inline">{nutritionGoals?.protein || 150}g</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={carbs} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setCarbs(e.target.value);
                                            else if (e.target.value === '') setCarbs('');
                                        }} className={"scored-input" + (carbs ? '' : ' scored-input--empty')} placeholder=" " style={carbs ? { borderColor: getScoreColor(scoreOf('carbs')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Carbs <span className="scored-input-goal-inline">{nutritionGoals?.carbs || 200}g</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={fat} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setFat(e.target.value);
                                            else if (e.target.value === '') setFat('');
                                        }} className={"scored-input" + (fat ? '' : ' scored-input--empty')} placeholder=" " style={fat ? { borderColor: getScoreColor(scoreOf('fat')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Fat <span className="scored-input-goal-inline">{nutritionGoals?.fat || 65}g</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={water} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setWater(e.target.value);
                                            else if (e.target.value === '') setWater('');
                                        }} className={"scored-input" + (water ? '' : ' scored-input--empty')} placeholder=" " style={water ? { borderColor: getScoreColor(scoreOf('water')! ?? 0) } : undefined} />
                                        <label className="scored-input-label">Water <span className="scored-input-goal-inline">{nutritionGoals?.water || 2500}ml</span></label>
                                    </div>
                                </div>
                            </div>


                                {/* Mood - a subjective daily rating, so it gets its own card
                                    and a 1-10 scale instead of a text box. */}
                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title">Mood</h3>
                                    {mood && (
                                        <span className="text-sm opacity-70 ml-2">{mood}/10</span>
                                    )}
                                </div>
                                <div className="card-body">
                                    <div className="mood-scale" role="group" aria-label="Mood from 1 to 10">
                                        {Array.from({ length: 10 }, (_, i) => i + 1).map(step => {
                                            const active = Boolean(mood) && Number(mood) >= step;
                                            return (
                                                <button
                                                    key={step}
                                                    type="button"
                                                    className={'mood-scale-btn' + (active ? ' mood-scale-btn--active' : '')}
                                                    style={active ? { background: getScoreColor(scoreOf('mood')! ?? 0), borderColor: getScoreColor(scoreOf('mood')! ?? 0) } : undefined}
                                                    onClick={() => setMood(String(step))}
                                                    data-tip={`Step ${step} of 10`}
                                                    aria-label={`Mood ${step} out of 10`}
                                                    aria-pressed={active}
                                                >
                                                    {step}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <span className="mood-scale-caption">
                                        <span>1 - rough</span>
                                        <span>goal 8+</span>
                                        <span>10 - great</span>
                                    </span>
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
                                                <input type="number" value={morningSystolic} onChange={(e) => setMorningSystolic(e.target.value)} className={"scored-input" + (morningSystolic ? '' : ' scored-input--empty')} placeholder=" " style={morningSystolic ? { borderColor: getScoreColor(scoreOf('morningSystolic')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Morning Systolic <span className="scored-input-goal-inline">120</span></label>
                                            </div>
                                            <div className="scored-input-wrap">
                                                <input type="number" value={morningDiastolic} onChange={(e) => setMorningDiastolic(e.target.value)} className={"scored-input" + (morningDiastolic ? '' : ' scored-input--empty')} placeholder=" " style={morningDiastolic ? { borderColor: getScoreColor(scoreOf('morningDiastolic')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Morning Diastolic <span className="scored-input-goal-inline">80</span></label>
                                            </div>
                                            <div className="scored-input-wrap">
                                                <input type="number" value={morningBpm} onChange={(e) => setMorningBpm(e.target.value)} className={"scored-input" + (morningBpm ? '' : ' scored-input--empty')} placeholder=" " style={morningBpm ? { borderColor: getScoreColor(scoreOf('morningBpm')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Morning BPM <span className="scored-input-goal-inline">60-100</span></label>
                                            </div>
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="scored-input-wrap">
                                                <input type="number" value={eveningSystolic} onChange={(e) => setEveningSystolic(e.target.value)} className={"scored-input" + (eveningSystolic ? '' : ' scored-input--empty')} placeholder=" " style={eveningSystolic ? { borderColor: getScoreColor(scoreOf('eveningSystolic')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Evening Systolic <span className="scored-input-goal-inline">120</span></label>
                                            </div>
                                            <div className="scored-input-wrap">
                                                <input type="number" value={eveningDiastolic} onChange={(e) => setEveningDiastolic(e.target.value)} className={"scored-input" + (eveningDiastolic ? '' : ' scored-input--empty')} placeholder=" " style={eveningDiastolic ? { borderColor: getScoreColor(scoreOf('eveningDiastolic')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Evening Diastolic <span className="scored-input-goal-inline">80</span></label>
                                            </div>
                                            <div className="scored-input-wrap">
                                                <input type="number" value={eveningBpm} onChange={(e) => setEveningBpm(e.target.value)} className={"scored-input" + (eveningBpm ? '' : ' scored-input--empty')} placeholder=" " style={eveningBpm ? { borderColor: getScoreColor(scoreOf('eveningBpm')! ?? 0) } : undefined} />
                                                <label className="scored-input-label">Evening BPM <span className="scored-input-goal-inline">60-100</span></label>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={bodyTemperature}
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
                                <div className="card-header">
                                    <h3 className="card-title">Habits</h3>
                                    <span className="text-xs opacity-60 ml-auto">{builtinHabitDone + completedHabits.size}/{habitTotal}</span>
                                </div>
                                <div className="card-body">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1">
                                            {habitCheckbox(morningRoutine, setMorningRoutine, 'Morning Routine')}
                                            {habitCheckbox(eveningRoutine, setEveningRoutine, 'Evening Routine')}
                                            {habitCheckbox(fruitServing, setFruitServing, 'Fruit Serving')}
                                            {habitCheckbox(studied, setStudied, 'Studied')}
                                            {habitCheckbox(journal, setJournal, 'Journaled')}
                                            {habitCheckbox(stretching, setStretching, 'Stretching')}
                                            {habitCheckbox(reading, setReading, 'Reading')}
                                            {gymCheckbox}
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            {habitCheckbox(projectWorkDone, setProjectWorkDone, 'Projects')}

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
                                                    <div key={habit.id} className="flex items-center gap-1">
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
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTarget(habit)}
                                                            className="text-xs opacity-40 hover:opacity-100 hover:text-[var(--color-danger)] shrink-0"
                                                            data-tip="Remove habit"
                                                            aria-label={`Remove ${habit.name}`}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                        {!showCustomHabit ? (
                                            <button type="button" onClick={() => setShowCustomHabit(true)} className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100">
                                                + Add Custom Habit
                                            </button>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                <input type="text" value={customHabitName} onChange={(e) => setCustomHabitName(e.target.value)} className="form-control text-sm" placeholder="Habit name" maxLength={50} />
                                                <textarea value={customHabitDesc} onChange={(e) => setCustomHabitDesc(e.target.value)} className="form-control text-sm" placeholder="Description (optional)" rows={1} maxLength={100} />
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={handleAddCustomHabit} disabled={addingHabit || !customHabitName.trim()} className="btn-form-submit text-xs px-2 py-1">
                                                        {addingHabit ? 'Adding...' : 'Add'}
                                                    </button>
                                                    <button type="button" onClick={closeCustomHabitForm} className="btn-form-cancel text-xs px-2 py-1">Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <DayGoalsEditor
                open={showGoalsEditor}
                goals={activeGoals}
                dateLabel={dateLabel}
                onClose={() => setShowGoalsEditor(false)}
                onSave={handleSaveDayGoals}
            />

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
