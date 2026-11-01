import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dumbbell, HeartPulse, PersonStanding, Plus } from 'lucide-react';
import { useExerciseLibrary, useCreateCustomExercise } from '../../hooks/useWorkouts';
import type { LibraryExercise } from '../../services/workoutService';
import type { ActivityType } from '../../utils/workoutSets';
import { exerciseNameKey, rankExerciseMatches, titleCaseExerciseName } from '../../utils/exerciseNames';

export interface PickedExercise {
    name: string;
    activity_type: ActivityType;
    /** The library row this came from. Needed to read its muscles and equipment. */
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

/** Group headings. Not the icon names -- "Strength" is a label, not a glyph. */
const GROUP_LABELS: Record<ActivityType, string> = {
    strength: 'Strength',
    cardio: 'Cardio',
    mobility: 'Mobility',
};

const MAX = 20;
const EQUIPMENT_OPTIONS = [
    'Barbell',
    'Dumbbell',
    'Kettlebell',
    'Machine',
    'Cable',
    'Smith Machine',
    'Bodyweight',
    'Bike',
    'Treadmill',
    'Rower',
    'Resistance Band',
    'Medicine Ball',
    'Stability Ball',
    'Trap Bar',
    'EZ Bar',
    'Other',
] as const;
const WEIGHT_CONVENTIONS = [
    { value: 'total', label: 'Total Weight' },
    { value: 'per_hand', label: 'Per Hand' },
    { value: 'per_side', label: 'Per Side' },
] as const;

/* Placement. The gap is what the absolutely positioned list used to have, and the
   two caps are the old `max-height` and the point below which opening upward stops
   being better than opening downward. */
const GAP = 4;
const MAX_LIST_PX = 320;
/** One option's height. Below this the list cannot show anything clickable. */
const MIN_LIST_PX = 34;
/** The point below which opening upward stops being better than opening downward. */
const MIN_USABLE_PX = 200;
const EDGE_PX = 8;
/** Below this, a list matching a narrow field would sprawl across the page. */
const MIN_LIST_WIDTH = 220;

interface Placement {
    left: number;
    width: number;
    maxHeight: number;
    /** Anchored from the viewport top, so the list hangs below the field. */
    top?: number;
    /** Anchored from the viewport bottom, so it grows upward instead. */
    bottom?: number;
}

/**
 * Exercise picker over the user's own library.
 *
 * The library is local and user-owned, so search is synchronous and every
 * unmatched name can be created for later reuse.
 *
 * The list is portalled to `<body>` and positioned from `getBoundingClientRect()`,
 * the same fix `SidebarNav` uses for its tooltips and for the same documented
 * reason. In flow the list was absolutely positioned inside a relative wrapper,
 * which worked right up until an ancestor clipped it: every place an exercise can
 * be added sits inside a `.collapse-card` (`overflow: hidden`) inside a
 * `.workout-rail--work` (`overflow: hidden`) inside a `.workout-card`, and six
 * boxes between the field and the page edge each had an opinion. The list died
 * against whichever one it reached first, which reads as the search being broken
 * rather than the dropdown being cut off.
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
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const { data: library = [], isLoading } = useExerciseLibrary();
    const createCustom = useCreateCustomExercise();
    const [open, setOpen] = useState(false);
    const [placement, setPlacement] = useState<Placement | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [createType, setCreateType] = useState<ActivityType>(activityType ?? 'strength');
    const [createEquipment, setCreateEquipment] = useState<string>('');
    const [createWeightConvention, setCreateWeightConvention] = useState<
        'total' | 'per_hand' | 'per_side'
    >('total');
    const [createBodyPart, setCreateBodyPart] = useState('');

    // The highlighted row belongs to the query that produced it. Storing that
    // query alongside the index, and treating a mismatch as "nothing is
    // highlighted", resets it during render instead of in an effect -- so
    // typing does not cost a second pass.
    const [highlight, setHighlight] = useState({ for: value, index: 0 });
    const highlighted = highlight.for === value ? highlight.index : 0;
    const setHighlighted = (index: number) => setHighlight({ for: value, index });

    /* The id and the metadata are projected out here because this is the only
       place the whole library row exists. Both used to be dropped on the floor,
       which is why `exercise_id` was written as NULL for every exercise added
       through the UI: no muscles, no equipment, and no join back to the catalogue.
       The matcher is typed to the two fields it searches, so the rest is read
       off the row rather than assumed to be there.

       `startsGroup` is computed here rather than in the render so the headings
       are part of the same one-pass result. Grouping is by the activity type the
       row actually carries -- strength, cardio, mobility -- rather than by a
       category: the category is 80-odd mostly-synonymous names ("Bench press
       (barbell)", "Bench press (dumbbell)") and reading those as groups means
       reading a taxonomy, while the three types are the distinction that changes
       what the rest of the app does with the exercise. */
    const matches = useMemo(() => {
        const ranked = rankExerciseMatches(library, value, MAX).map(row => {
            const full = row as LibraryExercise;
            return {
                id: full.id ?? null,
                name: row.name,
                activity_type: (full.activity_type ?? 'strength') as ActivityType,
                /* One quiet line: the category, the muscles it actually trains,
                   then the equipment. Equipment is last because it is the least
                   useful of the three when choosing a movement, and it is the part
                   that truncates first if a name is long. */
                meta: [full.category, ...(full.muscles ?? []).slice(0, 2), full.equipment]
                    .filter(Boolean)
                    .join(' · '),
            };
        });

        const TYPE_ORDER: ActivityType[] = ['strength', 'cardio', 'mobility'];
        const ordered = [...ranked].sort(
            (a, b) => TYPE_ORDER.indexOf(a.activity_type) - TYPE_ORDER.indexOf(b.activity_type),
        );

        // A group heading goes on the first row of each run of the same type.
        // Done with an index rather than a mutated `previous`, because a variable
        // written during render survives into the next one and the eslint
        // react-hooks/immutability rule is right to complain about it.
        return ordered.map((item, i) => ({
            ...item,
            startsGroup: i === 0 || ordered[i - 1].activity_type !== item.activity_type,
        }));
    }, [library, value]);

