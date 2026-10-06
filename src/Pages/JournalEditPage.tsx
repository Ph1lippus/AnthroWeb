import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Title from '../Components/Title';
import { getDailyLogById, updateDailyLog } from '../services/dailyLogService';
import { getUserSettings } from '../services/profileService';
import type { DailyLog } from '../services/dailyLogService';
import type { UserSettings } from '../services/profileService';
import { PenTool } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner';
import { useBootHold } from '../services/bootScreen';
import { journalHabitFor } from '../utils/journalHabit';
import JournalEditor from '../Components/Journal/JournalEditor';
import { journalDocumentText, journalWordCount, parseJournalDocument, serializeJournalDocument } from '../utils/journalContent';
import type { JournalDocument } from '../utils/journalContent';

const JournalEditPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [journalDocument, setJournalDocument] = useState<JournalDocument>(parseJournalDocument());
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
                        sentiment: log.journal_sentiment ?? 'mixed',
                        links: log.journal_links ?? [],
                    }));
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
                journal_sentiment: journalDocument.sentiment,
                journal_links: journalDocument.links,
                // See journalHabitFor: content ticks the habit, absence leaves
                // the stored tick alone.
                journal: journalHabitFor(journalDocumentText(journalDocument), existingLog?.journal),
                daily_score: existingLog?.daily_score != null ? existingLog.daily_score : null,
            };

            await updateDailyLog(id, logData);
            setLastSaved(new Date());
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save. Please try again.';
            setSaveError(message);
            console.error('Auto-save error:', err);
        } finally {
            setSaving(false);
        }
    }, [id, settings, journalDocument, existingLog]);

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
    }, [journalDocument, performSave, settings]);

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

    const journalText = journalDocumentText(journalDocument);
    const wordCount = journalWordCount(journalDocument);
    const charCount = journalText.length;
    const dateFormatted = new Date(existingLog.log_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <>
            <Title title="Edit Journal" />
            <div className="journal-page-wrapper">
                <div className="dashboard-section journal-section">
                    <div className="journal-card">
                        <div className="journal-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => navigate('/Journal')} className="btn-action">
                                    Journal
                                </button>
                                <button onClick={() => navigate('/Daily-Log/History')} className="btn-action">
                                    History
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

                        <div className="journal-editor-section">
                            <div className="journal-editor-header">
                                <PenTool />
                                Journal Entry
                            </div>
                            <JournalEditor value={journalDocument} onChange={setJournalDocument} />
                            <div className="journal-editor-footer">
                                <div className="journal-editor-count">
                                    {wordCount} words · {charCount} characters
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default JournalEditPage;
