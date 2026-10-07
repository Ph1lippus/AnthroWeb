import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Title from '../Components/Title';
import { getDailyLogById, updateDailyLog } from '../services/dailyLogService';
import { getUserSettings } from '../services/profileService';
import type { DailyLog } from '../services/dailyLogService';
import type { UserSettings } from '../services/profileService';
import { PenTool, Sparkles } from 'lucide-react';
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
        if (!id || !settings) return;

        setSaving(true);
        setSaveError(null);
        try {
            const logData: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'> = {
                log_date: existingLog?.log_date || new Date().toISOString().split('T')[0],
                journal_entry: serializeJournalDocument(journalDocument),
                journal_morning: journalDocument.morning || null,
                journal_evening: journalDocument.evening || null,
                journal_links: journalTopicSuggestions(journalDocument),
                // See journalHabitFor: content ticks the habit, absence leaves
                // the stored tick alone.
                journal: journalHabitFor(journalDocumentText(journalDocument), existingLog?.journal),
                morning_mood: morningMood,
                evening_mood: eveningMood,
                daily_score: existingLog?.daily_score != null ? existingLog.daily_score : null,
            };

            await updateDailyLog(id, logData);
            setLastSaved(new Date());

            // The dashboard, the history and the daily log's own mood card all
            // read these rows. Editing a past entry without this left every one
            // of them showing what it had before the edit.
            queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
            if (existingLog?.log_date) {
                queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogByDate(existingLog.log_date) });
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save. Please try again.';
            setSaveError(message);
            console.error('Auto-save error:', err);
        } finally {
            setSaving(false);
        }
    }, [id, settings, journalDocument, morningMood, eveningMood, existingLog, queryClient]);

    useEffect(() => {
        if (saveError) {
            const timer = setTimeout(() => setSaveError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [saveError]);

    useEffect(() => {
        if (!settings) return;

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
    }, [journalDocument, morningMood, eveningMood, performSave, settings]);

    // Both the log and the settings come from a raw `Promise.all`, invisible to the
    // app-level boot gate, so the splash would otherwise lift over the spinner
    // below. Guarded on `id` because the loader returns early without an id, and
    // `dataLoaded` only covers the case where it actually fetched something.
    useBootHold(id ? !dataLoaded : false);

    if (!settings || !existingLog) {
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

    const dateFormatted = new Date(existingLog.log_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <>
            <Title title="Edit Journal" />
            <div className="journal-page-wrapper">
                <div className="dashboard-section journal-section">
                    <div className="journal-logs-card">
                        <div className="journal-score-col">
                            <div className="journal-top-bar">
                                <div className="flex gap-2 flex-wrap">
                                    <button onClick={() => navigate('/Journal')} className="btn-action">
                                        Journal
                                    </button>
                                    <button onClick={() => navigate('/Daily-Log/History')} className="btn-action">
                                        History
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
                            <div className="journal-editor-header">
                                <PenTool />
                                Journal Entry
                            </div>
                            <JournalEditor
                                value={journalDocument}
                                onChange={setJournalDocument}
                                morningMood={morningMood}
                                eveningMood={eveningMood}
                                onMorningMood={setMorningMood}
                                onEveningMood={setEveningMood}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default JournalEditPage;
