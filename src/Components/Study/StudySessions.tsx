import React, { useState } from 'react';
import { Plus, SquarePen, Trash2, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useStudySessions, useSaveSession, useDeleteSession } from '../../hooks/useAcademic';
import type { StudySession } from '../../services/academicService';
import { todayString, addDays, isDateString } from '../../utils/dates';
import LoadingSpinner from '../LoadingSpinner';
import ConfirmModal from '../ConfirmModal';

const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest}m`;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

const StudySessions: React.FC = () => {
    const { data: sessions, isLoading } = useStudySessions();
    const saveSession = useSaveSession();
    const deleteSession = useDeleteSession();

    const [selectedDate, setSelectedDate] = useState(todayString());
    const [editing, setEditing] = useState<StudySession | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<StudySession | null>(null);

    const [sessionDate, setSessionDate] = useState(todayString());
    const [duration, setDuration] = useState('25');
    const [notes, setNotes] = useState('');

    const openCreate = () => {
        setEditing(null);
        setSessionDate(selectedDate);
        setDuration('25');
        setNotes('');
        setShowForm(true);
    };

    const openEdit = (session: StudySession) => {
        setEditing(session);
        setSessionDate(session.session_date);
        setDuration(String(session.duration_minutes));
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
                session_type: 'study',
                notes: notes.trim(),
                source: editing?.source ?? 'manual',
            },
            { onSuccess: () => setShowForm(false) },
        );
    };

    const daySessions = (sessions ?? []).filter(session => session.session_date === selectedDate && session.session_type !== 'break');

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
                        <div style={{ display: 'none' }}>
                            <input type="hidden" value="study" />
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
            <div className="books-top-bar" style={{ marginBottom: '0.5rem', flexWrap: 'nowrap' }}>
                <h3 className="card-title" style={{ margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>Study sessions</h3>
                <div className="daily-log-daynav" style={{ justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        className="daily-log-daynav-btn"
                        onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                        data-tip="Previous day"
                        aria-label="Previous day"
                    >
                        <ChevronLeft size={15} />
                    </button>
                    <label className="daily-log-daynav-btn" data-tip="Pick a day">
                        <Calendar size={14} aria-hidden="true" />
                        <span className="sr-only">Pick a day</span>
                        <input
                            type="date"
                            className="daily-log-daynav-input"
                            value={selectedDate}
                            onChange={event => {
                                if (isDateString(event.target.value)) setSelectedDate(event.target.value);
                            }}
                        />
                    </label>
                    <button
                        type="button"
                        className="daily-log-daynav-btn"
                        onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                        data-tip="Next day"
                        aria-label="Next day"
                        disabled={selectedDate >= todayString()}
                    >
                        <ChevronRight size={15} />
                    </button>
                    <button
                        type="button"
                        className="daily-log-daynav-btn"
                        onClick={() => setSelectedDate(todayString())}
                        data-tip="Today"
                        aria-label="Today"
                    >
                        <Calendar size={14} />
                    </button>
                    <button type="button" className="daily-log-daynav-btn" onClick={openCreate} data-tip="Add session">
                        <Plus size={14} />
                    </button>
                </div>
            </div>

            {isLoading ? (
                <LoadingSpinner />
            ) : daySessions.length === 0 ? (
                <div className="academic-empty" style={{ padding: '1rem 0' }}>
                    <span className="academic-empty__title">No sessions logged</span>
                    <span className="academic-empty__text">
                        Finish a timer run and it will be logged here.
                    </span>
                </div>
            ) : (
                <div className="academic-scroll" style={{ maxHeight: 260 }}>
                    {daySessions.map(session => (
                        <div key={session.id} className="course-row">
                            <div className="course-head">
                                <div className="course-head__text">
                                    <span className="course-title">{formatMinutes(session.duration_minutes)}</span>
                                    <span className="course-sub">
                                        {session.mode ? session.mode : ''}
                                    </span>
                                    {session.break_minutes ? (
                                        <span className="course-sub">
                                            {formatMinutes(session.break_minutes)} break
                                        </span>
                                    ) : null}
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
                    ))}
                </div>
            )}

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

export default StudySessions;