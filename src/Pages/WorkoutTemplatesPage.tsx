import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { useWorkoutStore } from '../stores/useWorkoutStore';
import { getWorkoutTemplateDays } from '../services/workoutService';
import type { WorkoutTemplate } from '../services/workoutService';

const WorkoutTemplatesPage: React.FC = () => {
    const navigate = useNavigate();
    const { 
        templates, 
        loading, 
        fetchTemplates, 
        createTemplate, 
        deleteTemplate, 
        setActiveTemplate: setActive, 
        duplicateTemplate 
    } = useWorkoutStore();
    
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateDescription, setNewTemplateDescription] = useState('');
    const [templateDayCounts, setTemplateDayCounts] = useState<Record<string, number>>({});
    const [searchQuery, setSearchQuery] = useState('');

    // Delete confirmation modal
    const [deleteTarget, setDeleteTarget] = useState<WorkoutTemplate | null>(null);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    useEffect(() => {
        const loadTemplateDayCounts = async () => {
            const counts: Record<string, number> = {};
            for (const template of templates) {
                const days = await getWorkoutTemplateDays(template.id!);
                counts[template.id!] = days.length;
            }
            setTemplateDayCounts(counts);
        };
        
        if (templates.length > 0) {
            loadTemplateDayCounts();
        }
    }, [templates]);

    const handleCreateTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTemplateName.trim()) return;

        try {
            await createTemplate({
                name: newTemplateName,
                description: newTemplateDescription || undefined,
                is_active: false
            });
            setNewTemplateName('');
            setNewTemplateDescription('');
            setShowCreateModal(false);
        } catch (error) {
            console.error('Error creating template:', error);
            alert('Failed to create template. Please try again.');
        }
    };

    const handleActivate = async (id: string) => {
        try {
            await setActive(id);
        } catch (error) {
            console.error('Error activating template:', error);
            alert('Failed to activate template. Please try again.');
        }
    };

    const handleDuplicate = async (id: string) => {
        try {
            await duplicateTemplate(id);
        } catch (error) {
            console.error('Error duplicating template:', error);
            alert('Failed to duplicate template. Please try again.');
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteTemplate(deleteTarget.id!);
            setDeleteTarget(null);
        } catch (error) {
            console.error('Error deleting template:', error);
            alert('Failed to delete template. Please try again.');
        }
    };

    const filteredTemplates = templates.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const activeTemplate = templates.find(t => t.is_active);
    const inactiveTemplates = filteredTemplates.filter(t => !t.is_active);

    const renderTemplateCard = (template: WorkoutTemplate) => {
        const dayCount = templateDayCounts[template.id!] || 0;
        const isActive = template.is_active;

        return (
            <div key={template.id} className="workout-template-card-item">
                <div className="workout-template-card-item__top">
                    <div className="workout-template-card-item__title-section">
                        <h3 className="workout-template-card-item__title">
                            {isActive && <i className="fa-solid fa-thumbtack workout-template-card-item__pin"></i>}
                            {template.name}
                        </h3>
                        {template.description && (
                            <p className="workout-template-card-item__description">{template.description}</p>
                        )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button
                            onClick={() => navigate(`/Workouts/Start/${template.id}`)}
                            className="workout-template-card-item__action"
                            title="Start workout"
                        >
                            <i className="fa-solid fa-play"></i>
                        </button>
                        <button
                            onClick={() => navigate(`/Workouts/Template/${template.id}`)}
                            className="workout-template-card-item__action"
                            title="Edit template"
                        >
                            <i className="fa-solid fa-pen"></i>
                        </button>
                        <button
                            onClick={() => handleActivate(template.id!)}
                            className={`workout-template-card-item__action ${isActive ? 'workout-template-card-item__action--active' : ''}`}
                            title={isActive ? 'Currently active' : 'Set as active'}
                            disabled={isActive}
                        >
                            <i className="fa-solid fa-check"></i>
                        </button>
                        <button
                            onClick={() => handleDuplicate(template.id!)}
                            className="workout-template-card-item__action"
                            title="Duplicate template"
                        >
                            <i className="fa-solid fa-copy"></i>
                        </button>
                        <button
                            onClick={() => setDeleteTarget(template)}
                            className="workout-template-card-item__action workout-template-card-item__action--danger"
                            title="Delete template"
                        >
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div className="workout-template-card-item__footer">
                    <span className="workout-template-card-item__meta">{dayCount} exercises</span>
                </div>
            </div>
        );
    };

    return (
        <>
            <Title title="Workout Templates" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        {/* Stats + Top Bar */}
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
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => navigate('/Workouts')} className="btn-action">
                                    <i className="fa-solid fa-dumbbell mr-1"></i>Dashboard
                                </button>
                                <button onClick={() => navigate('/Workouts/Check')} className="btn-action">
                                    <i className="fa-solid fa-clipboard-check mr-1"></i>Log Workout
                                </button>
                                <button onClick={() => navigate('/Workouts/History')} className="btn-action">
                                    <i className="fa-solid fa-clock-rotate-left mr-1"></i>History
                                </button>
                                <button onClick={() => navigate('/Workouts/PRs')} className="btn-action">
                                    <i className="fa-solid fa-trophy mr-1"></i>PRs
                                </button>
                                <button onClick={() => setShowCreateModal(true)} className="btn-action">
                                    <i className="fa-solid fa-plus mr-1"></i>New Template
                                </button>
                            </div>

                            <div className="search-container workout-templates-search">
                                <div className="search-input-wrapper">
                                    <i className="search-input-icon fa-solid fa-magnifying-glass"></i>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                        placeholder="Search templates..."
                                    />
                                    {searchQuery && (
                                        <button
                                            className="search-clear-btn"
                                            onClick={() => setSearchQuery('')}
                                            aria-label="Clear search"
                                        >
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Templates Content */}
                        {loading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading templates...</p>
                            </div>
                        ) : templates.length === 0 ? (
                            <div className="workout-empty">
                                <i className="fa-solid fa-layer-group workout-empty-icon"></i>
                                <p className="workout-empty-title">No workout templates</p>
                                <p className="workout-empty-text">Create your first workout template to start organizing your exercise routines.</p>
                            </div>
                        ) : (
                            <div className="workout-templates-scroll-area">
                                {activeTemplate && (
                                    <div className="workout-templates-group">
                                        <div className="workout-templates-group-header">
                                            <i className="fa-solid fa-thumbtack"></i>
                                            Active Template
                                        </div>
                                        <div className="workout-templates-grid">
                                            {renderTemplateCard(activeTemplate)}
                                        </div>
                                    </div>
                                )}
                                {inactiveTemplates.length > 0 && (
                                    <div className="workout-templates-group">
                                        <div className="workout-templates-group-header">
                                            <i className="fa-solid fa-layer-group"></i>
                                            All Templates ({inactiveTemplates.length})
                                        </div>
                                        <div className="workout-templates-grid">
                                            {inactiveTemplates.map(renderTemplateCard)}
                                        </div>
                                    </div>
                                )}
                                {filteredTemplates.length === 0 && searchQuery && (
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
                        <form onSubmit={handleCreateTemplate}>
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
                                <button type="submit" className="btn-form-submit">
                                    Create Template
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="import-modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Template</h3>
                        <p className="mb-4">Are you sure you want to delete "{deleteTarget.name}"? This action cannot be undone.</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteTarget(null)} className="btn-form-cancel">
                                Cancel
                            </button>
                            <button onClick={handleDelete} className="btn-form-submit btn-form-submit--danger">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default WorkoutTemplatesPage;