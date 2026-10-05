import React, { useState } from 'react';
import { Plus, SquarePen, Trash2, Timer } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import LoadingSpinner from '../LoadingSpinner';
import { useStudySessions, useSaveSession, useDeleteSession } from '../../hooks/useAcademic';
import { todayString, addDays } from '../../utils/dates';
import type { StudySession } from '../../services/academicService';

const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest}m`;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

/** Secondary tab: logged study and break time. */
const SessionsPanel: React.FC = () => {
    const { data: sessions, isLoading } = useStudySessions();
    const saveSession = useSaveSession();
    const deleteSession = useDeleteSession();

    const [editing, setEditing] = useState<StudySession | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<StudySession | null>(null);

    const [sessionDate, setSessionDate] = useState(todayString());
    const [duration, setDuration] = useState('60');
    const [sessionType, setSessionType] = useState<'study' | 'break'>('study');
    const [notes, setNotes] = useState('');

    const openCreate = () => {
        setEditing(null);
        setSessionDate(todayString());
        setDuration('60');
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
            },
            { onSuccess: () => setShowForm(false) },
        );
    };

    const weekStart = addDays(todayString(), -6);
    const totalMinutes = (sessions ?? []).reduce((sum, s) => sum + s.duration_minutes, 0);
    const weekMinutes = (sessions ?? [])
        .filter(s => s.session_date >= weekStart && s.session_date <= todayString())
        .reduce((sum, s) => sum + s.duration_minutes, 0);

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
                    {formatMinutes(weekMinutes)} in the last 7 days · {formatMinutes(totalMinutes)} total
                </span>
            </div>

            <div className="academic-scroll">
                {isLoading ? (
                    <LoadingSpinner />
                ) : !sessions || sessions.length === 0 ? (
                    <div className="academic-empty">
                        <Timer size={32} className="academic-empty__icon" />
                        <span className="academic-empty__title">No sessions logged</span>
                        <span className="academic-empty__text">
                            Track how long you actually study alongside your grades.
                        </span>
                    </div>
                ) : (
                    sessions.map(session => (
                        <div key={session.id} className="course-row">
                            <div className="course-head">
                                <div className="course-head__text">
                                    <span className="course-title">{session.session_date}</span>
                                    <span className="course-sub">
                                        <span>{session.session_type}</span>
                                        <span>· {formatMinutes(session.duration_minutes)}</span>
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

export default SessionsPanel;