    // Typing a name the library does not carry is an offer, not a dead end.
    const canCreate = useMemo(() => {
        const trimmed = value.trim();
        if (trimmed.length < 3) return false;
        return !library.some(row => exerciseNameKey(row.name) === exerciseNameKey(trimmed));
    }, [library, value]);

    /* The list opens on focus whenever there is something to say. It used to
       require a match, so typing something the library does not carry left the
       field looking dead: no dropdown, no "add this", nothing to say the search
       had run. Now a query alone opens it, and an empty result says so.

       It also used to open just because `library.length === 0`, which put an
       empty box under the field on focus: with nothing loaded there was no
       message, because a message needed a query. Now the only reason an unloaded
       library opens the list is that there is a real status to report. */
    const hasQuery = value.trim().length > 0;
    const showList =
        open &&
        (hasQuery || matches.length > 0 || canCreate || isLoading);
    const nothingFound = hasQuery && matches.length === 0 && !canCreate;

    /* What to say when there is nothing to show. Each state gets its own line,
       because the honest answer differs: still loading, or the library is loaded
       and simply has no match. */
    const notice = isLoading
        ? 'Loading Your Exercises…'
        : nothingFound
          ? `Nothing In Your Exercises Matches “${titleCaseExerciseName(value)}”.`
          : null;

    /* Measured against the field, not against any ancestor. `above` is the
       preference, not the decision: when the space under the field is too small
       to be usable but the space above it is not, the list goes up instead.

       Anchoring from `bottom` when flipped is deliberate. Placing it with `top`
       would need the list's own height to compute the offset, and that height
       depends on the very cap being decided here -- so the two would chase each
       other. From the bottom edge the browser does the arithmetic and `maxHeight`
       keeps the result on screen. */
    const place = useCallback(() => {
        const input = inputRef.current;
        if (!input) return;
        const rect = input.getBoundingClientRect();
        const roomBelow = window.innerHeight - rect.bottom - GAP - EDGE_PX;
        const roomAbove = rect.top - GAP - EDGE_PX;
        const above = roomBelow < MIN_USABLE_PX && roomAbove > roomBelow;
        /* Width is anchored to the field but never allowed off the right edge.
           A field in the right-hand column is narrow, and a list sized to the
           `MIN_LIST_WIDTH` floor would otherwise run off the viewport with the
           names -- the one thing being chosen -- at its far left. Clamping means
           the list can also grow leftwards past the field's own left edge, which
           is the lesser evil: the field stays visible and aligned, and only the
           list overhangs. */
        const width = Math.max(rect.width, MIN_LIST_WIDTH);
        const left = Math.max(
            EDGE_PX,
            Math.min(rect.left, window.innerWidth - width - EDGE_PX),
        );
        setPlacement({
            left: Math.round(left),
            width,
            /* `min`, not `max`: the room either way round is the hard limit. An
               earlier version floored this at 128px, which is exactly how a list
               opened from a field near the bottom of a short window grew down past
               the fold it had just been measured against. */
            maxHeight: Math.max(MIN_LIST_PX, Math.min(MAX_LIST_PX, above ? roomAbove : roomBelow)),
            ...(above
                ? { bottom: Math.round(window.innerHeight - rect.top + GAP) }
                : { top: Math.round(rect.bottom + GAP) }),
        });
    }, []);

