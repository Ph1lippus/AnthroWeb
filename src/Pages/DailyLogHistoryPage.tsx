import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { getUserDailyLogs, deleteDailyLog } from '../services/dailyLogService';
import type { DailyLog } from '../services/dailyLogService';

const DailyLogHistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const [logs, setLogs] = useState<DailyLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState<DailyLog | null>(null);

    const loadLogs = async () => {
        setLoading(true);
        const data = await getUserDailyLogs();
        setLogs(data);
        setLoading(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.id) return;
        await deleteDailyLog(deleteTarget.id);
        await loadLogs();
        setDeleteTarget(null);
    };

    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const renderLogSummary = (log: DailyLog) => {
        const items: string[] = [];
        if (log.sleep_duration) items.push(`Sleep: ${log.sleep_duration}h`);
        if (log.calories) items.push(`Calories: ${log.calories}`);
        if (log.morning_systolic && log.morning_diastolic) items.push(`BP: ${log.morning_systolic}/${log.morning_diastolic}`);
        if (log.weight) items.push(`Weight: ${log.weight}kg`);
        if (log.mood) items.push(`Mood: ${log.mood}/10`);
        if (log.sleep_quality !== undefined) items.push(`Sleep Q: ${log.sleep_quality}/10`);

        return items.length > 0 ? items.join(' • ') : 'No metrics recorded';
    };

    useEffect(() => {
        loadLogs();
    }, []);

    return (
        <>
            <Title title="Daily Log History" />
            <div style={{ width: '100%', padding: '0.75rem', paddingTop: '3rem', paddingBottom: 'calc(0.75rem + 3rem)' }}>
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Daily Log History</h2>
                        <span>View, edit, and manage all your daily logs</span>
                    </div>

                    <div className="flex gap-2 mb-4">
                        <button onClick={() => navigate('/Daily-Log')} className="btn-action">
                            <i className="i-lucide-arrow-left mr-1"></i>Today's Log
                        </button>
                    </div>

                    {loading ? (
                        <div className="profile-loading">
                            <div className="profile-loading-spinner"></div>
                            <p>Loading logs...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="projects-empty">
                            <i className="i-lucide-file-x projects-empty-icon"></i>
                            <p className="projects-empty-title">No logs yet</p>
                            <p className="projects-empty-text">Start by creating your first daily log entry.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 items-center">
                            {logs.map((log) => (
                                <div key={log.id} className="log-history-card">
                                    <div className="log-history-top">
                                        <div className="log-history-date">
                                            <i className="i-lucide-calendar mr-2"></i>
                                            {formatDate(log.log_date)}
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                onClick={() => navigate(`/Daily-Log/Edit/${log.id}`)}
                                                className="project-action-btn"
                                                title="Edit log"
                                                aria-label="Edit log"
                                            >
                                                <i className="fa-solid fa-pen-to-square"></i>
                                            </button>
                                            <button
                                                onClick={() => navigate(`/Journal/Edit/${log.id}`)}
                                                className="project-action-btn"
                                                title="Edit journal"
                                                aria-label="Edit journal"
                                            >
                                                <i className="fa-solid fa-pen-fancy"></i>
                                            </button>
                                            <button
                                                onClick={() => setDeleteTarget(log)}
                                                className="project-action-btn project-action-btn--danger"
                                                title="Delete log"
                                                aria-label="Delete log"
                                            >
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <p className="log-history-summary">{renderLogSummary(log)}</p>

                                    {log.journal_entry && (
                                        <p className="log-history-journal-preview">
                                            {log.journal_entry.length > 120
                                                ? log.journal_entry.substring(0, 120) + '...'
                                                : log.journal_entry}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="import-modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="import-modal-card delete-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Log</h3>
                        <p className="delete-modal-text">
                            Are you sure you want to delete the log from <strong>{formatDate(deleteTarget.log_date)}</strong>?
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-center mt-5">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="btn-form-cancel"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="btn-form-submit btn-form-submit--danger"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DailyLogHistoryPage;
