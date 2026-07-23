import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDailyLog, updateDailyLog, getDailyLogByDate } from '../services/dailyLogService';
import { getUserSettings } from '../services/profileService';
import type { DailyLog } from '../services/dailyLogService';
import type { UserSettings } from '../services/profileService';

const JournalPage: React.FC = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const logDate = new Date().toISOString().split('T')[0];
    const [journalEntry, setJournalEntry] = useState('');
    const [showTips, setShowTips] = useState(true);

    const journalTips = [
        "💡 What's one thing you're grateful for today?",
        "💡 Describe a challenge you faced and how you handled it.",
        "💡 What did you learn about yourself today?",
        "💡 Write about a moment that made you smile.",
        "💡 What would you do differently tomorrow?",
        "💡 Describe your energy levels throughout the day.",
        "💡 What are you looking forward to tomorrow?",
        "💡 Did you stick to your habits? What helped or hindered you?",
        "💡 Write about your meals - what did you enjoy most?",
        "💡 How did your body feel today? Any aches, pains, or improvements?",
        "💡 What's one small win you had today?",
        "💡 Describe your sleep quality in detail.",
        "💡 Did you have any interesting dreams?",
        "💡 How did you manage stress today?",
        "💡 What's on your mind right now?",
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
        try {
            const logData: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'> = {
                log_date: logDate,
                journal_entry: journalEntry || undefined,
                daily_score: journalEntry.trim().length > 0 ? 100 : 0,
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
            console.error('Auto-save error:', err);
        } finally {
            setSaving(false);
        }
    }, [settings, logDate, journalEntry, isEditing, existingLog]);

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
            <div className="daily-logs-page-wrapper">
                <div className="dashboard-section daily-logs-section">
                    <div className="daily-logs-card">
                        <div className="profile-loading">
                            <div className="profile-loading-spinner"></div>
                            <p>Loading...</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const journalScore = journalEntry && journalEntry.trim().length > 0 ? 100 : 0;

    return (
        <div className="daily-logs-page-wrapper">
            <div className="dashboard-section daily-logs-section">
                <div className="daily-logs-card">
                    <div className="flex gap-2 mb-4">
                        <button onClick={() => navigate('/Daily-Log')} className="btn-action">
                            <i className="i-lucide-arrow-left mr-1"></i>Back to Daily Log
                        </button>
                        <button onClick={() => navigate('/Daily-Log/History')} className="btn-action">
                            <i className="i-lucide-history mr-1"></i>View History
                        </button>
                    </div>

                    {/* Auto-save indicator */}
                    <div className="flex items-center justify-end gap-2 mb-2 text-xs opacity-60">
                        {saving ? (
                            <span><i className="i-lucide-loader animate-spin mr-1"></i>Saving...</span>
                        ) : lastSaved ? (
                            <span><i className="i-lucide-check mr-1" style={{ color: 'var(--color-primary)' }}></i>Saved {lastSaved.toLocaleTimeString()}</span>
                        ) : (
                            <span>Auto-saves as you type</span>
                        )}
                    </div>

                    {/* Journal Score */}
                    <div className="card mb-4">
                        <div className="card-body">
                            <div className="flex items-center justify-between">
                                <span className="form-label mb-0">Journal Score</span>
                                <span className="text-2xl font-bold" style={{ color: journalScore >= 80 ? 'var(--color-primary)' : journalScore > 0 ? '#ffa500' : 'var(--color-danger)' }}>
                                    {journalScore}/100
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Writing Tip */}
                    {showTips && (
                        <div className="card mb-4" style={{ background: 'rgba(0, 255, 166, 0.05)', borderColor: 'rgba(0, 255, 166, 0.2)' }}>
                            <div className="card-body">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 flex-1">
                                        <i className="i-lucide-lightbulb" style={{ color: 'var(--color-primary)', marginTop: '0.15rem' }}></i>
                                        <div>
                                            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>Writing Tip</div>
                                            <div className="text-xs opacity-80">{randomTip}</div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setShowTips(false)}
                                        className="text-xs opacity-50 hover:opacity-100"
                                        style={{ background: 'none', border: 'none', color: 'var(--color-light)', cursor: 'pointer' }}
                                    >
                                        <i className="i-lucide-x"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Journal Entry */}
                    <div className="card mb-4">
                        <div className="card-header">
                            <h3 className="card-title"><i className="i-lucide-file-text mr-2"></i>Journal Entry</h3>
                        </div>
                        <div className="card-body">
                            <div className="form-group">
                                <label className="form-label">How was your day?</label>
                                <textarea
                                    value={journalEntry}
                                    onChange={(e) => setJournalEntry(e.target.value)}
                                    className="form-control"
                                    rows={12}
                                    placeholder="Write your thoughts, reflections, or anything notable about today..."
                                />
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <div className="text-xs opacity-50">
                                    {journalEntry.length} characters
                                </div>
                                {!showTips && (
                                    <button 
                                        onClick={() => { setShowTips(true); refreshTip(); }}
                                        className="text-xs opacity-50 hover:opacity-100"
                                        style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer' }}
                                    >
                                        <i className="i-lucide-lightbulb mr-1"></i>Show tips
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default JournalPage;