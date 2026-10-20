import React, { useState } from 'react';
import { Plus, SquarePen, Trash2, Target } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useStudySessions, useSaveSession, useDeleteSession, useStudyGoal, useSaveStudyGoal } from '../../hooks/useAcademic';
import type { StudySession } from '../../services/academicService';
import { todayString, addDays } from '../../utils/dates';
import LoadingSpinner from '../LoadingSpinner';
import ConfirmModal from '../ConfirmModal';

const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest}m`;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

const StudyPanel: React.FC = () => {
    const { data: sessions, isLoading } = useStudySessions();
    const { data: goal } = useStudyGoal();
    const saveSession = useSaveSession();
    const deleteSession = useDeleteSession();
    const saveGoal = useSaveStudyGoal();

    const [editing, setEditing] = useState<StudySession | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<StudySession | null>(null);

    const [sessionDate, setSessionDate] = useState(todayString());
    const [duration, setDuration] = useState('25');
    const [sessionType, setSessionType] = useState<'study' | 'break'>('study');
    const [notes, setNotes] = useState('');

    const [localDaily, setLocalDaily] = useState<number | null>(null);
    const [localWeekly, setLocalWeekly] = useState<number | null>(null);
    const dailyGoal = localDaily ?? goal?.daily_goal_minutes ?? 60;
    const weeklyGoal = localWeekly ?? goal?.weekly_goal_minutes ?? 300;

    const openCreate = () => {
        setEditing(null);
        setSessionDate(todayString());
        setDuration('25');
        setSessionType('study');
        setNotes('');
        setShowForm(true);
    };

    const openEdit = (session: StudySession) => {
        setEditing(session);
        setSessionDate(session.session_date);
        setDuration(String(session.duration_minutes));
        setSessionType(session.session_type ?? 'study');
        setNotes(session.notes ?? '');
        setShowForm(true);
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const minutes = Number(duration);
        if (Number.isNaN(minutes) || minutes <= 0) return;

        saveSession.mutate(
            {
                id: editing?.id,
                user_id: editing?.user_id ?? '',
                session_date: sessionDate,
                duration_minutes: minutes,
                session_type: sessionType,
                notes: notes.trim(),
                source: 'manual',
            },
            { onSuccess: () => setShowForm(false) },
        );
    };

    const allSessions = sessions ?? [];
    const today = todayString();
    const weekStart = addDays(today, -6);


    const studyMinutesByDate = new Map<string, number>();
    for (const session of allSessions) {
        if (session.session_type === 'break') continue;
        studyMinutesByDate.set(
            session.session_date,
            (studyMinutesByDate.get(session.session_date) ?? 0) + session.duration_minutes,
        );
    }

    const todayMinutes = studyMinutesByDate.get(today) ?? 0;
    const weekMinutes = Array.from(studyMinutesByDate.entries())
        .filter(([date]) => date >= weekStart && date <= today)
        .reduce((sum, [, minutes]) => sum + minutes, 0);

    // Consecutive days ending today that meet the daily goal.
    let streak = 0;
    for (let i = 0; i < 365; i++) {
        const date = addDays(today, -i);
        if ((studyMinutesByDate.get(date) ?? 0) >= dailyGoal) streak++;
        else break;
    }

    const chartData = [];
    for (let i = 13; i >= 0; i--) {
        const date = addDays(today, -i);
        chartData.push({
            date: date.slice(5),
            minutes: studyMinutesByDate.get(date) ?? 0,
        });
    }

    const renderForm = () => (
        <div className="import-modal-overlay" onClick={() => { if (!saveSession.isPending) setShowForm(false); }}>
            <div className="import-modal-card" onClick={event => event.stopPropagation()}>
                <h3>{editing ? 'Edit Session' : 'Add Session'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="form-label">Date</label>
                            <input
                                type="date"
                                value={sessionDate}
                                onChange={event => setSessionDate(event.target.value)}
                                className="form-control"
                                required
                            />
                        </div>
                        <div>
                            <label className="form-label">Type</label>
                            <select
                                value={sessionType}
                                onChange={event => setSessionType(event.target.value as 'study' | 'break')}
                                className="form-select"
                            >
                                <option value="study">Study</option>
                                <option value="break">Break</option>
                            </select>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="form-label">Duration (minutes)</label>
                        <input
                            type="number"
                            step="any"
                            min={1}
                            value={duration}
                            onChange={event => setDuration(event.target.value)}
                            className="form-control"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="mb-4">
                        <label className="form-label">Notes</label>
                        <textarea
                            value={notes}
                            onChange={event => setNotes(event.target.value)}
                            className="form-control"
                            rows={2}
                            placeholder="What did you work on?"
                        />
                    </div>

                    <div className="flex gap-2 justify-end mt-5">
                        <button type="button" className="btn-form-cancel" onClick={() => setShowForm(false)}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-form-submit"
                            disabled={saveSession.isPending}
                        >
                            {saveSession.isPending ? 'Saving...' : editing ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

    return (
        <>
            <div className="books-top-bar">
                <button type="button" className="btn-action" onClick={openCreate}>
                    <Plus size={13} /> Add session
                </button>
                <span className="weight-badge weight-badge--empty">
                    Today {formatMinutes(todayMinutes)} · Week {formatMinutes(weekMinutes)} · Streak {streak}d
                </span>
            </div>

            {/* Goals */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header">
                    <h3 className="card-title">Study goals</h3>
                    <Target size={16} />
                </div>
                <div className="card-body">
                    <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                            <label className="form-label">Daily goal (min)</label>
                            <input
                                type="number"
                                min={1}
                                value={dailyGoal}
                                onChange={event => setLocalDaily(Number(event.target.value) || 0)}
                                className="form-control"
                            />
                        </div>
                        <div>
                            <label className="form-label">Weekly goal (min)</label>
                            <input
                                type="number"
                                min={1}
                                value={weeklyGoal}
                                onChange={event => setLocalWeekly(Number(event.target.value) || 0)}
                                className="form-control"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            className="btn-form-submit"
                            disabled={saveGoal.isPending}
                            onClick={() => saveGoal.mutate({ daily_goal_minutes: dailyGoal, weekly_goal_minutes: weeklyGoal })}
                        >
                            {saveGoal.isPending ? 'Saving...' : 'Save goals'}
                        </button>
                    </div>
                    <div style={{ marginTop: '0.75rem' }}>
                        <div className="form-label">Today progress</div>
                        <div style={{ background: 'var(--border, #e5e7eb)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                            <div
                                style={{
                                    width: `${Math.min(100, (todayMinutes / Math.max(1, dailyGoal)) * 100)}%`,
                                    background: 'var(--chart-primary, #3b82f6)',
                                    height: '100%',
                                }}
                            />
                        </div>
                        <div className="timer-empty-hint" style={{ marginTop: 4 }}>
                            {todayMinutes} / {dailyGoal} min
                        </div>
                    </div>
                </div>
            </div>

            {/* Analytics */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header">
                    <h3 className="card-title">Last 14 days</h3>
                </div>
                <div className="card-body" style={{ height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar dataKey="minutes" fill="var(--chart-primary, #3b82f6)" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Sessions */}
            <div className="academic-scroll">
                {isLoading ? (
                    <LoadingSpinner />
                ) : allSessions.length === 0 ? (
                    <div className="academic-empty">
                        <Target size={32} className="academic-empty__icon" />
                        <span className="academic-empty__title">No sessions logged</span>
                        <span className="academic-empty__text">
                            Finish a timer run or add one manually.
                        </span>
                    </div>
                ) : (
                    allSessions.map(session => (
                        <div key={session.id} className="course-row">
                            <div className="course-head">
                                <div className="course-head__text">
                                    <span className="course-title">{session.session_date}</span>
                                    <span className="course-sub">
                                        <span>{session.session_type}</span>
                                        <span> · {formatMinutes(session.duration_minutes)}</span>
                                        {session.mode ? <span> · {session.mode}</span> : null}
                                        {session.source ? <span> · {session.source}</span> : null}
                                    </span>
                                    {session.notes && (
                                        <span className="course-empty-note" style={{ marginTop: 0.3 }}>
                                            {session.notes}
                                        </span>
                                    )}
                                </div>

                                <span className="flex gap-1">
                                    <button
                                        type="button"
                                        className="book-action-btn"
                                        onClick={() => openEdit(session)}
                                        data-tip="Edit session"
                                    >
                                        <SquarePen />
                                    </button>
                                    <button
                                        type="button"
                                        className="book-action-btn book-action-btn--danger"
                                        onClick={() => setDeleteTarget(session)}
                                        data-tip="Delete session"
                                    >
                                        <Trash2 />
                                    </button>
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {showForm && renderForm()}

            <ConfirmModal
                open={!!deleteTarget}
                title={`Delete session from ${deleteTarget?.session_date ?? ''}?`}
                confirmLabel="Delete"
                danger
                busy={deleteSession.isPending}
                onConfirm={() => {
                    if (deleteTarget?.id) deleteSession.mutate(deleteTarget.id);
                    setDeleteTarget(null);
                }}
                onCancel={() => setDeleteTarget(null)}
            />
        </>
    );
};

export default StudyPanel;