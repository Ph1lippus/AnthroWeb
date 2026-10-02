import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, Save, Target } from 'lucide-react';
import Title from '../Components/Title';
import ExerciseEditor from '../Components/Workout/ExerciseEditor';
import LoadingSpinner from '../Components/LoadingSpinner';
import {
    useWorkoutTemplate,
    useUpdateWorkoutTemplate,
    useAddTemplateExercise,
    useUpdateTemplateExercise,
    useDeleteTemplateExercise,
    useSetActiveTemplate,
    useSeedPRsFromTemplate,
} from '../hooks/useWorkouts';
import { useUserSettings } from '../hooks/useUserSettings';
import { DAY_NAMES } from '../utils/workoutStats';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Template editor: the week on the left, one day on the right.
 *
 * A two-track mosaic in the same idiom as the landing page. The week is a
 * column of seven day cards rather than seven pills in a row, because the
 * useful question while editing is "where does this belong" -- and that cannot
 * be answered when only one day is on screen and the others are counts in
 * parentheses. Monday is first, because a training week reads Mon..Sun.
 *
 * Nothing here rewrites history. A session materialises the plan into its own
 * rows when the day is marked, so editing this template changes what future
 * days will offer and leaves every past week exactly as it was logged.
 */
const WorkoutTemplateEditorPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';

    const { data, isLoading } = useWorkoutTemplate(id);
    const updateTemplate = useUpdateWorkoutTemplate();
    const addExercise = useAddTemplateExercise(id ?? '');
    const updateExercise = useUpdateTemplateExercise(id ?? '');
    const deleteExercise = useDeleteTemplateExercise(id ?? '');
    const setActive = useSetActiveTemplate();
    const seedPRs = useSeedPRsFromTemplate();

    const template = data?.template ?? null;
    const exercises = data?.exercises ?? [];

    // Lazy initial state so there is no mount effect resetting it after the
    // first paint: today is the day being worked on, and it beats a default.
    const [selectedDay, setSelectedDay] = useState(() => new Date().getDay());
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [dirty, setDirty] = useState(false);

    // Populating the form from the fetched template is a server-to-local sync.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (template) {
            setName(template.name);
            setDescription(template.description ?? '');
            setDirty(false);
        }
    }, [template]);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (isLoading) {
        return (
            <>
                <Title title="Edit Template" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card"><LoadingSpinner /></div>
                    </div>
                </div>
            </>
        );
    }

    if (!template || !id) {
        return (
            <>
                <Title title="Edit Template" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card">
                            <div className="workout-empty" style={{ marginTop: '1rem' }}>
                                <p className="workout-empty__title">That template no longer exists</p>
                                <button className="btn-action" onClick={() => navigate('/Workouts/Templates')}>
                                    <ChevronLeft size={11} className="mr-1" />Back to templates
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const perDay = (day: number) => exercises.filter(row => row.day_of_week === day);
    const setsOn = (day: number) =>
        perDay(day).reduce((total, row) => total + (row.target_sets_detail?.length ?? 0), 0);

    const saveHeader = async () => {
        await updateTemplate.mutateAsync({ id, updates: { name, description: description || undefined } });
        setDirty(false);
    };

    return (
        <>
            <Title title="Edit Template" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card workout-card--scroll">

                        <div className="dashboard-section__subtitle" style={{ textAlign: 'left' }}>
                            Pick a day, then set what you will do on it. Past workouts are never changed.
                        </div>

                        <div className="workout-mosaic workout-mosaic--split">
                            {/* ---- The week ---- */}
                            <div className="workout-mosaic__col workout-mosaic__days">
                                <div className="card">
                                    <div className="card-header">
                                        <h3 className="card-title">Week</h3>
                                    </div>
                                    <div className="card-body">
                                        <div className="workout-days">
                                            {DAY_SHORT.map((label, index) => {
                                                const day = (index + 1) % 7;
                                                const rows = perDay(day);
                                                const sets = setsOn(day);
                                                return (
                                                    <button
                                                        key={label}
                                                        className={[
                                                            'workout-day',
                                                            selectedDay === day ? 'workout-day--active' : '',
                                                            rows.length === 0 ? 'workout-day--empty' : '',
                                                        ].filter(Boolean).join(' ')}
                                                        onClick={() => setSelectedDay(day)}
                                                        aria-current={selectedDay === day}
                                                    >
                                                        <span className="workout-day__text">
                                                            <span className="workout-day__name">{DAY_NAMES[day]}</span>
                                                            <span className="workout-day__meta">
                                                                {rows.length > 0 ? `${sets} sets` : 'rest'}
                                                            </span>
                                                        </span>
                                                        <span className={`workout-day__count ${rows.length === 0 ? 'workout-day__count--rest' : ''}`}>
                                                            {rows.length || '·'}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ---- The selected day ---- */}
                            <div className="workout-mosaic__inputs">
                                <div className="card">
                                    <div className="card-header">
                                        <h3 className="card-title">{DAY_NAMES[selectedDay]}</h3>
                                        <span className="semester-meta" style={{ marginLeft: 'auto' }}>
                                            {perDay(selectedDay).length} exercises · {setsOn(selectedDay)} sets
                                        </span>
                                    </div>
                                    <div className="card-body">
                                        <div className="workout-ex__grid" style={{ marginBottom: '0.85rem' }}>
                                            <div className="workout-ex__field">
                                                <label className="form-label" htmlFor="tpl-name">Name</label>
                                                <input
                                                    id="tpl-name"
                                                    type="text"
                                                    className="form-control"
                                                    value={name}
                                                    maxLength={60}
                                                    onChange={event => { setName(event.target.value); setDirty(true); }}
                                                />
                                            </div>
                                            <div className="workout-ex__field" style={{ gridColumn: 'span 2' }}>
                                                <label className="form-label" htmlFor="tpl-desc">Description</label>
                                                <input
                                                    id="tpl-desc"
                                                    type="text"
                                                    className="form-control"
                                                    value={description}
                                                    maxLength={200}
                                                    placeholder="Optional"
                                                    onChange={event => { setDescription(event.target.value); setDirty(true); }}
                                                />
                                            </div>
                                        </div>

                                        <div className="workout-ex__actions" style={{ marginBottom: '0.85rem' }}>
                                            {!template.is_active && (
                                                <button
                                                    className="btn-action"
                                                    disabled={setActive.isPending}
                                                    onClick={() => setActive.mutate(id)}
                                                >
                                                    <Check size={11} className="mr-1" />Set active
                                                </button>
                                            )}
                                            {template.is_active && (
                                                <span className="workout-chip"><Check size={10} />Active</span>
                                            )}
                                            <button
                                                className="btn-action"
                                                disabled={seedPRs.isPending || exercises.length === 0}
                                                title="Add every exercise in this template to your records list"
                                                onClick={() => seedPRs.mutate(id)}
                                            >
                                                <Target size={11} className="mr-1" />
                                                {seedPRs.isPending ? 'Adding…' : 'Track as PRs'}
                                            </button>
                                            <button
                                                className="btn-action btn-action--primary"
                                                style={{ marginLeft: 'auto' }}
                                                disabled={!dirty || updateTemplate.isPending || !name.trim()}
                                                onClick={saveHeader}
                                            >
                                                <Save size={11} className="mr-1" />
                                                {updateTemplate.isPending ? 'Saving…' : 'Save'}
                                            </button>
                                        </div>

                                        <ExerciseEditor
                                            exercises={perDay(selectedDay)}
                                            dayOfWeek={selectedDay}
                                            weightUnit={weightUnit}
                                            isSaving={addExercise.isPending || updateExercise.isPending}
                                            onAdd={input => addExercise.mutateAsync(input)}
                                            onUpdate={(exerciseId, updates) =>
                                                updateExercise.mutate({ id: exerciseId, updates })}
                                            onDelete={exerciseId => deleteExercise.mutate(exerciseId)}
                                        />

                                        <p className="form-label" style={{ marginTop: '0.85rem' }}>
                                            Strength exercises get a row per set, so reps and weight
                                            can differ from set to set. Cardio and mobility take a
                                            duration instead. Editing this template never changes a
                                            workout you already logged.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="workout-ex__actions" style={{ marginTop: '0.85rem' }}>
                            <button className="btn-action" onClick={() => navigate('/Workouts/Templates')}>
                                <ChevronLeft size={11} className="mr-1" />All templates
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutTemplateEditorPage;