import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dumbbell, HeartPulse, PersonStanding, Plus } from 'lucide-react';
import { rankMatches } from '../../services/wgerService';
import { useExerciseLibrary, useSyncExerciseLibrary, useCreateCustomExercise } from '../../hooks/useWorkouts';
import type { ActivityType } from '../../utils/workoutSets';

export interface PickedExercise {
    name: string;
    activity_type: ActivityType;
    exercise_id?: string | null;
}

interface ExerciseNameInputProps {
    value: string;
    onChange: (value: string) => void;
    /** Fires when a library exercise is chosen, so the caller can keep its id. */
    onPick?: (exercise: PickedExercise) => void;
    activityType?: ActivityType;
    onActivityTypeChange?: (type: ActivityType) => void;
    placeholder?: string;
    className?: string;
    id?: string;
}

const ICONS: Record<ActivityType, React.ReactNode> = {
    strength: <Dumbbell size={11} />,
    cardio: <HeartPulse size={11} />,
    mobility: <PersonStanding size={11} />,
};

const MAX = 12;

/**
 * Exercise picker over the user's own library.
 *
 * Once wger has been synced the library is a local array, so search is a
 * synchronous filter: every keystroke re-ranks instantly with no request to
 * cancel. That is both faster and kinder to a free community server than the
 * debounced-per-keystroke version this replaced.
 *
 * A name that matches nothing offers to add it, so the picker is never a dead
 * end for a lift wger does not carry.
 */
const ExerciseNameInput: React.FC<ExerciseNameInputProps> = ({
    value,
    onChange,
    onPick,
    activityType,
    onActivityTypeChange,
    placeholder,
    className,
    id,
}) => {
    const listId = useId();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { data: library = [] } = useExerciseLibrary();
    const syncLibrary = useSyncExerciseLibrary();
    const createCustom = useCreateCustomExercise();
    const [open, setOpen] = useState(false);

    // The highlighted row belongs to the query that produced it. Storing that
    // query alongside the index, and treating a mismatch as "nothing is
    // highlighted", resets it during render instead of in an effect -- so
    // typing does not cost a second pass.
    const [highlight, setHighlight] = useState({ for: value, index: 0 });
    const highlighted = highlight.for === value ? highlight.index : 0;
    const setHighlighted = (index: number) => setHighlight({ for: value, index });

    const matches = useMemo(
        () => rankMatches(library, value, MAX).map(row => ({
            name: row.name,
            category: (row as { category?: string | null }).category,
            activity_type: (row as { activity_type?: ActivityType }).activity_type ?? 'strength',
        })),
        [library, value],
    );

    // Typing a name the library does not carry is an offer, not a dead end.
    const canCreate = useMemo(() => {
        const trimmed = value.trim();
        if (trimmed.length < 3) return false;
        return !library.some(row => row.name.trim().toLowerCase() === trimmed.toLowerCase());
    }, [library, value]);

    useEffect(() => {
        const onClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const commit = (name: string, type: ActivityType, exerciseId?: string | null) => {
        onChange(name);
        onPick?.({ name, activity_type: type, exercise_id: exerciseId ?? null });
        onActivityTypeChange?.(type);
        setOpen(false);
    };

    const createAndPick = async () => {
        const name = value.trim();
        if (!name) return;
        const type = activityType ?? 'strength';
        const created = await createCustom.mutateAsync({ name, activity_type: type });
        commit(name, type, created?.id);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setOpen(false);
            return;
        }
        if (event.key === 'Enter') {
            // Only intercept when there is something highlighted; otherwise let
            // the surrounding form submit so a plain typed name still works.
            if (open && matches.length > 0 && highlighted < matches.length) {
                event.preventDefault();
                const picked = matches[highlighted];
                if (picked) commit(picked.name, picked.activity_type);
            }
            return;
        }
        if (!open || matches.length === 0) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlighted(Math.min(matches.length - 1, highlighted + 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlighted(Math.max(0, highlighted - 1));
        }
    };

    const showList = open && (matches.length > 0 || canCreate || library.length === 0);

    return (
        <div className="workout-picker" ref={wrapperRef}>
            <input
                id={id}
                type="text"
                role="combobox"
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                autoComplete="off"
                className={className}
                value={value}
                placeholder={placeholder ?? 'Search exercises'}
                onChange={event => {
                    onChange(event.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={handleKeyDown}
            />

            {showList && (
                <ul className="workout-picker__list" id={listId} role="listbox">
                    {matches.map((item, index) => (
                        <li
                            key={item.name}
                            role="option"
                            aria-selected={index === highlighted}
                            className={`workout-picker__option ${index === highlighted ? 'workout-picker__option--active' : ''}`}
                            onMouseDown={event => {
                                // mousedown, not click: the input's blur must not
                                // race the pick and close the list first.
                                event.preventDefault();
                                commit(item.name, item.activity_type);
                            }}
                            onMouseEnter={() => setHighlighted(index)}
                        >
                            <span className="workout-picker__icon">{ICONS[item.activity_type]}</span>
                            <span className="workout-picker__name">{item.name}</span>
                            {item.category && <span className="workout-picker__category">{item.category}</span>}
                        </li>
                    ))}

                    {canCreate && (
                        <li
                            role="option"
                            aria-selected={false}
                            className="workout-picker__option workout-picker__option--create"
                            onMouseDown={event => {
                                event.preventDefault();
                                void createAndPick();
                            }}
                        >
                            <span className="workout-picker__icon"><Plus size={11} /></span>
                            <span className="workout-picker__name">Add &ldquo;{value.trim()}&rdquo;</span>
                        </li>
                    )}

                    {library.length === 0 && (
                        <li className="workout-picker__empty">
                            <button
                                type="button"
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => syncLibrary.mutate()}
                                disabled={syncLibrary.isPending}
                                className="btn-action btn-action--primary"
                            >
                                {syncLibrary.isPending ? 'Importing…' : 'Import 900+ exercises'}
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
};

export default ExerciseNameInput;