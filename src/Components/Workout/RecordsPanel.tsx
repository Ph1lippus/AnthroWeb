import React, { useMemo, useState } from 'react';
import {
    Pencil,
    Plus,
    RotateCcw,
    Trash2,
    TrendingUp,
    Trophy,
} from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import ExerciseNameInput from './ExerciseNameInput';
import {
    useActiveTemplate,
    usePREntries,
    usePRHistory,
    useAddPREntry,
    useDeletePREntry,
    useRecordManualPR,
    useUpdatePRHistory,
    useDeletePRHistory,
    useClearPRHistory,
} from '../../hooks/useWorkouts';
import { useUserSettings } from '../../hooks/useUserSettings';
import { buildPRCards, prDelta, type PRCard as PRCardData } from '../../utils/prs';
import type { PRHistory } from '../../services/workoutService';
import { fromKg, toKg, type WeightUnit } from '../../utils/units';
import { formatDayLabel, todayString } from '../../utils/dates';

/**
 * Personal records: what you track, what you have actually done, and both of
 * them editable.
 *
 * "What you track" is a list of exercises, seeded from a template or added by
 * hand for lifts that are not in one. "What you have done" is the times you beat
 * a weight. Keeping them as two lists rather than one is what lets an exercise
 * sit here with no record yet -- a question waiting to be answered rather than a
 * failure to load.
 *
 * The number on a card is the heaviest row it holds, re-derived on every render
 * rather than stored, so editing a record can never leave a stale figure behind:
 * lower the current best and whatever is genuinely second-best is promoted. A
 * record entered by hand and one a logged session earned are the same kind of
 * thing to read, but only the second is evidence, so editing one does not
 * rewrite the session it came from and says so.
 */
const RecordsPanel: React.FC = () => {
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';
    const { data: entries = [] } = usePREntries();
    const { data: history = [] } = usePRHistory();
    const { activeTemplate } = useActiveTemplate();
    const addEntry = useAddPREntry();
    const removeEntry = useDeletePREntry();

    const [newName, setNewName] = useState('');
    /* Kept so a library pick can hand its id to the PR row. Without it the entry
       was written with `exercise_id: null`, which is the same missing join that
       left muscle groups unreachable from a logged session. */
    const [newExerciseId, setNewExerciseId] = useState<string | null>(null);
    const [removing, setRemoving] = useState<string | null>(null);

    const cards = useMemo(() => buildPRCards(entries, history), [entries, history]);

    // Tracked-with-no-record first: those are the ones needing attention.
    const sorted = useMemo(() => [...cards].sort((a, b) => {
        if (a.untracked !== b.untracked) return a.untracked ? -1 : 1;
        return a.entry.exercise_name.localeCompare(b.entry.exercise_name);
    }), [cards]);

    const withRecord = cards.filter(card => !card.untracked).length;

    /** Exercises from the active template (strength & cardio only) that have no PR entry yet. */
    const missingFromTemplate = useMemo(() => {
        if (!activeTemplate?.days) return [];
        const trackedNames = new Set(entries.map(e => e.exercise_name.trim().toLowerCase()));
        return activeTemplate.days.filter(
            ex =>
                (ex.activity_type === 'strength' || ex.activity_type === 'cardio') &&
                !trackedNames.has(ex.exercise_name.trim().toLowerCase())
        );
    }, [activeTemplate?.days, entries]);

    const addMissingFromTemplate = async () => {
        for (const ex of missingFromTemplate) {
            await addEntry.mutateAsync({
                exercise_id: ex.exercise_id ?? null,
                exercise_name: ex.exercise_name,
                source: 'template',
            });
        }
    };

    return (
        <>
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title"><Trophy size={12} />Records</h3>
                </div>
                <div className="card-body">
                    <div className="pr-toolbar">
                        <form
                            className="pr-toolbar__add"
                            onSubmit={event => {
                                event.preventDefault();
                                const trimmed = newName.trim();
                                if (!trimmed) return;
                                addEntry.mutate({ exercise_name: trimmed, exercise_id: newExerciseId });
                                setNewName('');
                                setNewExerciseId(null);
                            }}
                        >
                            {/* Enter with nothing highlighted falls through to this
                                form, so a lift typed by hand submits here. */}
                            <ExerciseNameInput
                                value={newName}
                                onChange={value => {
                                    setNewName(value);
                                    // A different name is a different exercise, so the
                                    // id picked for the old one no longer applies.
                                    setNewExerciseId(null);
                                }}
                                onPick={picked => setNewExerciseId(picked.exercise_id ?? null)}
                                className="form-control"
                                placeholder="Track a lift not in any template"
                            />
                        </form>
                        {/* Add every strength & cardio exercise from the active template
                            that has no PR entry yet. */}
                        <button
                            type="button"
                            className="btn-action"
                            onClick={addMissingFromTemplate}
                            disabled={missingFromTemplate.length === 0}
                            title="Add every strength & cardio exercise from the active template that has no record yet"
                        >
                            <Plus size={12} /> Add from template ({missingFromTemplate.length})
                        </button>
                    </div>

                    {cards.length === 0 ? (
                        <div className="workout-empty">
                            <p className="workout-empty__title">Nothing tracked yet</p>
                            <p className="workout-empty__text">
                                Import from a template, or add a lift you want to keep an eye on.
                            </p>
                        </div>
                    ) : (
                        <div className="pr-grid">
                            {sorted.map(card => (
                                <RecordCard
                                    key={card.entry.id}
                                    card={card}
                                    weightUnit={weightUnit}
                                    onRemove={() => setRemoving(card.entry.id!)}
                                />
                            ))}
                        </div>
                    )}

                    {cards.length > withRecord && (
                        <p className="workout-empty__text" style={{ marginTop: '0.6rem' }}>
                            {cards.length - withRecord} tracked without a max yet — those sort first.
                        </p>
                    )}
                </div>
            </div>

            <ConfirmModal
                open={!!removing}
                title="Stop tracking this record?"
                description="Its history is deleted with it. Workouts you logged are not affected."
                confirmLabel="Stop tracking"
                danger
                onConfirm={() => {
                    if (removing) removeEntry.mutate(removing);
                    setRemoving(null);
                }}
                onCancel={() => setRemoving(null)}
            />
        </>
    );
};

