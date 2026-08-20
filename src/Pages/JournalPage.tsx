import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { createDailyLog, updateDailyLog, getDailyLogByDate } from '../services/dailyLogService';
import { getUserSettings } from '../services/profileService';
import type { DailyLog } from '../services/dailyLogService';
import type { UserSettings } from '../services/profileService';

const JournalPage: React.FC = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const logDate = new Date().toISOString().split('T')[0];
    const [journalEntry, setJournalEntry] = useState('');
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
    ];

    const getRandomTip = () => journalTips[Math.floor(Math.random() * journalTips.length)];
    const [randomTip, setRandomTip] = useState(getRandomTip);

    const refreshTip = () => {
        setRandomTip(getRandomTip());
    };

    // Load user settings
    useEffect(() => {
        const loadSettings = async () => {
            const userSettings = await getUserSettings();
            setSettings(userSettings);
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
                setJournalEntry(log.journal_entry || '');
            } else {
                setExistingLog(null);
                setIsEditing(false);
            }
        };
        checkExisting();
    }, [logDate]);

    // Auto-save function
    const performSave = useCallback(async () => {
        if (!settings) return;

        setSaving(true);
        setSaveError(null);
        try {
            const logData: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'> = {
                log_date: logDate,
                journal_entry: journalEntry || null,
                daily_score: isEditing && existingLog?.daily_score != null ? existingLog.daily_score : (journalEntry.trim().length > 0 ? 100 : 0),
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
    }, [settings, logDate, journalEntry, isEditing, existingLog]);

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
    }, [journalEntry, performSave, settings]);

    if (!settings) {
        return (
            <>
                <Title title="Journal" />
                <div className="journal-page-wrapper">
                    <div className="dashboard-section journal-section">
                        <div className="journal-card">
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const journalScore = journalEntry && journalEntry.trim().length > 0 ? 100 : 0;
    const wordCount = journalEntry.trim() ? journalEntry.trim().split(/\s+/).length : 0;
    const charCount = journalEntry.length;
    const todayFormatted = new Date(logDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <>
            <Title title="Journal" />
            <div className="journal-page-wrapper">
                <div className="dashboard-section journal-section">
                    <div className="journal-card">
                        {/* Stats Bar */}
                        <div className="journal-stats">
                            <div className="journal-stat-item">
                                <span className="journal-stat-label">Journal Score</span>
                                <span className="journal-stat-value" style={{ color: journalScore >= 80 ? 'var(--color-primary)' : journalScore > 0 ? '#ffa500' : 'var(--color-danger)' }}>
                                    {journalScore}/100
                                </span>
                            </div>
                            <div className="journal-stat-item">
                                <span className="journal-stat-label">Words</span>
                                <span className="journal-stat-value">{wordCount}</span>
                            </div>
                            <div className="journal-stat-item">
                                <span className="journal-stat-label">Characters</span>
                                <span className="journal-stat-value">{charCount}</span>
                            </div>
                        </div>

                        {/* Top Bar */}
                        <div className="journal-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => navigate('/Daily-Log')} className="btn-action">
                                    <i className="i-lucide-arrow-left mr-1"></i>Daily Log
                                </button>
                                <button onClick={() => navigate('/Daily-Log/History')} className="btn-action">
                                    <i className="i-lucide-history mr-1"></i>History
                                </button>
                            </div>
                            <div className="journal-autosave">
                                {saveError ? (
                                    <span style={{ color: 'var(--color-danger)' }}><i className="fa-solid fa-circle-exclamation mr-1"></i>{saveError}</span>
                                ) : saving ? (
                                    <span><i className="fa-solid fa-circle-notch fa-spin mr-1"></i>Saving...</span>
                                ) : lastSaved ? (
                                    <span><i className="fa-solid fa-check mr-1" style={{ color: 'var(--color-primary)' }}></i>Saved {lastSaved.toLocaleTimeString()}</span>
                                ) : (
                                    <span>Auto-saves as you type</span>
                                )}
                            </div>
                        </div>

                        {/* Date Header */}
                        <div className="journal-date-header">
                            <i className="fa-regular fa-calendar"></i>
                            {todayFormatted}
                        </div>

                        {/* Writing Tip */}
                        {showTips && (
                            <div className="journal-tip-card">
                                <div className="journal-tip-content">
                                    <div className="flex items-start gap-2 flex-1">
                                        <i className="fa-solid fa-lightbulb journal-tip-icon"></i>
                                        <div>
                                            <div className="journal-tip-title">Writing Tip</div>
                                            <div className="journal-tip-text">{randomTip}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowTips(false)}
                                        className="journal-tip-close"
                                        aria-label="Dismiss tip"
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                                <button onClick={refreshTip} className="journal-tip-refresh">
                                    <i className="fa-solid fa-rotate-right mr-1"></i>Another tip
                                </button>
                            </div>
                        )}

                        {/* Journal Editor */}
                        <div className="journal-editor-section">
                            <div className="journal-editor-header">
                                <i className="fa-solid fa-pen-fancy"></i>
                                Journal Entry
                            </div>
                            <textarea
                                value={journalEntry}
                                onChange={(e) => setJournalEntry(e.target.value)}
                                className="journal-editor"
                                placeholder="Write your thoughts, reflections, or anything notable about today..."
                            />
                            <div className="journal-editor-footer">
                                <div className="journal-editor-count">
                                    {wordCount} words · {charCount} characters
                                </div>
                                {!showTips && (
                                    <button
                                        onClick={() => { setShowTips(true); refreshTip(); }}
                                        className="journal-show-tips"
                                    >
                                        <i className="fa-solid fa-lightbulb mr-1"></i>Show tips
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