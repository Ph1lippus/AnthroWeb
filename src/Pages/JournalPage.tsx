import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import Title from '../Components/Title';
import { createDailyLog, updateDailyLog, getDailyLogByDate } from '../services/dailyLogService';
import { getUserSettings } from '../services/profileService';
import type { DailyLog } from '../services/dailyLogService';
import type { UserSettings } from '../services/profileService';
import { Lightbulb, X, RotateCw, Sparkles, Calendar, ChevronLeft, ChevronRight, CalendarCheck2, Eye, Rows3 } from 'lucide-react';
import { todayString, addDays, isDateString, formatDayLabel } from '../utils/dates';
import { journalHabitFor } from '../utils/journalHabit';
import { useBootHold } from '../services/bootScreen';
import JournalEditor from '../Components/Journal/JournalEditor';
import JournalBreakdown from '../Components/Journal/JournalBreakdown';
import { journalDocumentText, journalTopicSuggestions, parseJournalDocument, serializeJournalDocument } from '../utils/journalContent';
import type { JournalDocument } from '../utils/journalContent';
import { queryKeys } from '../utils/queryKeys';
import { moodFor } from '../utils/moodSeries';

/**
 * The journal, laid out like the daily log.
 *
 * This page used to be one full-height column of two editors with nothing beside
 * them, while every other page in the app had settled on the same shape: a
 * narrow sticky rail for "what this day looks like" and a wide field grid for
 * "what goes into it". Splitting `mood` into a morning and an evening rating
 * (migration 0014) put a third thing on this page that belongs on the left --
 * the day's readings -- so the two-column move was going to happen anyway. Doing
 * it here rather than inventing a third layout means the daily log and the
 * journal are now recognisably the same instrument.
 *
 * The day lives in `?date=`, as it does on the daily log. It used to be local
 * state, which made a past day's journal unreachable except by guessing an id --
 * and with two ratings per day now, being able to go back and fix yesterday's
 * evening is the difference between the feature and an annoyance.
 */
const JournalPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const [journalDocument, setJournalDocument] = useState<JournalDocument>(parseJournalDocument());
    /**
     * Both ratings held here rather than read back from the fetched log.
     *
     * A deliberate exception to the rule the daily log follows. That page only
     * *displays* mood, so it can read the stored value; this page *writes* it,
     * and the rating has to appear the instant it is tapped rather than a round
     * trip later. The autosave below is what makes it durable.
     */
    const [morningMood, setMorningMood] = useState<number | null>(null);
    const [eveningMood, setEveningMood] = useState<number | null>(null);
    const [showTips, setShowTips] = useState(true);
    const [focusMode, setFocusMode] = useState(false);

    const dateParam = searchParams.get('date');
    const logDate = isDateString(dateParam) ? dateParam : todayString();
    const today = todayString();
    const isToday = logDate === today;

    const setLogDate = useCallback((date: string) => {
        if (!isDateString(date)) return;
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('date', date);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const journalTips = [
        "What's one thing you're grateful for today?",
        "Describe a challenge you faced and how you handled it.",
        "What did you learn about yourself today?",
        "Write about a moment that made you smile.",
        "What would you do differently tomorrow?",
        "Describe your energy levels throughout the day.",
        "What are you looking forward to tomorrow?",
        "Did you stick to your habits? What helped or hindered you?",
        "Write about your meals - what did you enjoy most?",
        "How did your body feel today? Any aches, pains, or improvements?",
        "What's one small win you had today?",
        "Describe your sleep quality in detail.",
        "Did you have any interesting dreams?",
        "How did you manage stress today?",
        "What's on your mind right now?",
        "What would make today feel meaningful, even if it is small?",
        "Which upcoming event deserves your best energy?",
        "What is one habit you want to protect today?",
        "What did your dreams seem to be telling you?",
        "Where did your energy rise, and what caused it?",
        "What boundary would make the rest of the day easier?",
        "Which task are you avoiding, and what is the smallest first step?",
        "Who helped you today, and how could you acknowledge it?",
        "What friction kept repeating today?",
        "What did you handle better than you would have last month?",
        "What quote, idea, or conversation stayed with you?",
        "What can you release before going to sleep?",
        "What deserves gratitude even though it was difficult?",
        "What should your future self remember about today?",
    ];

    const getRandomTip = () => journalTips[Math.floor(Math.random() * journalTips.length)];
    const [randomTip, setRandomTip] = useState(getRandomTip);

    /**
     * Whether the day's breakdown is expanded.
     *
     * A lazy initialiser rather than an effect, so there is no first paint with the
     * wrong one. Open by default on a wide screen, because the rail is beside the
     * editors there and there is room for it; closed on a phone, where it would
     * push both writing surfaces below the fold.
     */
    const [breakdownOpen, setBreakdownOpen] = useState(
        () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches,
    );

    const refreshTip = () => {
        setRandomTip(getRandomTip());
    };

    // Load user settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const userSettings = await getUserSettings();
                setSettings(userSettings);
            } finally {
                setSettingsLoaded(true);
            }
        };
        loadSettings();
    }, []);

    /**
     * The day's log, through React Query rather than a raw await.
     *
     * This page autosaves into the same row the daily log owns, so it has to
     * read that row, and it has to read the *server's* copy. The query cache is
     * persisted to IndexedDB and restored before the first render, so a cached
     * answer here would be the snapshot taken before the last edit -- and this
     * page would then autosave it straight back over the top. `staleTime: 0`
     * plus waiting on `isFetching` is what makes the row that fills the form the
     * one Postgres actually holds.
     *
     * `keepPreviousData` so the arrows feel instant: the previous day stays on
     * screen while the next one loads.
     */
    const { data: dayLog, isPlaceholderData: dayLogPlaceholder, isFetching: dayLogFetching } = useQuery({
        queryKey: queryKeys.dailyLogByDate(logDate),
        queryFn: () => getDailyLogByDate(logDate),
        enabled: isDateString(logDate),
        staleTime: 0,
        placeholderData: keepPreviousData,
    });

    // Only apply a day's data once, so an autosave that invalidates the query
    // does not refill the form underneath the cursor and undo the edit.
    const appliedDateRef = useRef<string | null>(null);
    /**
     * The date whose row is actually in the form right now.
     *
     * This is NOT `logDate`, and the difference is the whole reason entries used
     * to follow each other around the calendar. The TipTap editors are
     * uncontrolled -- `NoteEditor` reads `initialHtml` once, at construction --
     * so a remount is the only thing that can put a new day's text into them.
     * Keying them on `logDate` remounted them in the same commit as the date
     * change, which is *before* the query for that day resolves: the editors
     * came up holding the previous day's prose, the fetch landed a moment later,
     * and because no remount followed, they kept it. The next keystroke then
     * saved yesterday's entry onto today's row.
     *
     * So the key has to advance only once the new day's data has been applied.
     * This state is that signal: `null` until the first successful apply, and
     * from then on always naming the day the form currently holds.
     */
    const [appliedDate, setAppliedDate] = useState<string | null>(null);
    useEffect(() => {
        if (dayLogPlaceholder || dayLog === undefined) return;
        if (dayLogFetching) return;
        if (appliedDateRef.current === logDate) return;
        appliedDateRef.current = logDate;
        setAppliedDate(logDate);

        if (dayLog) {
            // Populating the editor from a fetched log is an external-system sync
            // (server data -> local state), which is what effects are for. The
            // `appliedDateRef` guard above is what keeps this to one run per day
            // instead of on every refetch the autosave triggers.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setExistingLog(dayLog);
            setIsEditing(true);
            setJournalDocument(parseJournalDocument(dayLog.journal_entry, {
                morning: dayLog.journal_morning ?? '',
                evening: dayLog.journal_evening ?? '',
                links: dayLog.journal_links ?? [],
            }));
            setMorningMood(moodFor(dayLog, 'morning'));
            setEveningMood(moodFor(dayLog, 'evening'));
        } else {
            setExistingLog(null);
            setIsEditing(false);
            setJournalDocument(parseJournalDocument());
            setMorningMood(null);
            setEveningMood(null);
        }
        // A different day is a different entry, so the tip from last night's
        // writing is not this morning's prompt.
        setShowTips(true);
    }, [dayLog, dayLogPlaceholder, dayLogFetching, logDate]);

    // Follow the calendar day forward when the tab is brought back to the
    // foreground. Only react once the day has genuinely changed -- focus fires
    // for any tab or window switch, which used to re-trigger this constantly.
    // An open page is far more often "today" than a day being deliberately
    // revisited, so a jump forward only happens if you were already on today.
    const lastKnownTodayRef = useRef<string>(todayString());
    useEffect(() => {
        const rollForwardIfNewDay = () => {
            const now = todayString();
            const previousToday = lastKnownTodayRef.current;
            lastKnownTodayRef.current = now;
            if (now !== previousToday && logDate === previousToday) {
                setLogDate(now);
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
    }, [logDate, setLogDate]);

    // Auto-save function
    /**
     * The tail of the whole-row write queue.
     *
     * `performSave` updates most of a `daily_logs` row, so two overlapping calls
     * are not two independent fields landing in either order -- they are two
     * complete copies of the same row racing, and whichever response resolves
     * last decides what is stored. A cold Supabase start or a slow network gets
     * there easily. Chaining every write behind this reference makes the order
     * the order the edits were made in. Same pattern as `DailyLogPage`.
     */
    const saveChainRef = useRef<Promise<void>>(Promise.resolve());

    const performSave = useCallback(async () => {
        if (!settings) return;

        /**
         * Refuse to write while the form belongs to a different day.
         *
         * `performSave` closes over `logDate` and over the editor state at the
         * same time, and a slow fetch can leave those two describing different
         * days: the URL has already moved on while the editors still hold the
         * previous day's text. Saving then wrote the new day with the old day's
         * prose -- and because `log_date` travels in the payload, it also
         * *renamed* the old row to the new date, so an entry silently moved
         * instead of being copied. A mis-timed autosave has to be a no-op. The
         * pending payload is still written, by the unmount flush below, against
         * the day it actually belongs to.
         */
        if (appliedDate !== logDate) return;

        const journalEntry = serializeJournalDocument(journalDocument);
        const journalText = journalDocumentText(journalDocument);

        // A rating on its own is worth keeping even with no prose: setting a mood
        // and writing nothing are two different intentions, and only the second
        // one should be skipped.
        const hasRating = morningMood !== null || eveningMood !== null;
        if (!isEditing && !journalText && !hasRating) return;

        setSaving(true);
        setSaveError(null);
        try {
            const logData: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'> = {
                log_date: logDate,
                journal_entry: journalEntry || null,
                journal_morning: journalDocument.morning || null,
                journal_evening: journalDocument.evening || null,
                journal_links: journalTopicSuggestions(journalDocument),
                // The day's two ratings. This page owns them: they are set above
                // each half of the writing precisely because that is where the
                // morning and the evening actually are.
                morning_mood: morningMood,
                evening_mood: eveningMood,
                // Writing an entry ticks the "Journaled" habit for this day, so
                // the habit charts and the daily score agree with the fact that
                // something was written. An empty entry carries the stored tick
                // forward rather than clearing it -- see journalHabitFor.
                journal: journalHabitFor(journalText, existingLog?.journal),
                daily_score: isEditing && existingLog?.daily_score != null ? existingLog.daily_score : null,
            };

            /**
             * Whole-row writes, one at a time, in the order they were made.
             *
             * This writes most of a `daily_logs` row, so two overlapping calls
             * are not two independent fields landing in either order -- they are
             * two complete copies of the same row racing, and whichever response
             * resolves last decides what is stored. Chaining through the tail
             * promise makes the order the order the edits were made in. The
             * leading `catch` keeps one failed save from poisoning every save
             * that follows it.
             */
            await (saveChainRef.current = saveChainRef.current
                .catch(() => undefined)
                .then(async () => {
                    if (isEditing && existingLog?.id) {
                        await updateDailyLog(existingLog.id, logData);
                    } else {
                        const newLog = await createDailyLog(logData);
                        if (newLog) {
                            setExistingLog(newLog as DailyLog);
                            setIsEditing(true);
                        }
                    }
                    setLastSaved(new Date());
                }));

            // The daily log's own score card reads this row's mood, and the
            // dashboard and history read the whole list. Without this the page
            // saved correctly and every other view stayed a session behind.
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogByDate(logDate) });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save. Please try again.';
            setSaveError(message);
            console.error('Auto-save error:', err);
        } finally {
            setSaving(false);
        }
    }, [settings, logDate, appliedDate, journalDocument, morningMood, eveningMood, isEditing, existingLog, queryClient]);

    useEffect(() => {
        if (saveError) {
            const timer = setTimeout(() => setSaveError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [saveError]);

    /**
     * The latest `performSave`, for flushes that must not re-run on every render.
     *
     * `performSave` is a new closure on every render, so an effect that depends
     * on it runs on every render too -- which would flush the debounce on every
     * keystroke and defeat it entirely. Holding it in a ref lets the unmount
     * cleanup below run exactly once, while still calling the current version.
     */
    const performSaveRef = useRef(performSave);
    // Published for the flush below, which cannot see a render. In an effect
    // rather than during render: writing a ref while rendering is what makes a
    // component miss an update when the value is also read during that render.
    useEffect(() => {
        performSaveRef.current = performSave;
    }, [performSave]);

    // Debounced auto-save
    useEffect(() => {
        if (!settings) return;

        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null;
            void performSave();
        }, 2000);

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [journalDocument, morningMood, eveningMood, performSave, settings]);

    /**
     * Write the pending entry on the way out, instead of dropping it.
     *
     * The cleanup above cancels the timer, and `performSave` is in its dependency
     * list while depending on `logDate` -- so changing day, navigating away, or
     * closing the tab all cancelled the save with up to two seconds of typing
     * still sitting in it. That is the second way entries went missing, and it
     * is silent: nothing is pending anywhere by the time anyone notices.
     *
     * The outgoing day is still the one in `performSaveRef` at this instant,
     * because the debounce effect's cleanup runs before the next render commits,
     * so the flush writes to the day the edit actually belongs to.
     */
    useEffect(() => {
        const flushPending = () => {
            if (!autoSaveTimerRef.current) return;
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
            void performSaveRef.current();
        };

        // A tab close or a pagehide gives no chance to await anything, but the
        // request still has to be *issued* -- that is all `fetch` needs to
        // survive the navigation, and it is why this is not a debounce flush
        // alone. Without it the last couple of seconds of writing are lost on
        // every refresh, which is exactly how this reads from the outside.
        const onPageHide = () => flushPending();
        window.addEventListener('pagehide', onPageHide);
        document.addEventListener('visibilitychange', onPageHide);

        return () => {
            window.removeEventListener('pagehide', onPageHide);
            document.removeEventListener('visibilitychange', onPageHide);
            flushPending();
        };
    }, []);

    // Settings come from a raw await, invisible to the app-level boot gate, so
    // without this the splash would lift over an empty page. `settingsLoaded`
    // rather than `settings`: the gate reads `!settings`, and a user with no
    // settings row legitimately has `settings === null`, which would hold the
    // splash forever. The flag means "asked and answered", rejection included.
    useBootHold(!settingsLoaded || dayLogPlaceholder || dayLog === undefined);

    /**
     * True while the URL names a day the form has not caught up with.
     *
     * The editors can only ever hold one day at a time, and during the gap
     * between clicking the arrow and the row arriving, they still hold the
     * previous one. Leaving them on screen and writable during that window is
     * how a person ends up typing into yesterday's entry -- and the text then
     * either vanishes when the real day mounts over it, or is attributed to a
     * day they were not looking at. A day you have not loaded is not editable.
     */
    const dayIsPending = appliedDate !== logDate;

    return (
        <>
            <Title title="Journal" />
            <div className="journal-page-wrapper">
                <div className="dashboard-section journal-section">
                    {/* The Daily Log's grid, unchanged: a narrow sticky rail on the
                        left carrying "what this day looks like", and the writing
                        surfaces to its right. The rail is now genuinely useful --
                        it holds the day's breakdown -- rather than a header row that
                        happened to be a column. */}
                    <div className="journal-logs-card">
                        <div className="journal-score-col">
                            {/* The day row and the action buttons, stacked above the
                                breakdown. Same order as the Daily Log's score
                                column: the controls pick a day, then the card
                                describes it. */}
                            <div className={`journal-top-bar${focusMode ? ' journal-top-bar--focus' : ''}`}>
                                <div className="journal-top-bar__controls">
                                    <div className="daily-log-daynav">
                                        {/* The breakdown toggle, first because it is the
                                            one control in this row that does not act
                                            on the day. Everything after it either
                                            picks a day or acts on what is written. */}
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
                                    </div>
                                    {showTips && (
                                        <div className="journal-tip-card">
                                            <Lightbulb className="journal-tip-icon" aria-hidden="true" />
                                            <span className="journal-tip-text">{randomTip}</span>
                                            <button type="button" onClick={refreshTip} className="journal-tip-refresh" aria-label="Another journal prompt" data-tip="Another prompt">
                                                <RotateCw />
                                            </button>
                                            <button type="button" onClick={() => setShowTips(false)} className="journal-tip-close" aria-label="Dismiss tip">
                                                <X />
                                            </button>
                                        </div>
                                    )}
                                    {!showTips && (
                                        <button type="button" onClick={() => { setShowTips(true); refreshTip(); }} className="journal-show-tips">
                                            <Lightbulb className="mr-1" />Show tip
                                        </button>
                                    )}
                                </div>
                                <div className="journal-top-bar__status">
                                    <button
                                        type="button"
                                        className={`btn-action journal-focus-btn${focusMode ? ' journal-focus-btn--active' : ''}`}
                                        onClick={() => setFocusMode(value => !value)}
                                        aria-label="Focus mode"
                                        aria-pressed={focusMode}
                                        data-tip="Focus mode"
                                    >
                                        <Eye size={14} />
                                    </button>
                                    <button type="button" className="btn-action journal-charts-link" onClick={() => navigate('/Mind-Charts')}>
                                        <Sparkles size={14} /> Neural network
                                    </button>
                                    <div className="journal-autosave">
                                        {saveError && <span className="journal-save-error" role="status">{saveError}</span>}
                                        {saving ? (
                                            <span>Saving...</span>
                                        ) : lastSaved ? (
                                            <span>Saved {lastSaved.toLocaleTimeString()}</span>
                                        ) : (
                                            <span>Auto-saves as you type</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* The day's breakdown, under the controls that pick the
                                day. Reads the same in the same place as the Daily
                                Log's score card, and is derived entirely from what
                                is on screen -- it cannot disagree with the editors,
                                which is the only reason to show it at all. */}
                            <JournalBreakdown
                                document={journalDocument}
                                morningMood={morningMood}
                                eveningMood={eveningMood}
                                dateLabel={formatDayLabel(logDate)}
                                expanded={breakdownOpen}
                            />
                        </div>

                        <div className="journal-log-form">
                            {/*
                                Held back until the row for the URL's day is
                                actually in the form. `key` is the *applied* day,
                                not `logDate`: the editors are uncontrolled, so a
                                remount is the only thing that can put a new day's
                                text into them, and it has to happen after the
                                fetch resolves rather than in the same commit as
                                the click. Keying on `logDate` mounted them with
                                the previous day's prose and left them there --
                                which then saved that day over the new one.

                                The pending state is a quiet dim rather than the
                                words "Loading wednesday...". The day's own label is
                                already in the rail beside it, so a message naming
                                the day repeats what is on screen and then
                                disappears -- a flash of motion for information that
                                was never missing. What it does need to convey is
                                "not editable yet", and opacity says that without
                                shouting.
                            */}
                            <div
                                className={`journal-log-form__inner${dayIsPending ? ' journal-log-form__inner--pending' : ''}`}
                                aria-busy={dayIsPending}
                            >
                                <JournalEditor
                                    key={appliedDate}
                                    value={journalDocument}
                                    onChange={setJournalDocument}
                                    morningMood={morningMood}
                                    eveningMood={eveningMood}
                                    onMorningMood={setMorningMood}
                                    onEveningMood={setEveningMood}
                                    focusMode={focusMode}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default JournalPage;