/**
 * One exercise: its best, how far that has moved, and a way in to correct it.
 *
 * Clicking the number opens the editor on that row; so does clicking any row in
 * the progression list, because the mistake is as likely to be in an older entry
 * as in the current one.
 */
const RecordCard: React.FC<{
    card: PRCardData;
    weightUnit: WeightUnit;
    onRemove: () => void;
}> = ({ card, weightUnit, onRemove }) => {
    const recordMax = useRecordManualPR();
    const updateRow = useUpdatePRHistory();
    const deleteRow = useDeletePRHistory();
    const clearRows = useClearPRHistory();

    const [weight, setWeight] = useState('');
    const [reps, setReps] = useState('');
    const [editing, setEditing] = useState<string | null>(null);
    const [progressOpen, setProgressOpen] = useState(false);
    const [currentWeight, setCurrentWeight] = useState('');
    const [currentSets, setCurrentSets] = useState('');
    const [currentDate, setCurrentDate] = useState('');
    const [progressDate, setProgressDate] = useState(todayString());
    const [dropping, setDropping] = useState<PRHistory | null>(null);
    const [resetting, setResetting] = useState(false);

    const delta = prDelta(card.history);
    const entryId = card.entry.id;
    const best = card.best;
    // `currentBestOf` hands back the winning row itself, which is the only place
    // the id of the record being displayed is available.
    const bestRow = best?.entry;
    const previous = card.history
        .filter(row => row.id !== bestRow?.id)
        .sort((a, b) => b.workout_date.localeCompare(a.workout_date))[0];
    const openEdit = (row: PRHistory) => {
        setEditing(row.id ?? null);
        setCurrentWeight(row.weight == null ? '' : String(fromKg(row.weight, weightUnit)));
        setCurrentSets(row.reps == null ? '' : String(row.reps));
        setCurrentDate(row.workout_date);
        setWeight('');
        setReps('');
        setProgressDate(todayString());
    };

    return (
        <div className="card pr-card">
            <div className="card-header">
                <h3 className="card-title">{card.entry.exercise_name}</h3>
                {card.entry.source === 'template' && (
                    <span className="semester-meta" style={{ marginLeft: 'auto' }}>template</span>
                )}
                {entryId && (
                    <button
                        type="button"
                        className="btn-action"
                        style={{ padding: '0.2rem 0.35rem', marginLeft: card.entry.source === 'template' ? '0.3rem' : 'auto' }}
                        onClick={() => bestRow ? openEdit(bestRow) : setProgressOpen(true)}
                        aria-label={`Edit ${card.entry.exercise_name}`}
                    >
                        <Pencil size={12} />
                    </button>
                )}
                <button
                    className="btn-action"
                    style={{ padding: '0.2rem 0.35rem', marginLeft: '0.3rem' }}
                    onClick={onRemove}
                    aria-label={`Stop tracking ${card.entry.exercise_name}`}
                >
                    <Trash2 size={12} />
                </button>
            </div>

            <div className="card-body">
                {best && bestRow ? (
                    <div className="pr-best">
                            <span className="pr-best__value">
                                {fromKg(best.weight, weightUnit)}{' '}
                                <span className="pr-best__unit">{weightUnit}</span>
                                {best.reps != null && <span className="pr-best__reps"> × {best.reps}</span>}
                            </span>
                            <span className="pr-best__meta">
                                {formatDayLabel(best.date)}
                            </span>
                    </div>
                ) : (
                    <p className="form-label" style={{ marginBottom: '0.5rem' }}>
                        No max recorded yet. Enter what you have lifted before — it becomes the number
                        every later session is measured against.
                    </p>
                )}

                {delta && delta.kg > 0 && (
                    <p className="pr-delta">
                        <TrendingUp size={10} /> +{fromKg(delta.kg, weightUnit)} {weightUnit} since{' '}
                        {formatDayLabel(delta.fromDate)}
                    </p>
                )}
                {previous && (
                    <p className="semester-meta">
                        Previous: {previous.weight != null ? `${fromKg(previous.weight, weightUnit)} ${weightUnit}` : '—'}
                        {previous.reps != null && ` · ${previous.reps} sets`}
                    </p>
                )}

                {/* Entering a first record for an untracked lift. Once there is a
                    best, editing it above replaces this -- adding a second number
                    is a progression step, which is what the list below is for. */}
                {card.history.length > 1 && (
                    <details className="pr-history">
                        <summary className="semester-meta">
                            Progression ({card.history.length})
                        </summary>
                        <div className="workout-rows" style={{ marginTop: '0.4rem' }}>
                            {card.history.map(row => (
                                (
                                    <div
                                        className="workout-row pr-history__row"
                                        key={row.id}
                                    >
                                        <span className="workout-row__name" style={{ fontSize: '0.65rem' }}>
                                            {formatDayLabel(row.workout_date)}
                                            {row.id === bestRow?.id && ' · current'}
                                        </span>
                                        <span className="workout-row__value" style={{ fontSize: '0.65rem' }}>
                                            {row.weight != null
                                                ? `${fromKg(row.weight, weightUnit)} ${weightUnit}`
                                                : '—'}
                                            {row.reps != null && ` × ${row.reps}`}
                                        </span>
                                    </div>
                                )
                            ))}
                        </div>
                    </details>
                )}

                {card.history.length > 1 && entryId && (
                    <button className="btn-action pr-reset" onClick={() => setResetting(true)}>
                        <RotateCcw size={11} />Reset all {card.history.length}
                    </button>
                )}
            </div>

            <ConfirmModal
                open={!!dropping}
                title="Remove this record?"
                description={
                    dropping?.workout_completion_id
                        ? 'It came from a logged workout. The session itself is not changed.'
                        : 'This number will be gone. Any other records for this lift are kept.'
                }
                confirmLabel="Remove"
                danger
                onConfirm={() => {
                    if (dropping?.id) deleteRow.mutate(dropping.id);
                    setDropping(null);
                    setEditing(null);
                }}
                onCancel={() => { setDropping(null); setEditing(null); }}
            />

            {(editing || progressOpen) && (() => {
                const row = card.history.find(item => item.id === editing);
                return row ? (
                    <div className="import-modal-overlay" onMouseDown={event => {
                        if (event.target === event.currentTarget && !updateRow.isPending) setEditing(null);
                    }}>
                        <div className="import-modal-card">
                            <form onSubmit={event => {
                                event.preventDefault();
                                const parsedWeight = Number(currentWeight);
                                const parsedSets = Number(currentSets);
                                if (!Number.isFinite(parsedWeight) || !Number.isFinite(parsedSets)) return;
                                updateRow.mutate({ id: row.id!, updates: {
                                    weight: toKg(parsedWeight, weightUnit),
                                    reps: parsedSets,
                                    workout_date: currentDate || null,
                                }});
                                if (entryId && weight.trim() && reps.trim()) {
                                    const progressWeight = Number(weight);
                                    const progressSets = Number(reps);
                                    if (Number.isFinite(progressWeight) && Number.isFinite(progressSets)) {
                                        recordMax.mutate({
                                            pr_entry_id: entryId,
                                            exercise_name: card.entry.exercise_name,
                                            weight: toKg(progressWeight, weightUnit),
                                            reps: progressSets,
                                            workout_date: progressDate,
                                        });
                                    }
                                }
                                setEditing(null);
                                setWeight('');
                                setReps('');
                            }}>
                                <h3>Edit Record</h3>
                                <h4>Current record</h4>
                                <div className="pr-editor__grid">
                                    <label className="form-label">Weight ({weightUnit})
                                        <input className="form-control" type="number" min={0} step="0.5" value={currentWeight} onChange={event => setCurrentWeight(event.target.value)} required />
                                    </label>
                                    <label className="form-label">Sets
                                        <input className="form-control" type="number" min={1} step={1} value={currentSets} onChange={event => setCurrentSets(event.target.value)} required />
                                    </label>
                                </div>
                                <label className="form-label" style={{ display: 'block', marginTop: '0.5rem' }}>Date
                                    <input className="form-control" type="date" value={currentDate} max={todayString()} onChange={event => setCurrentDate(event.target.value)} required />
                                </label>
                                <h4 style={{ marginTop: '0.75rem' }}>Add progress</h4>
                                <div className="pr-editor__grid">
                                    <label className="form-label">Weight ({weightUnit})
                                        <input className="form-control" type="number" min={0} step="0.5" value={weight} onChange={event => setWeight(event.target.value)} />
                                    </label>
                                    <label className="form-label">Sets
                                        <input className="form-control" type="number" min={1} step={1} value={reps} onChange={event => setReps(event.target.value)} />
                                    </label>
                                </div>
                                <label className="form-label" style={{ display: 'block', marginTop: '0.5rem' }}>Date
                                    <input className="form-control" type="date" value={progressDate} max={todayString()} onChange={event => setProgressDate(event.target.value)} required />
                                </label>
                                <div className="exercise-create-actions">
                                    <button type="button" className="btn-form-cancel" onClick={() => setEditing(null)}>Cancel</button>
                                    <button type="submit" className="btn-form-submit" disabled={updateRow.isPending || recordMax.isPending}>Save</button>
                                </div>
                            </form>
                        </div>
                    </div>
                ) : progressOpen && entryId ? (
                    <div className="import-modal-overlay">
                        <div className="import-modal-card">
                            <ProgressForm
                                weightUnit={weightUnit}
                                weight={weight}
                                sets={reps}
                                date={progressDate}
                                busy={recordMax.isPending}
                                onWeightChange={setWeight}
                                onSetsChange={setReps}
                                onDateChange={setProgressDate}
                                onCancel={() => setProgressOpen(false)}
                                onSubmit={() => {
                                    const parsed = Number(weight);
                                    const parsedSets = Number(reps);
                                    if (!Number.isFinite(parsed) || !Number.isFinite(parsedSets)) return;
                                    recordMax.mutate({
                                        pr_entry_id: entryId,
                                        exercise_name: card.entry.exercise_name,
                                        weight: toKg(parsed, weightUnit),
                                        reps: parsedSets,
                                        workout_date: progressDate,
                                    }, { onSuccess: () => { setWeight(''); setReps(''); setProgressOpen(false); } });
                                }}
                            />
                        </div>
                    </div>
                ) : null;
            })()}

            <ConfirmModal
                open={resetting}
                title="Reset every record for this lift?"
                description="All of its records are deleted. Workouts you logged are not affected."
                confirmLabel="Reset all"
                danger
                onConfirm={() => {
                    if (entryId) clearRows.mutate(entryId);
                    setResetting(false);
                }}
                onCancel={() => setResetting(false)}
            />
        </div>
    );
};

