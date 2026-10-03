import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dumbbell, HeartPulse, PersonStanding, Plus, RefreshCw } from 'lucide-react';
import { rankMatches } from '../../services/wgerService';
import { useExerciseLibrary, useCreateCustomExercise } from '../../hooks/useWorkouts';
import type { LibraryExercise } from '../../services/workoutService';
import type { ActivityType } from '../../utils/workoutSets';

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

const MAX = 12;

/* Placement. The gap is what the absolutely positioned list used to have, and the
   two caps are the old `max-height` and the point below which opening upward stops
   being better than opening downward. */
const GAP = 4;
const MAX_LIST_PX = 240;
/** One option's height. Below this the list cannot show anything clickable. */
const MIN_LIST_PX = 34;
/** The point below which opening upward stops being better than opening downward. */
const MIN_USABLE_PX = 128;
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
 * Once wger has been synced the library is a local array, so search is a
 * synchronous filter: every keystroke re-ranks instantly with no request to
 * cancel. That is both faster and kinder to a free community server than the
 * debounced-per-keystroke version this replaced.
 *
 * A name that matches nothing offers to add it, so the picker is never a dead
 * end for a lift wger does not carry.
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
    const { data: library = [], status, syncLibrary, error } = useExerciseLibrary();
    const createCustom = useCreateCustomExercise();
    const [open, setOpen] = useState(false);
    const [placement, setPlacement] = useState<Placement | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);

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
       `rankMatches` is typed to the two fields it searches, so the rest is read
       off the row rather than assumed to be there.

       `startsGroup` is computed here rather than in the render so the headings
       are part of the same one-pass result. Grouping is by the activity type the
       row actually carries -- strength, cardio, mobility -- rather than by wger's
       category: the category is 80-odd mostly-synonymous names ("Bench press
       (barbell)", "Bench press (dumbbell)") and reading those as groups means
       reading a taxonomy, while the three types are the distinction that changes
       what the rest of the app does with the exercise. */
    const matches = useMemo(() => {
        const ranked = rankMatches(library, value, MAX).map(row => {
            const full = row as LibraryExercise;
            return {
                id: full.id ?? null,
                name: row.name,
                activity_type: (full.activity_type ?? 'strength') as ActivityType,
                /* One quiet line: the wger category, the muscles it actually trains,
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
        return !library.some(row => row.name.trim().toLowerCase() === trimmed.toLowerCase());
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
    const loading = status === 'loading' || status === 'syncing';
    const showList =
        open &&
        (hasQuery || matches.length > 0 || canCreate || loading || status === 'empty');
    const nothingFound = hasQuery && matches.length === 0 && !canCreate;

    /* What to say when there is nothing to show. Each state gets its own line,
       because the honest answer differs: still waiting, waiting on wger, wger
       gave us nothing, the library is loaded and simply has no match, or the sync
       failed -- in which case the reason is shown rather than a summary, because
       "empty" and "broken" look identical from out here. */
    const notice = loading
        ? status === 'syncing'
            ? 'Syncing the exercise library…'
            : 'Loading the exercise library…'
        : status === 'failed'
          ? `Could not load the exercise library. ${error ?? ''}`.trim()
          : status === 'empty'
            ? 'The library is empty. Nothing to search yet.'
            : nothingFound
              ? `Nothing in the library matches “${value.trim()}”.`
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
        onChange(name);
        onPick?.({ name, activity_type: type, exercise_id: exerciseId ?? null });
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
        const name = value.trim();
        if (!name) return;
        const type = activityType ?? 'strength';
        setCreateError(null);
        let created: LibraryExercise | null = null;
        try {
            created = await createCustom.mutateAsync({ name, activity_type: type });
        } catch (cause) {
            setCreateError(
                cause instanceof Error ? cause.message : 'Could not save it to your library.',
            );
        }
        commit(name, type, created?.id, created == null);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setOpen(false);
            return;
        }
        if (event.key === 'Enter') {
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
        }
    };

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
                    placeholder={placeholder ?? 'Search exercises'}
                    onChange={event => {
                        onChange(event.target.value);
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

{/* Nothing about syncing is offered here. An import button inside a search
                         dropdown is the wrong shape for it: it puts a network
                         request behind a control nobody looks for. The library
                         fetches itself on first use -- see `useExerciseLibrary`.

                         The one exception is a retry, and it lives in the empty
                         state rather than above it: the auto-sync gives up after two
                         attempts, so without this there is no way back for anyone
                         whose first fetch lost a race with wger. */}
                    {notice && (
                        <li className="workout-picker__none" role="presentation">
                            <span>{notice}</span>
                            {status === 'empty' || status === 'failed' ? (
                                <button
                                    type="button"
                                    className="btn-action"
                                    disabled={syncLibrary.isPending}
                                    onClick={() => syncLibrary.mutate()}
                                >
                                    <RefreshCw size={11} /> Fetch the library
                                </button>
                            ) : null}
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
        </>
    );
};

export default ExerciseNameInput;