    /* Reposition while open. Capture phase, because the scroll that moves the field
       is almost never on `window` -- it is `.workout-panels`, `.workout-rail` or
       any other ancestor with `overflow: auto`, and a bubble-phase listener would
       miss it entirely. Placement is deliberately not recomputed on every
       keystroke: the field is `width: 100%`, so typing cannot move it. */
    useEffect(() => {
        if (!showList) return;
        place();
        const reposition = () => place();
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    }, [showList, place]);

    useEffect(() => {
        const onClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            /* Both halves matter now. The list lives in `document.body`, so a
               containment check against the input alone would report every click on
               an option as outside and close the list before `onMouseDown` had a
               chance to commit the pick. */
            if (inputRef.current?.contains(target)) return;
            if (listRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const commit = (name: string, type: ActivityType, exerciseId?: string | null, keepOpen = false) => {
        const formatted = titleCaseExerciseName(name);
        onChange(formatted);
        onPick?.({ name: formatted, activity_type: type, exercise_id: exerciseId ?? null });
        onActivityTypeChange?.(type);
        if (!keepOpen) setOpen(false);
    };

    /* The library write and the template row are two different things, and one
       failing must not cost the other. A custom exercise that did not save is a
       name the user has to retype on every other template, so it is worth saying
       -- but the row they asked for can still be created, and discarding their
       typing over a library problem would be the worse failure.

       So the name commits either way, but the list stays open when the library
       write failed. It used to close unconditionally, which meant the error was
       rendered into a list that had just been hidden: reported, and invisible. */
    const createAndPick = async () => {
        const name = titleCaseExerciseName(value);
        if (!name) return;
        setCreateError(null);
        let created: LibraryExercise | null = null;
        try {
            created = await createCustom.mutateAsync({
                name,
                activity_type: createType,
                equipment: createEquipment || null,
                weight_convention: createWeightConvention,
                body_part: createBodyPart,
            });
        } catch (cause) {
            setCreateError(
                cause instanceof Error ? cause.message : 'Could not save it to your library.',
            );
        }
        commit(name, createType, created?.id, created == null);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setOpen(false);
            return;
        }
        if (event.key === 'Enter') {
            if (canCreate) {
                event.preventDefault();
                setCreating(true);
                setOpen(false);
                return;
            }
            // Only intercept when there is something highlighted; otherwise let the
            // surrounding form submit so a plain typed name still works.
            if (open && matches.length > 0 && highlighted < matches.length) {
                event.preventDefault();
                const picked = matches[highlighted];
                if (picked) commit(picked.name, picked.activity_type, picked.id);
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
        } else if (event.key === 'Home') {
            event.preventDefault();
            setHighlighted(0);
        } else if (event.key === 'End') {
            event.preventDefault();
            setHighlighted(matches.length - 1);
        }
    };

    /* Keep the highlighted row on screen. Moving the highlight is not enough: the
       list is capped at `MAX_LIST_PX` and holds more rows than that, so arrowing
       down used to walk off the bottom of the visible area and stop responding --
       the arrow key was doing something, just not something you could see.
       `nearest` rather than `center` so a single step does not jolt the list. */
    useEffect(() => {
        if (!showList || highlighted >= matches.length) return;
        // `getElementById`, not a `#id` selector: `useId` produces ids containing
        // characters that are not valid in a CSS selector.
        document
            .getElementById(`${listId}-option-${highlighted}`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [showList, highlighted, matches.length, listId]);

    return (
        <>
            <div className="workout-picker">
                <input
                    id={id}
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={showList && highlighted < matches.length
                        ? `${listId}-option-${highlighted}`
                        : undefined}
                    autoComplete="off"
                    className={className}
                    value={value}
                    placeholder={placeholder ?? 'Search Exercises'}
                    onChange={event => {
                        onChange(titleCaseExerciseName(event.target.value));
                        setCreateError(null);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                />
            </div>

            {/* Nothing renders until the effect has measured the field, so the list
                never appears for a frame at a stale position. */}
            {showList && placement && createPortal(
                <ul
                    className="workout-picker__list"
                    id={listId}
                    role="listbox"
                    ref={listRef}
                    style={{
                        top: placement.top,
                        bottom: placement.bottom,
                        left: placement.left,
                        width: placement.width,
                        maxHeight: placement.maxHeight,
                    }}
                >
                    {matches.map((item, index) => (
                        <React.Fragment key={item.id ?? item.name}>
                            {/* Group headings are `role="presentation"`, so the
                                option count keyboard navigation walks is still the
                                flat `matches` array and the arrow keys cannot land
                                on a heading that cannot be picked. */}
                            {item.startsGroup && (
                                <li className="workout-picker__group" role="presentation">
                                    {GROUP_LABELS[item.activity_type]}
                                </li>
                            )}
                            <li
                                id={`${listId}-option-${index}`}
                                role="option"
                                aria-selected={index === highlighted}
                                className={`workout-picker__option ${index === highlighted ? 'workout-picker__option--active' : ''}`}
                                onMouseDown={event => {
                                    // mousedown, not click: the input's blur must not race
                                    // the pick and close the list first.
                                    event.preventDefault();
                                    commit(item.name, item.activity_type, item.id);
                                }}
                                onMouseEnter={() => setHighlighted(index)}
                            >
                                <span className="workout-picker__icon">{ICONS[item.activity_type]}</span>
                                <span className="workout-picker__name">{item.name}</span>
                                {item.meta && <span className="workout-picker__category">{item.meta}</span>}
                            </li>
                        </React.Fragment>
                    ))}

                    {canCreate && !creating && (
                        <li
                            role="option"
                            aria-selected={false}
                            className="workout-picker__option workout-picker__option--create"
                            onMouseDown={event => {
                                event.preventDefault();
                                setCreating(true);
                                setOpen(false);
                            }}
                        >
                            <span className="workout-picker__icon"><Plus size={11} /></span>
                            <span className="workout-picker__name">Add &ldquo;{value.trim()}&rdquo;</span>
                        </li>
                    )}

                    {notice && (
                        <li className="workout-picker__none" role="presentation">
                            <span>{notice}</span>
                        </li>
                    )}

                    {createError && (
                        <li className="workout-picker__none" role="presentation">
                            <span className="workout-picker__error">{createError}</span>
                        </li>
                    )}
                </ul>,
                document.body,
            )}
            {creating && createPortal(
                <div className="import-modal-overlay" onMouseDown={event => {
                    if (event.target === event.currentTarget && !createCustom.isPending) setCreating(false);
                }}>
                    <div className="import-modal-card" role="dialog" aria-modal="true" aria-labelledby={`${listId}-create-title`}>
                        <h3 id={`${listId}-create-title`}>Create Exercise</h3>
                        <p className="form-label" style={{ marginBottom: '0.75rem' }}>
                            The exercise name was prefilled from your search.
                        </p>
                        <label className="form-label" htmlFor={`${listId}-modal-name`}>Name</label>
                        <input
                            id={`${listId}-modal-name`}
                            className="form-control"
                            value={value}
                            onChange={event => onChange(event.target.value)}
                        />
                        <label className="form-label" htmlFor={`${listId}-modal-type`}>Type</label>
                        <select id={`${listId}-modal-type`} className="form-control" value={createType} onChange={event => setCreateType(event.target.value as ActivityType)}>
                            <option value="strength">Strength</option>
                            <option value="cardio">Cardio</option>
                            <option value="mobility">Mobility</option>
                        </select>
                        <label className="form-label" htmlFor={`${listId}-modal-equipment`}>Equipment</label>
                        <select id={`${listId}-modal-equipment`} className="form-control" value={createEquipment} onChange={event => setCreateEquipment(event.target.value)}>
                            <option value="">None / Not Specified</option>
                            {EQUIPMENT_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <label className="form-label" htmlFor={`${listId}-modal-weight`}>Weight Convention</label>
                        <select id={`${listId}-modal-weight`} className="form-control" value={createWeightConvention} onChange={event => setCreateWeightConvention(event.target.value as 'total' | 'per_hand' | 'per_side')}>
                            {WEIGHT_CONVENTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <label className="form-label" htmlFor={`${listId}-modal-body-part`}>Muscle Group / Body Part</label>
                        <input id={`${listId}-modal-body-part`} className="form-control" value={createBodyPart} placeholder="Chest, Back, Quadriceps" onChange={event => setCreateBodyPart(event.target.value)} />
                        {createError && <p className="workout-picker__error">{createError}</p>}
                        <div className="exercise-create-actions">
                            <button type="button" className="btn-form-cancel" onClick={() => setCreating(false)} disabled={createCustom.isPending}>Cancel</button>
                            <button type="button" className="btn-action btn-action--primary" disabled={createCustom.isPending} onClick={() => void createAndPick()}>
                                {createCustom.isPending ? 'Saving…' : 'Save Exercise'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

export default ExerciseNameInput;