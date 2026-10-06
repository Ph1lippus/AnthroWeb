import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { createDailyLog, updateDailyLog, getDailyLogByDate } from '../services/dailyLogService';
import { getUserSettings } from '../services/profileService';
import type { DailyLog } from '../services/dailyLogService';
import type { UserSettings } from '../services/profileService';
import { Lightbulb, X, RotateCw, PenTool } from 'lucide-react';
import { todayString } from '../utils/dates';
import { journalHabitFor } from '../utils/journalHabit';
import LoadingSpinner from '../Components/LoadingSpinner';
import { useBootHold } from '../services/bootScreen';
import JournalEditor from '../Components/Journal/JournalEditor';
import { journalDocumentText, journalWordCount, parseJournalDocument, serializeJournalDocument } from '../utils/journalContent';
import type { JournalDocument } from '../utils/journalContent';

const JournalPage: React.FC = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const [logDate, setLogDate] = useState(() => todayString());
    const [journalDocument, setJournalDocument] = useState<JournalDocument>(parseJournalDocument());
    const [showTips, setShowTips] = useState(true);

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

    // Check for existing log
    useEffect(() => {
        const checkExisting = async () => {
            if (!logDate) return;
            const log = await getDailyLogByDate(logDate);
            if (log) {
                setExistingLog(log);
                setIsEditing(true);
                setJournalDocument(parseJournalDocument(log.journal_entry, {
                    morning: log.journal_morning ?? '',
                    evening: log.journal_evening ?? '',
                    sentiment: log.journal_sentiment ?? 'mixed',
                    links: log.journal_links ?? [],
                }));
            } else {
                setExistingLog(null);
                setIsEditing(false);
                setJournalDocument(parseJournalDocument());
            }
        };
        checkExisting();
    }, [logDate]);

    // Follow the calendar day forward when the tab is brought back to the
    // foreground. Only react once the day has genuinely changed — focus fires
    // for any tab or window switch, which used to re-trigger this constantly.
    const lastKnownTodayRef = useRef<string>(todayString());
    useEffect(() => {
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
    }, [logDate]);

    // Auto-save function
    const performSave = useCallback(async () => {
        if (!settings) return;

        const journalEntry = serializeJournalDocument(journalDocument);
        const journalText = journalDocumentText(journalDocument);
        if (!isEditing && !journalDocumentText(journalDocument)) return;

        setSaving(true);
        setSaveError(null);
        try {
            const logData: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'> = {
                log_date: logDate,
                journal_entry: journalEntry || null,
                journal_morning: journalDocument.morning || null,
                journal_evening: journalDocument.evening || null,
                journal_sentiment: journalDocument.sentiment,
                journal_links: journalDocument.links,
                // Writing an entry ticks the "Journaled" habit for this day, so
                // the habit charts and the daily score agree with the fact that
                // something was written. An empty entry carries the stored tick
                // forward rather than clearing it -- see journalHabitFor.
                journal: journalHabitFor(journalText, existingLog?.journal),
                daily_score: isEditing && existingLog?.daily_score != null ? existingLog.daily_score : null,
            };

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
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save. Please try again.';
            setSaveError(message);
            console.error('Auto-save error:', err);
        } finally {
            setSaving(false);
        }
    }, [settings, logDate, journalDocument, isEditing, existingLog]);

    useEffect(() => {
        if (saveError) {
            const timer = setTimeout(() => setSaveError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [saveError]);

    // Debounced auto-save
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

    // Settings come from a raw await, invisible to the app-level boot gate, so
    // without this the splash lifts over the spinner below. `settingsLoaded`
    // rather than `settings`: the gate reads `!settings`, and a user with no
    // settings row legitimately has `settings === null`, which would hold the
    // splash forever. The flag means "asked and answered", rejection included.
    useBootHold(!settingsLoaded);

    if (!settings) {
        return (
            <>
                <Title title="Journal" />
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

    const journalEntry = journalDocumentText(journalDocument);
    const wordCount = journalWordCount(journalDocument);
    const charCount = journalEntry.length;
    const todayFormatted = new Date(logDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <>
            <Title title="Journal" />
            <div className="journal-page-wrapper">
                <div className="dashboard-section journal-section">
                    <div className="journal-card">
                        {/* Stats Bar */}
                        {/* Top Bar */}
                        <div className="journal-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => navigate('/Daily-Log')} className="btn-action">
                                    Daily Log
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

                        {/* Date Header */}
                        <div className="journal-date-header">
                            {todayFormatted}
                        </div>

                        {/* Writing Tip */}
                        {showTips && (
                            <div className="journal-tip-card">
                                <div className="journal-tip-content">
                                    <div className="flex items-start gap-2 flex-1">
                                        <Lightbulb className="journal-tip-icon" />
                                        <div>
                                            <div className="journal-tip-title">A prompt for your journal graph</div>
                                            <div className="journal-tip-text">{randomTip}</div>
                                            <div className="journal-tip-hint">
                                                Follow the thought, then add a topic anchor below the two nodes.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowTips(false)}
                                        className="journal-tip-close"
                                        aria-label="Dismiss tip"
                                    >
                                        <X />
                                    </button>
                                </div>
                                <button type="button" onClick={refreshTip} className="journal-tip-refresh">
                                    <RotateCw className="mr-1" />Another tip
                                </button>
                            </div>
                        )}

                        {/* Journal Editor */}
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
                                {!showTips && (
                                    <button
                                        type="button"
                                        onClick={() => { setShowTips(true); refreshTip(); }}
                                        className="journal-show-tips"
                                    >
                                        <Lightbulb className="mr-1" />Show tips
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default JournalPage;