const ProgressForm: React.FC<{
    weightUnit: WeightUnit;
    weight: string;
    sets: string;
    date: string;
    busy: boolean;
    onWeightChange: (value: string) => void;
    onSetsChange: (value: string) => void;
    onDateChange: (value: string) => void;
    onCancel: () => void;
    onSubmit: () => void;
}> = ({ weightUnit, weight, sets, date, busy, onWeightChange, onSetsChange, onDateChange, onCancel, onSubmit }) => (
    <div className="pr-editor__grid">
        <label className="form-label">Weight ({weightUnit})
            <input className="form-control" type="number" min={0} step="0.5" value={weight} onChange={event => onWeightChange(event.target.value)} />
        </label>
        <label className="form-label" style={{ gridColumn: '1 / -1' }}>Date
            <input className="form-control" type="date" value={date} max={todayString()} onChange={event => onDateChange(event.target.value)} />
        </label>
        <label className="form-label">Sets
            <input className="form-control" type="number" min={1} step={1} value={sets} onChange={event => onSetsChange(event.target.value)} />
        </label>
        <div className="exercise-create-actions">
            <button type="button" className="btn-form-cancel" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn-form-submit" disabled={busy} onClick={onSubmit}>Save</button>
        </div>
    </div>
);

export default RecordsPanel;