import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Dumbbell, Layers, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import Title from '../Components/Title';
import ConfirmModal from '../Components/ConfirmModal';
import LoadingSpinner from '../Components/LoadingSpinner';
import {
    useWorkoutTemplates,
    useCreateWorkoutTemplate,
    useDeleteWorkoutTemplate,
    useDuplicateWorkoutTemplate,
    useSetActiveTemplate,
} from '../hooks/useWorkouts';
import type { WorkoutTemplate, WorkoutTemplateExercise } from '../services/workoutService';
import { todayString } from '../utils/dates';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The templates list: one card per routine, each expandable to show its week.
 *
 * Expandable rather than a grid of opaque cards, because the first question
 * about a template is "what is in it" and the previous version made you open
 * the editor to find out. It reuses the shared .collapse-card primitives, so
 * the interaction is the same one a semester or a course row already has.
 *
 * Each day lists its exercise names, which is enough to tell a push day from a
 * leg day without leaving the page.
 */
const WorkoutTemplatesPage: React.FC = () => {
    const navigate = useNavigate();
    const { data: templates = [], isLoading } = useWorkoutTemplates();
    const createTemplate = useCreateWorkoutTemplate();
    const deleteTemplate = useDeleteWorkoutTemplate();
    const duplicateTemplate = useDuplicateWorkoutTemplate();
    const setActive = useSetActiveTemplate();

    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<WorkoutTemplate | null>(null);
    // Creating inline rather than in a modal, the way the daily log adds a
    // custom habit: two fields under the button that opened them, no overlay.
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');

    const submitCreate = async (event: React.FormEvent) => {
        event.preventDefault();
        const name = newName.trim();
        if (!name) return;
        const created = await createTemplate.mutateAsync({
            name,
            description: newDescription.trim() || undefined,
        });
        setNewName('');
        setNewDescription('');
        setCreating(false);
        // Straight into the editor, because a template with no exercises yet is
        // not something anyone wants to look at twice.
        if (created.id) navigate(`/Workouts/Template/${created.id}`);
    };

    const needle = search.trim().toLowerCase();
    const filtered = needle
        ? templates.filter(t =>
            t.name.toLowerCase().includes(needle) ||
            (t.description ?? '').toLowerCase().includes(needle))
        : templates;
    const active = filtered.find(t => t.is_active) ?? null;
    const inactive = filtered.filter(t => !t.is_active);

    const toggle = (id?: string) => setExpanded(current => (current === id ? null : id ?? null));

    return (
        <>
            <Title title="Workout Templates" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card workout-card--scroll">
                        <div className="dashboard-section__subtitle" style={{ textAlign: 'left' }}>
                            A template is a week: each day holds its own exercises. Editing one never
                            changes a workout you already logged.
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title"><Layers size={12} />Templates</h3>
                                <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', alignItems: 'center' }}>
                                    <div className="search-container" style={{ minWidth: '9rem' }}>
                                        <div className="search-input-wrapper">
                                            <Search className="search-input-icon" />
                                            <input
                                                type="text"
                                                className="search-input"
                                                value={search}
                                                onChange={event => setSearch(event.target.value)}
                                                placeholder="Search"
                                                aria-label="Search templates"
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
                                    <button
                                        className="btn-action btn-action--primary"
                                        onClick={() => setCreating(value => !value)}
                                        aria-expanded={creating}
                                    >
                                        <Plus size={11} className="mr-1" />New
                                    </button>
                                </div>
                            </div>
                            <div className="card-body">
                                {creating && (
                                    <form
                                        onSubmit={submitCreate}
                                        style={{ marginBottom: '0.85rem' }}
                                    >
                                        <div className="workout-ex__grid">
                                            <div className="workout-ex__field">
                                                <label className="form-label" htmlFor="tpl-new-name">Name</label>
                                                <input
                                                    id="tpl-new-name"
                                                    type="text"
                                                    className="form-control"
                                                    value={newName}
                                                    maxLength={60}
                                                    placeholder="Push / Pull / Legs"
                                                    autoFocus
                                                    onChange={event => setNewName(event.target.value)}
                                                />
                                            </div>
                                            <div className="workout-ex__field" style={{ gridColumn: 'span 2' }}>
                                                <label className="form-label" htmlFor="tpl-new-desc">Description</label>
                                                <input
                                                    id="tpl-new-desc"
                                                    type="text"
                                                    className="form-control"
                                                    value={newDescription}
                                                    maxLength={200}
                                                    placeholder="Optional"
                                                    onChange={event => setNewDescription(event.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="workout-ex__actions" style={{ marginTop: '0.5rem' }}>
                                            <button
                                                type="button"
                                                className="btn-action"
                                                onClick={() => setCreating(false)}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                className="btn-action btn-action--primary"
                                                disabled={!newName.trim() || createTemplate.isPending}
                                            >
                                                {createTemplate.isPending ? 'Creating' : 'Create and edit'}
                                            </button>
                                        </div>
                                    </form>
                                )}
                                {isLoading ? <LoadingSpinner /> : templates.length === 0 ? (
                                    <div className="workout-empty">
                                        <p className="workout-empty__title">No templates yet</p>
                                        <p className="workout-empty__text">
                                            A template gives every day of the week its own exercises and
                                            fills the session for you.
                                        </p>
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div className="workout-empty">
                                        <p className="workout-empty__title">No match</p>
                                        <p className="workout-empty__text">Try a different search.</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        {active && (
                                            <TemplateRow
                                                template={active}
                                                expanded={expanded === active.id}
                                                onToggle={() => toggle(active.id)}
                                                onEdit={() => navigate(`/Workouts/Template/${active.id}`)}
                                                onLog={() => navigate(`/Workouts?day=${todayString()}`)}
                                                onDuplicate={() => duplicateTemplate.mutate(active.id!)}
                                                onDelete={() => setDeleteTarget(active)}
                                                isActivating={setActive.isPending}
                                                onActivate={() => undefined}
                                            />
                                        )}
                                        {inactive.map(template => (
                                            <TemplateRow
                                                key={template.id}
                                                template={template}
                                                expanded={expanded === template.id}
                                                onToggle={() => toggle(template.id)}
                                                onEdit={() => navigate(`/Workouts/Template/${template.id}`)}
                                                onLog={() => navigate(`/Workouts?day=${todayString()}`)}
                                                onDuplicate={() => duplicateTemplate.mutate(template.id!)}
                                                onDelete={() => setDeleteTarget(template)}
                                                isActivating={setActive.isPending}
                                                onActivate={() => setActive.mutate(template.id!)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <ConfirmModal
                open={!!deleteTarget}
                title={`Delete "${deleteTarget?.name}"?`}
                description="The template and its plan are removed. Workouts you already logged keep their own record."
                confirmLabel="Delete"
                danger
                busy={deleteTemplate.isPending}
                onConfirm={() => {
                    if (!deleteTarget?.id) return;
                    deleteTemplate.mutate(deleteTarget.id, {
                        onSuccess: () => setDeleteTarget(null),
                    });
                }}
                onCancel={() => setDeleteTarget(null)}
            />
        </>
    );
};

type RowTemplate = WorkoutTemplate & { days: WorkoutTemplateExercise[] };

/** One template: its name, its week, and the actions on it. */
const TemplateRow: React.FC<{
    template: RowTemplate;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onLog: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onActivate: () => void;
    isActivating: boolean;
}> = ({
    template, expanded, onToggle, onEdit, onLog, onDuplicate, onDelete, onActivate, isActivating,
}) => {
    const byDay = new Map<number, string[]>();
    for (const row of template.days ?? []) {
        const list = byDay.get(row.day_of_week) ?? [];
        list.push(row.exercise_name);
        byDay.set(row.day_of_week, list);
    }

    const isActive = template.is_active;
    const today = new Date().getDay();
    const todayCount = byDay.get(today)?.length ?? 0;

    return (
        <div className={`collapse-card ${expanded ? 'collapse-card--open' : ''}`}>
            <button className="collapse-head" onClick={onToggle} aria-expanded={expanded}>
                <span className="collapse-head__text">
                    <span className="semester-title">
                        {isActive && <Pin size={11} style={{ marginRight: '0.3rem' }} />}
                        {template.name}
                    </span>
                    <span className="semester-meta">
                        {template.days?.length ?? 0} exercises · today {todayCount > 0 ? `has ${todayCount}` : 'is a rest day'}
                    </span>
                </span>
                <span className="collapse-head__right">
                    {isActive
                        ? <span className="workout-chip"><Check size={10} />active</span>
                        : <span className="workout-day__count workout-day__count--rest">{template.days?.length ?? 0}</span>}
                </span>
            </button>

            {expanded && (
                <div className="collapse-body">
                    {template.description && (
                        <p className="form-label" style={{ marginBottom: '0.5rem' }}>
                            {template.description}
                        </p>
                    )}

                    <div className="workout-days">
                        {DAY_SHORT.map((label, index) => {
                            const weekday = (index + 1) % 7;
                            const names = byDay.get(weekday) ?? [];
                            return (
                                <div
                                    key={label}
                                    className={`workout-day ${names.length === 0 ? 'workout-day--empty' : ''}`}
                                    style={{ cursor: 'default' }}
                                >
                                    <span className="workout-day__text">
                                        <span className="workout-day__name">
                                            {label}{weekday === today ? ' · today' : ''}
                                        </span>
                                        <span className="workout-day__meta">
                                            {names.length > 0 ? names.join(', ') : 'rest'}
                                        </span>
                                    </span>
                                    <span className={`workout-day__count ${names.length === 0 ? 'workout-day__count--rest' : ''}`}>
                                        {names.length || '·'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="workout-ex__actions">
                        <button className="btn-action" onClick={onDelete}>
                            <Trash2 size={11} className="mr-1" />Delete
                        </button>
                        <button className="btn-action" onClick={onDuplicate}>
                            <Copy size={11} className="mr-1" />Duplicate
                        </button>
                        {!isActive && (
                            <button className="btn-action" disabled={isActivating} onClick={onActivate}>
                                <Check size={11} className="mr-1" />Set active
                            </button>
                        )}
                        <button className="btn-action" onClick={onLog}>
                            <Dumbbell size={11} className="mr-1" />Log today
                        </button>
                        <button className="btn-action btn-action--primary" onClick={onEdit}>
                            <Pencil size={11} className="mr-1" />Edit
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkoutTemplatesPage;