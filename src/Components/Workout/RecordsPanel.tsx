import React, { useMemo, useState } from 'react';
import { Plus, Search, Target, Trash2, TrendingUp, Trophy, X } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import ExerciseNameInput from './ExerciseNameInput';
import {
    usePREntries,
    usePRHistory,
    useAddPREntry,
    useDeletePREntry,
    useRecordManualPR,
    useActiveTemplate,
    useSeedPRsFromTemplate,
} from '../../hooks/useWorkouts';
import { useUserSettings } from '../../hooks/useUserSettings';
import { buildPRCards, prDelta, type PRCard as PRCardData } from '../../utils/prs';
import { fromKg, toKg, type WeightUnit } from '../../utils/units';
import { formatDayLabel } from '../../utils/dates';

interface RecordsPanelProps {
    /** Full grid with search and add, or the compact card for the right rail. */
    expanded: boolean;
    onExpand: () => void;
    onCollapse: () => void;
}

/**
 * Personal records: what you track, and what you have actually done.
 *
 * "What you track" is a list of exercises, seeded from a template or added by
 * hand for lifts that are not in one. "What you have done" is the times you beat
 * a weight. Keeping them as two lists rather than one is what lets an exercise
 * sit here with no record yet -- a question waiting to be answered rather than a
 * failure to load.
 *
 * A record is the heaviest set on record. Entering one by hand is how a lift from
 * before the app gets recorded; logging a heavier set later adds another row,
 * and the card shows the best of them.
 */
const RecordsPanel: React.FC<RecordsPanelProps> = ({ expanded, onExpand, onCollapse }) => {
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
    const shown = expanded ? filtered : sorted.filter(card => !card.untracked).slice(0, 5);

    return (
        <>
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title"><Trophy size={12} />Records</h3>
                    {expanded ? (
                        <button className="btn-action" style={{ marginLeft: 'auto' }} onClick={onCollapse}>
                            Close
                        </button>
                    ) : (
                        <button className="btn-action" style={{ marginLeft: 'auto' }} onClick={onExpand}>
                            See all {cards.length}
                        </button>
                    )}
                </div>
                <div className="card-body">
                    {expanded && (
                        <>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                                <div className="search-container" style={{ flex: 1, minWidth: '9rem' }}>
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
                                {activeTemplate && (
                                    <button
                                        className="btn-action"
                                        disabled={seedTemplate.isPending}
                                        onClick={() => activeTemplate.id && seedTemplate.mutate(activeTemplate.id)}
                                        title="Add every exercise in the active template"
                                    >
                                        <Target size={11} className="mr-1" />
                                        {seedTemplate.isPending ? 'Adding' : 'From template'}
                                    </button>
                                )}
                            </div>

                            <form
                                style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.85rem' }}
                                onSubmit={event => {
                                    event.preventDefault();
                                    const trimmed = newName.trim();
                                    if (!trimmed) return;
                                    addEntry.mutate({ exercise_name: trimmed });
                                    setNewName('');
                                }}
                            >
                                <ExerciseNameInput
                                    value={newName}
                                    onChange={setNewName}
                                    className="form-control"
                                    placeholder="Track a lift not in any template"
                                />
                                <button
                                    type="submit"
                                    className="btn-action"
                                    disabled={!newName.trim() || addEntry.isPending}
                                >
                                    <Plus size={11} className="mr-1" />Track
                                </button>
                            </form>
                        </>
                    )}

                    {cards.length === 0 ? (
                        <div className="workout-empty">
                            <p className="workout-empty__title">Nothing tracked yet</p>
                            <p className="workout-empty__text">
                                {expanded
                                    ? 'Import from a template, or add a lift you want to keep an eye on.'
                                    : 'See all to start tracking.'}
                            </p>
                        </div>
                    ) : shown.length === 0 ? (
                        <div className="workout-empty">
                            <p className="workout-empty__title">No match</p>
                            <p className="workout-empty__text">Try a different search.</p>
                        </div>
                    ) : expanded ? (
                        <div
                            className="workout-mosaic"
                            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: '0.6rem' }}
                        >
                            {shown.map(card => (
                                <RecordCard
                                    key={card.entry.id}
                                    card={card}
                                    weightUnit={weightUnit}
                                    onRemove={() => setRemoving(card.entry.id!)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="workout-rows">
                            {shown.map(card => (
                                <RecordRow key={card.entry.id} card={card} weightUnit={weightUnit} />
                            ))}
                        </div>
                    )}

                    {expanded && withRecord < cards.length && (
                        <p className="form-label" style={{ marginTop: '0.75rem' }}>
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

/** One line for the compact right-rail card. */
const RecordRow: React.FC<{ card: PRCardData; weightUnit: WeightUnit }> = ({ card, weightUnit }) => (
    <div className="workout-row">
        <span className="workout-row__name">{card.entry.exercise_name}</span>
        <span className="workout-row__value" style={{ color: 'var(--color-primary)' }}>
            {card.best
                ? `${fromKg(card.best.weight, weightUnit)} ${weightUnit}${card.best.reps != null ? ` × ${card.best.reps}` : ''}`
                : 'no max yet'}
        </span>
    </div>
);

/** A full card: its best, and a way to enter one. */
const RecordCard: React.FC<{
    card: PRCardData;
    weightUnit: WeightUnit;
    onRemove: () => void;
}> = ({ card, weightUnit, onRemove }) => {
    const recordMax = useRecordManualPR();
    const [weight, setWeight] = useState('');
    const [reps, setReps] = useState('');

    const delta = prDelta(card.history);
    const entryId = card.entry.id;

    return (
        <div className="card">
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
                {card.best ? (
                    <div className="workout-stat">
                        <span className="workout-stat__value workout-stat__value--accent">
                            {fromKg(card.best.weight, weightUnit)}{' '}
                            <span style={{ fontSize: '0.7rem' }}>{weightUnit}</span>
                            {card.best.reps != null && (
                                <span style={{ fontSize: '0.8rem' }}> × {card.best.reps}</span>
                            )}
                        </span>
                        <span className="workout-stat__foot">{formatDayLabel(card.best.date)}</span>
                    </div>
                ) : (
                    <p className="form-label" style={{ marginBottom: '0.5rem' }}>
                        No max recorded yet. Enter what you have lifted before — it becomes the number
                        every later session is measured against.
                    </p>
                )}

                {delta && delta.kg > 0 && (
                    <p className="workout-stat__foot workout-stat__foot--accent" style={{ marginBottom: '0.5rem' }}>
                        <TrendingUp size={10} /> +{fromKg(delta.kg, weightUnit)} {weightUnit} since{' '}
                        {formatDayLabel(delta.fromDate)}
                    </p>
                )}

                <form
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.35rem', marginTop: '0.5rem' }}
                    onSubmit={event => {
                        event.preventDefault();
                        if (!entryId || !weight.trim()) return;
                        const parsed = Number(weight);
                        if (!Number.isFinite(parsed)) return;
                        recordMax.mutate({
                            pr_entry_id: entryId,
                            weight: toKg(parsed, weightUnit),
                            reps: reps.trim() ? Number(reps) : null,
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

                {card.history.length > 1 && (
                    <details style={{ marginTop: '0.6rem' }}>
                        <summary className="semester-meta" style={{ cursor: 'pointer' }}>
                            Progression ({card.history.length})
                        </summary>
                        <div className="workout-rows" style={{ marginTop: '0.4rem' }}>
                            {card.history.map(row => (
                                <div className="workout-row" key={row.id}>
                                    <span className="workout-row__name" style={{ fontSize: '0.65rem' }}>
                                        {formatDayLabel(row.workout_date)}
                                    </span>
                                    <span className="workout-row__value" style={{ fontSize: '0.65rem' }}>
                                        {row.weight != null
                                            ? `${fromKg(row.weight, weightUnit)} ${weightUnit}`
                                            : '—'}
                                        {row.reps != null && ` × ${row.reps}`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
};

export default RecordsPanel;