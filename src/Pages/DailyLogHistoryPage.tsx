import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Title from '../Components/Title';
import { deleteDailyLog } from '../services/dailyLogService';
import type { DailyLog } from '../services/dailyLogService';
import { useDailyLogs } from '../hooks/useDailyLogs';
import { queryKeys } from '../utils/queryKeys';
import { getScoreColor } from '../utils/dailyScoring';

const DailyLogHistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { logs } = useDailyLogs();
    const [deleteTarget, setDeleteTarget] = useState<DailyLog | null>(null);

    const handleDelete = async () => {
        if (!deleteTarget?.id) return;
        await deleteDailyLog(deleteTarget.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
        setDeleteTarget(null);
    };

    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr + 'T00:00:00');
            return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const renderLogChips = (log: DailyLog) => {
        const chips: { label: string; value: string }[] = [];
        if (log.no_sleep) chips.push({ label: 'Sleep', value: 'No sleep' });
        if (log.wake_time) chips.push({ label: 'Wake', value: log.wake_time });
        if (log.bedtime) chips.push({ label: 'Bed', value: log.bedtime });
        if (log.sleep_duration) chips.push({ label: 'Sleep', value: `${log.sleep_duration}h` });
        if (log.sleep_quality != null) chips.push({ label: 'Sleep Q', value: `${log.sleep_quality}/10` });
        if (log.morning_systolic && log.morning_diastolic) chips.push({ label: 'AM BP', value: `${log.morning_systolic}/${log.morning_diastolic}` });
        if (log.evening_systolic && log.evening_diastolic) chips.push({ label: 'PM BP', value: `${log.evening_systolic}/${log.evening_diastolic}` });
        if (log.morning_bpm) chips.push({ label: 'AM BPM', value: String(log.morning_bpm) });
        if (log.body_temperature) chips.push({ label: 'Temp', value: `${log.body_temperature}°C` });
        if (log.calories) chips.push({ label: 'Calories', value: String(log.calories) });
        if (log.protein) chips.push({ label: 'Protein', value: `${log.protein}g` });
        if (log.carbs) chips.push({ label: 'Carbs', value: `${log.carbs}g` });
        if (log.fat) chips.push({ label: 'Fat', value: `${log.fat}g` });
        if (log.water) chips.push({ label: 'Water', value: `${log.water}ml` });
        if (log.weight) chips.push({ label: 'Weight', value: `${log.weight}kg` });
        if (log.body_fat) chips.push({ label: 'Body Fat', value: `${log.body_fat}%` });
        if (log.mood) chips.push({ label: 'Mood', value: `${log.mood}/10` });
        const habits = [
            log.morning_routine, log.evening_routine, log.fruit_serving,
            log.studied, log.stretching, log.reading, log.journal, log.project_work_done,
        ].filter(Boolean).length;
        if (habits > 0) chips.push({ label: 'Habits', value: `${habits}/8` });
        return chips;
    };

    return (
        <>
            <Title title="Daily Log History" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Daily Log History</h2>
                    </div>

                    <div className="flex gap-2 mb-4">
                        <button onClick={() => navigate('/Daily-Log')} className="btn-action">Today's Log</button>
                    </div>

                    {logs === null ? (
                        <div className="profile-loading">
                            <div className="profile-loading-spinner"></div>
                            <p>Loading logs...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="projects-empty">
                            <p className="projects-empty-title">No logs yet</p>
                            <p className="projects-empty-text">Start by creating your first daily log entry.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 items-center">
                            {logs.map((log) => {
                                const chips = renderLogChips(log);
                                return (
                                    <div key={log.id} className="log-history-card">
                                        <div className="log-history-top">
                                            <div className="log-history-date">
                                                {formatDate(log.log_date)}
                                            </div>
                                            {log.daily_score != null && (
                                                <span
                                                    className="log-history-score"
                                                    style={{ color: getScoreColor(log.daily_score), borderColor: getScoreColor(log.daily_score) }}
                                                >
                                                    {log.daily_score}/100
                                                </span>
                                            )}
                                        </div>

                                        {chips.length > 0 && (
                                            <div className="log-history-chips">
                                                {chips.map(chip => (
                                                    <span key={chip.label} className="log-history-chip">
                                                        <span className="log-history-chip-label">{chip.label}</span>
                                                        <span className="log-history-chip-value">{chip.value}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {log.journal_entry && (
                                            <p className="log-history-journal-preview">
                                                {log.journal_entry.length > 160
                                                    ? log.journal_entry.substring(0, 160) + '...'
                                                    : log.journal_entry}
                                            </p>
                                        )}

                                        <div className="log-history-actions">
                                            <button
                                                onClick={() => navigate(`/Daily-Log/Edit/${log.id}`)}
                                                className="log-history-action"
                                                title="Edit log"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => navigate(`/Journal/Edit/${log.id}`)}
                                                className="log-history-action"
                                                title="Edit journal"
                                            >
                                                Journal
                                            </button>
                                            <button
                                                onClick={() => setDeleteTarget(log)}
                                                className="log-history-action log-history-action--danger"
                                                title="Delete log"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
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