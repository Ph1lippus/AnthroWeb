import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import WorkoutsNav from '../Components/Workout/WorkoutsNav';
import ConfirmModal from '../Components/ConfirmModal';
import {
    useWorkoutTemplates,
    useCreateWorkoutTemplate,
    useDeleteWorkoutTemplate,
    useDuplicateWorkoutTemplate,
    useSetActiveTemplate,
} from '../hooks/useWorkouts';
import type { WorkoutTemplate } from '../services/workoutService';
import { Plus, Layers, Pin, Pencil, Check, Copy, Trash2, Search, X } from 'lucide-react';

const WorkoutTemplatesPage: React.FC = () => {
    const navigate = useNavigate();
    const { data: templates = [], isLoading } = useWorkoutTemplates();
    const createTemplate = useCreateWorkoutTemplate();
    const deleteTemplate = useDeleteWorkoutTemplate();
    const duplicateTemplate = useDuplicateWorkoutTemplate();
    const setActive = useSetActiveTemplate();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateDescription, setNewTemplateDescription] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<WorkoutTemplate | null>(null);

    const activeTemplate = templates.find(t => t.is_active) ?? null;
    const filtered = templates.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    const inactive = filtered.filter(t => !t.is_active);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTemplateName.trim()) return;
        await createTemplate.mutateAsync({ name: newTemplateName, description: newTemplateDescription || undefined });
        setNewTemplateName('');
        setNewTemplateDescription('');
        setShowCreateModal(false);
    };

    return (
        <>
            <Title title="Workout Templates" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        <WorkoutsNav />

                        <div className="workout-templates-stats">
                            <div className="workout-templates-stat-item">
                                <span className="workout-templates-stat-label">Total Templates</span>
                                <span className="workout-templates-stat-value">{templates.length}</span>
                            </div>
                            <div className="workout-templates-stat-item">
                                <span className="workout-templates-stat-label">Active</span>
                                <span className="workout-templates-stat-value">{activeTemplate ? 1 : 0}</span>
                            </div>
                        </div>

                        <div className="workout-templates-top-bar">
                            <button onClick={() => setShowCreateModal(true)} className="btn-action">
                                <Plus className="mr-1" />New Template
                            </button>
                            <div className="search-container workout-templates-search">
                                <div className="search-input-wrapper">
                                    <Search className="search-input-icon" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                        placeholder="Search templates..."
                                    />
                                    {searchQuery && (
                                        <button className="search-clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
                                            <X />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading templates...</p>
                            </div>
                        ) : templates.length === 0 ? (
                            <div className="workout-empty">
                                <Layers className="workout-empty-icon" />
                                <p className="workout-empty-title">No workout templates</p>
                                <p className="workout-empty-text">Create your first workout template to start organizing your exercise routines.</p>
                            </div>
                        ) : (
                            <div className="workout-templates-scroll-area">
                                {activeTemplate && (
                                    <div className="workout-templates-group">
                                        <div className="workout-templates-group-header">
                                            <Pin />
                                            Active Template
                                        </div>
                                        <div className="workout-templates-grid">
                                            {(
                                                <div key={activeTemplate.id} className="workout-template-card-item">
                                                    <div className="workout-template-card-item__top">
                                                        <div className="workout-template-card-item__title-section">
                                                            <h3 className="workout-template-card-item__title">
                                                                {activeTemplate.is_active && <Pin className="workout-template-card-item__pin" />}
                                                                {activeTemplate.name}
                                                            </h3>
                                                            {activeTemplate.description && (
                                                                <p className="workout-template-card-item__description">{activeTemplate.description}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-1 shrink-0">
                                                            <button
                                                                onClick={() => navigate(`/Workouts/Template/${activeTemplate.id}`)}
                                                                className="workout-template-card-item__action"
                                                                title="Edit template"
                                                            >
                                                                <Pencil />
                                                            </button>
                                                            <button
                                                                onClick={() => navigate(`/Workouts/Check`)}
                                                                className="workout-template-card-item__action"
                                                                title="Log today's workout"
                                                            >
                                                                <Check />
                                                            </button>
                                                            <button
                                                                onClick={() => duplicateTemplate.mutate(activeTemplate.id!)}
                                                                className="workout-template-card-item__action"
                                                                title="Duplicate template"
                                                            >
                                                                <Copy />
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteTarget(activeTemplate)}
                                                                className="workout-template-card-item__action workout-template-card-item__action--danger"
                                                                title="Delete template"
                                                            >
                                                                <Trash2 />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="workout-template-card-item__footer">
                                                        <span className="workout-template-card-item__meta">
                                                            {(activeTemplate.days ?? []).length} exercises
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {inactive.length > 0 && (
                                    <div className="workout-templates-group">
                                        <div className="workout-templates-group-header">
                                            <Layers />
                                            All Templates ({inactive.length})
                                        </div>
                                        <div className="workout-templates-grid">
                                            {inactive.map(template => (
                                                <div key={template.id} className="workout-template-card-item">
                                                    <div className="workout-template-card-item__top">
                                                        <div className="workout-template-card-item__title-section">
                                                            <h3 className="workout-template-card-item__title">{template.name}</h3>
                                                            {template.description && (
                                                                <p className="workout-template-card-item__description">{template.description}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-1 shrink-0">
                                                            <button
                                                                onClick={() => navigate(`/Workouts/Template/${template.id}`)}
                                                                className="workout-template-card-item__action"
                                                                title="Edit template"
                                                            >
                                                                <Pencil />
                                                            </button>
                                                            <button
                                                                onClick={() => setActive.mutate(template.id!)}
                                                                className="workout-template-card-item__action"
                                                                title="Set as active"
                                                                disabled={setActive.isPending}
                                                            >
                                                                <Check />
                                                            </button>
                                                            <button
                                                                onClick={() => duplicateTemplate.mutate(template.id!)}
                                                                className="workout-template-card-item__action"
                                                                title="Duplicate template"
                                                            >
                                                                <Copy />
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteTarget(template)}
                                                                className="workout-template-card-item__action workout-template-card-item__action--danger"
                                                                title="Delete template"
                                                            >
                                                                <Trash2 />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="workout-template-card-item__footer">
                                                        <span className="workout-template-card-item__meta">{(template.days ?? []).length} exercises</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {filtered.length === 0 && searchQuery && (
                                    <p className="text-sm opacity-50 mt-4 text-center">No templates match your search.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Create Template Modal */}
            {showCreateModal && (
                <div className="import-modal-overlay" onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        setNewTemplateName('');
                        setNewTemplateDescription('');
                        setShowCreateModal(false);
                    }
                }}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Create New Template</h3>
                        <form onSubmit={handleCreate}>
                            <div className="mb-4">
                                <label className="form-label">Template Name</label>
                                <input
                                    type="text"
                                    value={newTemplateName}
                                    onChange={(e) => setNewTemplateName(e.target.value)}
                                    className="form-control"
                                    placeholder="e.g., Push Day, Leg Day, Full Body"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Description (optional)</label>
                                <textarea
                                    value={newTemplateDescription}
                                    onChange={(e) => setNewTemplateDescription(e.target.value)}
                                    className="form-control"
                                    placeholder="Describe this workout routine..."
                                    rows={3}
                                />
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewTemplateName('');
                                        setNewTemplateDescription('');
                                        setShowCreateModal(false);
                                    }}
                                    className="btn-form-cancel"
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn-form-submit" disabled={createTemplate.isPending}>
                                    {createTemplate.isPending ? 'Creating...' : 'Create Template'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            <ConfirmModal
                open={!!deleteTarget}
                title={`Delete "${deleteTarget?.name}"?`}
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

export default WorkoutTemplatesPage;