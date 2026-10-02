import React, { useMemo, useState } from 'react';
import {
    CalendarCheck,
    Dumbbell,
    Pencil,
    RotateCcw,
    Search,
    Target,
    Trash2,
    TrendingUp,
    Trophy,
    X,
} from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import ExerciseNameInput from './ExerciseNameInput';
import InlineNumber from '../Academic/InlineNumber';
import {
    usePREntries,
    usePRHistory,
    useAddPREntry,
    useDeletePREntry,
    useRecordManualPR,
    useUpdatePRHistory,
    useDeletePRHistory,
    useClearPRHistory,
    useActiveTemplate,
    useSeedPRsFromTemplate,
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
    const seedTemplate = useSeedPRsFromTemplate();

    const [search, setSearch] = useState('');
    const [newName, setNewName] = useState('');
    const [removing, setRemoving] = useState<string | null>(null);

    const cards = useMemo(() => buildPRCards(entries, history), [entries, history]);

    // Tracked-with-no-record first: those are the ones needing attention.
    const sorted = useMemo(() => [...cards].sort((a, b) => {
        if (a.untracked !== b.untracked) return a.untracked ? -1 : 1;
        return a.entry.exercise_name.localeCompare(b.entry.exercise_name);
    }), [cards]);

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return sorted;
        return sorted.filter(card => card.entry.exercise_name.toLowerCase().includes(needle));
    }, [sorted, search]);

    const withRecord = cards.filter(card => !card.untracked).length;

    return (
        <>
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title"><Trophy size={12} />Records</h3>
                    {activeTemplate && (
                        <button
                            className="btn-action"
                            style={{ marginLeft: 'auto' }}
                            disabled={seedTemplate.isPending}
                            onClick={() => activeTemplate.id && seedTemplate.mutate(activeTemplate.id)}
                            title="Add every exercise in the active template"
                        >
                            <Target size={11} className="mr-1" />
                            From template
                        </button>
                    )}
                </div>
                <div className="card-body">
                    <div className="pr-toolbar">
                        <div className="search-container">
                            <div className="search-input-wrapper">
                                <Search className="search-input-icon" />
                                <input
                                    type="text"
                                    className="search-input"
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="Search"
                                    aria-label="Search tracked exercises"
                                />
                                {search && (
                                    <button
                                        className="search-clear-btn"
                                        onClick={() => setSearch('')}
                                        aria-label="Clear search"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <form
                            className="pr-toolbar__add"
                            onSubmit={event => {
                                event.preventDefault();
                                const trimmed = newName.trim();
                                if (!trimmed) return;
                                addEntry.mutate({ exercise_name: trimmed });
                                setNewName('');
                            }}
                        >
                            {/* Enter with nothing highlighted falls through to this
                                form, so a lift typed by hand submits here. */}
                            <ExerciseNameInput
                                value={newName}
                                onChange={setNewName}
                                className="form-control"
                                placeholder="Track a lift not in any template"
                            />
                        </form>
                    </div>

                    {cards.length === 0 ? (
                        <div className="workout-empty">
                            <p className="workout-empty__title">Nothing tracked yet</p>
                            <p className="workout-empty__text">
                                Import from a template, or add a lift you want to keep an eye on.
                            </p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="workout-empty">
                            <p className="workout-empty__title">No match</p>
                            <p className="workout-empty__text">Try a different search.</p>
                        </div>
                    ) : (
                        <div className="pr-grid">
                            {filtered.map(card => (
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
    const [dropping, setDropping] = useState<PRHistory | null>(null);
    const [resetting, setResetting] = useState(false);

    const delta = prDelta(card.history);
    const entryId = card.entry.id;
    const best = card.best;
    // `currentBestOf` hands back the winning row itself, which is the only place
    // the id of the record being displayed is available.
    const bestRow = best?.entry;

    return (
        <div className="card pr-card">
            <div className="card-header">
                <h3 className="card-title">{card.entry.exercise_name}</h3>
                {card.entry.source === 'template' && (
                    <span className="semester-meta" style={{ marginLeft: 'auto' }}>template</span>
                )}
                <button
                    className="btn-action"
                    style={{ padding: '0.2rem 0.35rem', marginLeft: card.entry.source === 'template' ? '0.3rem' : 'auto' }}
                    onClick={onRemove}
                    aria-label={`Stop tracking ${card.entry.exercise_name}`}
                >
                    <Trash2 size={12} />
                </button>
            </div>

            <div className="card-body">
                {best && bestRow ? (
                    bestRow.id && editing === bestRow.id ? (
                        <RecordEditor
                            row={bestRow}
                            weightUnit={weightUnit}
                            busy={updateRow.isPending}
                            onSave={updates => {
                                updateRow.mutate({ id: bestRow.id!, updates });
                                setEditing(null);
                            }}
                            onDelete={() => setDropping(bestRow)}
                            onCancel={() => setEditing(null)}
                        />
                    ) : (
                        <button
                            type="button"
                            className="pr-best"
                            onClick={() => bestRow.id && setEditing(bestRow.id)}
                            aria-label={`Edit your best ${card.entry.exercise_name}`}
                        >
                            <span className="pr-best__value">
                                {fromKg(best.weight, weightUnit)}{' '}
                                <span className="pr-best__unit">{weightUnit}</span>
                                {best.reps != null && <span className="pr-best__reps"> × {best.reps}</span>}
                            </span>
                            <span className="pr-best__meta">
                                {bestRow.workout_completion_id ? (
                                    <CalendarCheck size={10} aria-hidden="true" />
                                ) : (
                                    <Pencil size={10} aria-hidden="true" />
                                )}
                                {formatDayLabel(best.date)}
                            </span>
                            <Pencil className="pr-best__edit" size={12} aria-hidden="true" />
                        </button>
                    )
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

                {/* Entering a first record for an untracked lift. Once there is a
                    best, editing it above replaces this -- adding a second number
                    is a progression step, which is what the list below is for. */}
                {!best && (
                    <form
                        className="pr-entry-form"
                        onSubmit={event => {
                            event.preventDefault();
                            if (!entryId || !weight.trim()) return;
                            const parsed = Number(weight);
                            if (!Number.isFinite(parsed)) return;
                            recordMax.mutate({
                                pr_entry_id: entryId,
                                exercise_name: card.entry.exercise_name,
                                weight: toKg(parsed, weightUnit),
                                reps: reps.trim() ? Number(reps) : null,
                                workout_date: todayString(),
                            });
                            setWeight('');
                            setReps('');
                        }}
                    >
                        <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={weightUnit === 'kg' ? 0.5 : 1}
                            className="form-control"
                            style={{ padding: '0.3rem 0.45rem' }}
                            value={weight}
                            onChange={event => setWeight(event.target.value)}
                            placeholder={weightUnit}
                            aria-label={`Your best ${card.entry.exercise_name} weight`}
                        />
                        <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            className="form-control"
                            style={{ padding: '0.3rem 0.45rem' }}
                            value={reps}
                            onChange={event => setReps(event.target.value)}
                            placeholder="reps"
                            aria-label={`Your best ${card.entry.exercise_name} rep count`}
                        />
                        <button
                            type="submit"
                            className="btn-action"
                            disabled={!weight.trim() || !entryId || recordMax.isPending}
                        >
                            Set
                        </button>
                    </form>
                )}

                {card.history.length > 1 && (
                    <details className="pr-history">
                        <summary className="semester-meta">
                            Progression ({card.history.length})
                        </summary>
                        <div className="workout-rows" style={{ marginTop: '0.4rem' }}>
                            {card.history.map(row => (
                                row.id && editing === row.id ? (
                                    <RecordEditor
                                        key={row.id}
                                        row={row}
                                        weightUnit={weightUnit}
                                        busy={updateRow.isPending}
                                        onSave={updates => {
                                            updateRow.mutate({ id: row.id!, updates });
                                            setEditing(null);
                                        }}
                                        onDelete={() => setDropping(row)}
                                        onCancel={() => setEditing(null)}
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        className="workout-row pr-history__row"
                                        key={row.id}
                                        onClick={() => row.id && setEditing(row.id)}
                                        aria-label={`Edit the ${card.entry.exercise_name} record from ${formatDayLabel(row.workout_date)}`}
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
                                    </button>
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

/**
 * The editor for one record.
 *
 * Weight and reps commit on blur or Enter, the date on change. A record earned
 * from a logged session says so: correcting the record here corrects what you
 * claim your max is, and deliberately does not rewrite the session that produced
 * it, because that set is the evidence.
 */
const RecordEditor: React.FC<{
    row: PRHistory;
    weightUnit: WeightUnit;
    busy: boolean;
    onSave: (updates: { weight?: number | null; reps?: number | null; workout_date?: string | null }) => void;
    onDelete: () => void;
    onCancel: () => void;
}> = ({ row, weightUnit, busy, onSave, onDelete, onCancel }) => {
    const [date, setDate] = useState(row.workout_date);

    return (
        <div className="pr-editor">
            <div className="pr-editor__grid">
                <InlineNumber
                    value={row.weight != null ? fromKg(row.weight, weightUnit) : null}
                    min={0}
                    placeholder={weightUnit}
                    ariaLabel="Weight"
                    onCommit={display => onSave({
                        weight: display == null ? null : toKg(display, weightUnit),
                    })}
                />
                <InlineNumber
                    value={row.reps ?? null}
                    min={0}
                    placeholder="reps"
                    ariaLabel="Rep count"
                    onCommit={value => onSave({ reps: value })}
                />
                <input
                    type="date"
                    className="num-input"
                    value={date}
                    max={todayString()}
                    onChange={event => {
                        setDate(event.target.value);
                        if (event.target.value) onSave({ workout_date: event.target.value });
                    }}
                    aria-label="Date of this record"
                />
            </div>

            {row.workout_completion_id && (
                <p className="pr-editor__note">
                    <Dumbbell size={10} /> from a logged workout — the session itself is unchanged.
                </p>
            )}

            <div className="pr-editor__actions">
                <button className="btn-action" onClick={onDelete} disabled={busy}>
                    <Trash2 size={11} />Remove
                </button>
                <button className="btn-action" onClick={onCancel} disabled={busy}>
                    <X size={11} />Close
                </button>
            </div>
        </div>
    );
};

export default RecordsPanel;