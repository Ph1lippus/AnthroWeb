import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Title from '../Components/Title';
import { getDailyLogById, updateDailyLog } from '../services/dailyLogService';
import { getUserSettings } from '../services/profileService';
import type { DailyLog } from '../services/dailyLogService';
import type { UserSettings } from '../services/profileService';
import { Sparkles, Eye } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner';
import { useBootHold } from '../services/bootScreen';
import { journalHabitFor } from '../utils/journalHabit';
import JournalEditor from '../Components/Journal/JournalEditor';
import { journalDocumentText, journalTopicSuggestions, parseJournalDocument, serializeJournalDocument } from '../utils/journalContent';
import type { JournalDocument } from '../utils/journalContent';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../utils/queryKeys';
import { moodFor } from '../utils/moodSeries';

const JournalEditPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { id } = useParams<{ id: string }>();
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [journalDocument, setJournalDocument] = useState<JournalDocument>(parseJournalDocument());
    // The day's two ratings, editable here for the same reason as on the journal
    // page: this is one of the two places a rating is set, and holding them in
    // local state is what makes a slider respond before a round trip.
    const [morningMood, setMorningMood] = useState<number | null>(null);
    const [eveningMood, setEveningMood] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [focusMode, setFocusMode] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const load = async () => {
            if (!id) return;
            try {
                const [log, userSettings] = await Promise.all([
                    getDailyLogById(id),
                    getUserSettings()
                ]);
                if (log) {
                    setExistingLog(log);
                    setJournalDocument(parseJournalDocument(log.journal_entry, {
                        morning: log.journal_morning ?? '',
                        evening: log.journal_evening ?? '',
                        links: log.journal_links ?? [],
                    }));
                    setMorningMood(moodFor(log, 'morning'));
                    setEveningMood(moodFor(log, 'evening'));
                }
                setSettings(userSettings);
            } finally {
                // The gate below is `!settings || !existingLog`, and a log id
                // that no longer exists leaves `existingLog` null forever, so
                // that flag can never be what the hold waits on. "Asked and
                // answered" can: set even when the fetch rejects.
                setDataLoaded(true);
            }
        };
        load();
    }, [id]);

    const performSave = useCallback(async () => {
        if (!id || !settings || !existingLog) return;

        setSaving(true);
        setSaveError(null);
        try {
            /**
             * No `log_date`. This page edits an existing row, addressed by id, and
             * `updateDailyLog` refuses to write the date for exactly that reason --
             * sending it here would mean "and move this row to that day". It also
             * removes the UTC fallback that used to sit in its place: an evening
             * west of UTC stamped the entry onto tomorrow. The date a row has is
             * the date it was created on, and that is not this page's to change.
             */
            const logData: Partial<DailyLog> = {
                journal_entry: serializeJournalDocument(journalDocument),
                journal_morning: journalDocument.morning || null,
                journal_evening: journalDocument.evening || null,
                journal_links: journalTopicSuggestions(journalDocument),
                // See journalHabitFor: content ticks the habit, absence leaves
                // the stored tick alone.
                journal: journalHabitFor(journalDocumentText(journalDocument), existingLog.journal),
                morning_mood: morningMood,
                evening_mood: eveningMood,
                daily_score: existingLog.daily_score != null ? existingLog.daily_score : null,
            };

            await updateDailyLog(id, logData);
            setLastSaved(new Date());

            // The dashboard, the history and the daily log's own mood card all
            // read these rows. Editing a past entry without this left every one
            // of them showing what it had before the edit.
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogByDate(existingLog.log_date) });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save. Please try again.';
            setSaveError(message);
            console.error('Auto-save error:', err);
        } finally {
            setSaving(false);
        }
    }, [id, settings, existingLog, journalDocument, morningMood, eveningMood, queryClient]);

    useEffect(() => {
        if (saveError) {
            const timer = setTimeout(() => setSaveError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [saveError]);

    /**
     * The latest `performSave`, so the unmount flush below can reach it without
     * depending on a closure that is new on every render -- depending on that
     * would flush the debounce on every keystroke.
     */
    const performSaveRef = useRef(performSave);
    useEffect(() => {
        performSaveRef.current = performSave;
    }, [performSave]);

    useEffect(() => {
        if (!settings || !existingLog) return;

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
    }, [journalDocument, morningMood, eveningMood, performSave, settings, existingLog]);

    // Write the pending entry on the way out. The cleanup above cancels the timer,
    // so navigating away -- or refreshing, which is where this was noticed --
    // discarded up to two seconds of writing with nothing pending anywhere by
    // the time anyone looked. `pagehide` issues the request even when the page is
    // being torn down, which is the part a plain unmount flush cannot cover.
    useEffect(() => {
        const flushPending = () => {
            if (!autoSaveTimerRef.current) return;
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
            void performSaveRef.current();
        };

        const onPageHide = () => flushPending();
        window.addEventListener('pagehide', onPageHide);
        document.addEventListener('visibilitychange', onPageHide);

        return () => {
            window.removeEventListener('pagehide', onPageHide);
            document.removeEventListener('visibilitychange', onPageHide);
            flushPending();
        };
    }, []);

    // Both the log and the settings come from a raw `Promise.all`, invisible to the
    // app-level boot gate, so the splash would otherwise lift over the spinner
    // below. Guarded on `id` because the loader returns early without an id, and
    // `dataLoaded` only covers the case where it actually fetched something.
    useBootHold(id ? !dataLoaded : false);

    /**
     * Loading while the fetch is outstanding; a real answer afterwards.
     *
     * `!settings || !existingLog` was the gate, and both are legitimately null
     * once the request has been answered -- a user with no settings row, or an id
     * that no longer exists. So this rendered the spinner for a deleted entry
     * and for a settings failure, forever, with no way out. `dataLoaded` says
     * "asked and answered", and only then can the absence of a log be treated as
     * the answer it is.
     */
    if (!dataLoaded) {
        return (
            <>
                <Title title="Edit Journal" />
                <div className="journal-page-wrapper">
                    <div className="dashboard-section journal-section">
                        <div className="journal-card">
                            <LoadingSpinner />
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (!settings || !existingLog) {
        return (
            <>
                <Title title="Edit Journal" />
                <div className="journal-page-wrapper">
                    <div className="dashboard-section journal-section">
                        <div className="journal-card">
                            <div className="journal-card-body">
                                <p>This entry could not be found. It may have been deleted.</p>
                                <button type="button" className="btn-action" onClick={() => navigate('/Journal')}>
                                    Back to journal
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const dateFormatted = new Date(existingLog.log_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <>
            <Title title="Edit Journal" />
            <div className="journal-page-wrapper">
                <div className="dashboard-section journal-section">
                    <div className="journal-logs-card">
                        <div className="journal-score-col">
                            <div className={`journal-top-bar${focusMode ? ' journal-top-bar--focus' : ''}`}>
                                <div className="flex gap-2 flex-wrap">
                                    <button onClick={() => navigate('/Journal')} className="btn-action">
                                        Journal
                                    </button>
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
                                </div>
                                <div className="journal-autosave">
                                    {saveError ? (
                                        <span style={{ color: 'var(--color-danger)' }}>{saveError}</span>
                                    ) : saving ? (
                                        <span>Saving...</span>
                                    ) : lastSaved ? (
                                        <span>Saved {lastSaved.toLocaleTimeString()}</span>
                                    ) : (
                                        <span>Auto-saves as you type</span>
                                    )}
                                </div>
                            </div>

                            <div className="journal-date-header">
                                {dateFormatted}
                            </div>

                        </div>

                        <div className="journal-log-form">
                            {/* Keyed on the row being edited. The editors read their
                                content once at mount, so without this a different
                                id in the URL would leave the previous entry's text
                                on screen to be autosaved over the new one. */}
                            <JournalEditor
                                key={existingLog.id}
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
        </>
    );
};

export default JournalEditPage;
