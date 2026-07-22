import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { getUserDailyLogs, deleteDailyLog, updateDailyLog } from '../services/dailyLogService';
import type { DailyLog } from '../services/dailyLogService';

const DailyLogHistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const [logs, setLogs] = useState<DailyLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState<DailyLog | null>(null);
    const [editTarget, setEditTarget] = useState<DailyLog | null>(null);

    // Edit form state
    const [editLoading, setEditLoading] = useState(false);
    const [editJournalEntry, setEditJournalEntry] = useState('');
    const [editMood, setEditMood] = useState('');
    const [editDailyScore, setEditDailyScore] = useState('');
    const [editSleepQuality, setEditSleepQuality] = useState('');
    const [editCalories, setEditCalories] = useState('');
    const [editWater, setEditWater] = useState('');
    const [editWeight, setEditWeight] = useState('');
    const [editBodyFat, setEditBodyFat] = useState('');

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

    const openEditModal = (log: DailyLog) => {
        setEditTarget(log);
        setEditJournalEntry(log.journal_entry || '');
        setEditMood(log.mood?.toString() || '');
        setEditDailyScore(log.daily_score?.toString() || '');
        setEditSleepQuality(log.sleep_quality?.toString() || '');
        setEditCalories(log.calories?.toString() || '');
        setEditWater(log.water?.toString() || '');
        setEditWeight(log.weight?.toString() || '');
        setEditBodyFat(log.body_fat?.toString() || '');
    };

    const closeEditModal = () => {
        setEditTarget(null);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTarget?.id) return;

        setEditLoading(true);
        try {
            await updateDailyLog(editTarget.id, {
                journal_entry: editJournalEntry || undefined,
                mood: editMood ? parseInt(editMood) : undefined,
                daily_score: editDailyScore ? parseFloat(editDailyScore) : undefined,
                sleep_quality: editSleepQuality ? parseInt(editSleepQuality) : undefined,
                calories: editCalories ? parseInt(editCalories) : undefined,
                water: editWater ? parseInt(editWater) : undefined,
                weight: editWeight ? parseFloat(editWeight) : undefined,
                body_fat: editBodyFat ? parseFloat(editBodyFat) : undefined,
            });

            await loadLogs();
            closeEditModal();
        } finally {
            setEditLoading(false);
        }
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadLogs();
    }, []);

    return (
        <>
            <Title title="Daily Log History" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Daily Log History</h2>
                        <span>View, edit, and manage all your daily logs</span>
                    </div>

                    <div className="flex gap-2 mb-4">
                        <button onClick={() => navigate('/Daily-Log')} className="btn-action">
                            <i className="i-lucide-plus mr-1"></i>New Log
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
                        <div className="flex flex-col gap-3">
                            {logs.map((log) => (
                                <div key={log.id} className="log-history-card">
                                    <div className="log-history-top">
                                        <div className="log-history-date">
                                            <i className="i-lucide-calendar mr-2"></i>
                                            {formatDate(log.log_date)}
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                onClick={() => openEditModal(log)}
                                                className="project-action-btn"
                                                title="Edit log"
                                                aria-label="Edit log"
                                            >
                                                <i className="fa-solid fa-pen-to-square"></i>
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

            {/* Edit Modal */}
            {editTarget && (
                <div className="import-modal-overlay" onClick={closeEditModal}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Edit Log - {formatDate(editTarget.log_date)}</h3>
                        <form onSubmit={handleEditSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Journal Entry</label>
                                <textarea
                                    value={editJournalEntry}
                                    onChange={(e) => setEditJournalEntry(e.target.value)}
                                    className="form-control"
                                    rows={3}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="col-span-2">
                                    <label className="form-label">Goals Snapshot</label>
                                    <pre className="form-control" style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                                        {editTarget?.goal_snapshot ? JSON.stringify(editTarget.goal_snapshot, null, 2) : 'No goals recorded'}
                                    </pre>
                                </div>
                                <div>
                                    <label className="form-label">Mood (1-10)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={editMood}
                                        onChange={(e) => setEditMood(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Daily Score</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={editDailyScore}
                                        onChange={(e) => setEditDailyScore(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Sleep Quality (0-10)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={editSleepQuality}
                                        onChange={(e) => setEditSleepQuality(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Calories</label>
                                    <input
                                        type="number"
                                        value={editCalories}
                                        onChange={(e) => setEditCalories(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Water (ml)</label>
                                    <input
                                        type="number"
                                        value={editWater}
                                        onChange={(e) => setEditWater(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Weight (kg)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={editWeight}
                                        onChange={(e) => setEditWeight(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Body Fat (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={editBodyFat}
                                        onChange={(e) => setEditBodyFat(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" onClick={closeEditModal} className="btn-form-cancel" disabled={editLoading}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-form-submit" disabled={editLoading}>
                                    {editLoading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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