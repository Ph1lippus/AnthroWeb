import React, { useState, useEffect } from 'react';
import Title from '../Components/Title';
import { getUserProjects, createProject, updateProject, deleteProject, exportProjectsToCSV, importProjectsFromCSV, getProjectPlanItems, createProjectPlanItem, deleteProjectPlanItem, toggleProjectPlanItemComplete } from '../services/projectService';
import type { Project, ProjectPlanItem } from '../services/projectService';

const priorityColors: Record<string, string> = {
    low: '#43b67d',
    medium: '#ffa500',
    high: '#ff6b70',
};

const statusLabels: Record<string, string> = {
    planned: 'Planned',
    active: 'Active',
    paused: 'Paused',
    completed: 'Completed',
    archived: 'Archived',
};

const statusColors: Record<string, string> = {
    planned: '#6366f1',
    active: 'var(--color-primary)',
    paused: '#ffa500',
    completed: '#43b67d',
    archived: 'rgba(255, 255, 255, 0.4)',
};

const ProjectsPage: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [submittedSearch, setSubmittedSearch] = useState('');

    // Import modal state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    // Delete confirmation modal
    const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

    // Edit modal state
    const [editModalProject, setEditModalProject] = useState<Project | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editStatus, setEditStatus] = useState<'planned' | 'active' | 'paused' | 'completed' | 'archived'>('planned');
    const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');
    const [editProgress, setEditProgress] = useState('');
    const [editDeadline, setEditDeadline] = useState('');
    // Add form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<'planned' | 'active' | 'paused' | 'completed' | 'archived'>('planned');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
    const [deadline, setDeadline] = useState('');

// View project modal with notes and plan items
    const [viewProject, setViewProject] = useState<Project | null>(null);
    const [planItems, setPlanItems] = useState<ProjectPlanItem[]>([]);
    const [newPlanTitle, setNewPlanTitle] = useState('');
    const [notesText, setNotesText] = useState('');
    const [planError, setPlanError] = useState<string | null>(null);

    // Fetch all projects at once
    useEffect(() => {
        const loadProjects = async () => {
            setLoading(true);
            const allProjects = await getUserProjects();
            setProjects(allProjects);
            setLoading(false);
        };
        loadProjects();
    }, []);

    const handleMarkCompleted = async (project: Project) => {
        await updateProject(project.id!, {
            status: 'completed',
            completed_at: new Date().toISOString().split('T')[0],
        });
        const refreshedProjects = await getUserProjects();
        setProjects(refreshedProjects);
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setStatus('planned');
        setPriority('medium');
        setDeadline('');
        setEditingProject(null);
        setShowAddForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingProject) {
            await updateProject(editingProject.id!, {
                title,
                description: description || undefined,
                status,
                priority,
                deadline: deadline || undefined,
            });
        } else {
            await createProject({
                title,
                description: description || undefined,
                status,
                priority,
                deadline: deadline || undefined,
            });
        }

        const refreshedProjects = await getUserProjects();
        setProjects(refreshedProjects);
        resetForm();
    };

    const openEditModal = (project: Project) => {
        setEditModalProject(project);
        setEditTitle(project.title);
        setEditDescription(project.description || '');
        setEditStatus(project.status);
        setEditPriority(project.priority);
        setEditProgress((project.progress || 0).toString());
        setEditDeadline(project.deadline || '');
    };

    const closeEditModal = () => {
        setEditModalProject(null);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editModalProject) return;

        setEditLoading(true);
        try {
            const progressNum = parseInt(editProgress) || 0;

            await updateProject(editModalProject.id!, {
                title: editTitle,
                description: editDescription || undefined,
                status: editStatus,
                priority: editPriority,
                progress: progressNum,
                deadline: editDeadline || undefined,
            });

            const refreshedProjects = await getUserProjects();
            setProjects(refreshedProjects);
            closeEditModal();
        } finally {
            setEditLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await deleteProject(deleteTarget.id!);
        const refreshedProjects = await getUserProjects();
        setProjects(refreshedProjects);
        setDeleteTarget(null);
    };

    const handleExport = async () => {
        const csv = exportProjectsToCSV(projects);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `projects-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result as string;
            try {
                await importProjectsFromCSV(content);
                setImportError(null);
                setShowImportModal(false);
                const refreshedProjects = await getUserProjects();
                setProjects(refreshedProjects);
            } catch {
                setImportError('Failed to import projects. Please check your CSV format.');
            }
        };
        reader.readAsText(file);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            setSubmittedSearch(searchQuery);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSubmittedSearch('');
    };

    const plannedProjects = projects.filter(p => p.status === 'planned').sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    const activeProjects = projects.filter(p => p.status === 'active').sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    const completedProjects = projects.filter(p => p.status === 'completed').sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    const pausedProjects = projects.filter(p => p.status === 'paused').sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    const archivedProjects = projects.filter(p => p.status === 'archived').sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const tagMatch = submittedSearch.match(/^(#\w+)\s*(.*)/i);
    const activeTag = tagMatch ? tagMatch[1].toLowerCase() : null;
    const textSearch = tagMatch ? tagMatch[2].trim() : submittedSearch.trim();

    const getFilteredProjects = () => {
        if (!submittedSearch) return [];

        let filtered = projects;

        if (activeTag === '#planned') {
            filtered = plannedProjects;
        } else if (activeTag === '#active') {
            filtered = activeProjects;
        } else if (activeTag === '#paused') {
            filtered = pausedProjects;
        } else if (activeTag === '#completed') {
            filtered = completedProjects;
        } else if (activeTag === '#archived') {
            filtered = archivedProjects;
        }

        if (textSearch) {
            filtered = filtered.filter(p =>
                p.title.toLowerCase().includes(textSearch.toLowerCase()) ||
                (p.description && p.description.toLowerCase().includes(textSearch.toLowerCase()))
            );
        }

        return filtered;
    };

    const searchFiltered = getFilteredProjects();

    const getSearchHeader = () => {
        if (!submittedSearch) return '';
        const count = searchFiltered.length;
        const label = activeTag ? `${activeTag} ` : '';
        return `${label}Results (${count})`;
    };

    const totalProjectsCount = projects.length;
    const activeCount = activeProjects.length;
    const completedCount = completedProjects.length;

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return null;
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const isOverdue = (deadline?: string) => {
        if (!deadline) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return new Date(deadline) < today;
    };

    const openViewModal = async (project: Project) => {
        setViewProject(project);
        setNotesText(project.notes || '');
        setNewPlanTitle('');
        setPlanError(null);
        const items = await getProjectPlanItems(project.id!);
        setPlanItems(items);
    };

    const saveNotes = async () => {
        if (!viewProject) return;
        try {
            await updateProject(viewProject.id!, { notes: notesText });
            setViewProject(prev => prev ? { ...prev, notes: notesText } : prev);
            setProjects(prev => prev.map(p => p.id === viewProject.id ? { ...p, notes: notesText } : p));
        } catch (err) {
            console.error('Error saving notes:', err);
        }
    };

    const refreshPlanItems = async () => {
        if (!viewProject) return;
        try {
            const items = await getProjectPlanItems(viewProject.id!);
            setPlanItems(items);
            setPlanError(null);
        } catch (err) {
            setPlanError('Failed to load plan items. Please try again.');
            console.error('Error refreshing plan items:', err);
        }
    };

    const renderProjectCard = (project: Project) => {
        const overdue = project.status !== 'completed' && project.status !== 'archived' && project.status !== 'planned' && isOverdue(project.deadline);

        return (
            <div key={project.id} className="project-card">
                <div className="project-card-top">
                    <div className="project-title-section" onClick={() => openViewModal(project)} style={{ cursor: 'pointer' }}>
                        <h3 className="project-title">{project.title}</h3>
                        <div className="project-badges">
                            <span
                                className="project-status-badge"
                                style={{ backgroundColor: statusColors[project.status] + '20', color: statusColors[project.status], borderColor: statusColors[project.status] + '40' }}
                            >
                                {statusLabels[project.status]}
                            </span>
                            <span
                                className="project-priority-badge"
                                style={{ backgroundColor: priorityColors[project.priority] + '20', color: priorityColors[project.priority], borderColor: priorityColors[project.priority] + '40' }}
                            >
                                {project.priority}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button
                            onClick={() => openEditModal(project)}
                            className="project-action-btn"
                            title="Edit project details"
                            aria-label="Edit project"
                        >
                            <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button
                            onClick={() => setDeleteTarget(project)}
                            className="project-action-btn project-action-btn--danger"
                            title="Delete project"
                            aria-label="Delete project"
                        >
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                {project.description && (
                    <p className="project-description">{project.description}</p>
                )}
                <div className="project-card-details">
                    <div className="project-card-info">
                        {project.status !== 'completed' && project.status !== 'archived' && (
                            <button
                                onClick={() => handleMarkCompleted(project)}
                                className="project-complete-btn"
                                title="Mark as completed"
                                aria-label="Mark as completed"
                            >
                                <i className="fa-solid fa-check"></i>
                            </button>
                        )}
                        {project.deadline && (
                            <span className={`project-deadline ${overdue ? 'project-deadline--overdue' : ''}`}>
                                {formatDate(project.deadline)}
                                {overdue && ' ⚠'}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <Title title="Projects" />
            <div className="projects-page-wrapper">
                <div className="dashboard-section projects-section">
                    <div className="projects-card">
                        {/* Stats + Top Bar */}
                        <div className="projects-stats">
                            <div className="projects-stat-item">
                                <span className="projects-stat-label">Total Projects</span>
                                <span className="projects-stat-value">{totalProjectsCount}</span>
                            </div>
                            <div className="projects-stat-item">
                                <span className="projects-stat-label">Active</span>
                                <span className="projects-stat-value">{activeCount}</span>
                            </div>
                            <div className="projects-stat-item">
                                <span className="projects-stat-label">Completed</span>
                                <span className="projects-stat-value">{completedCount}</span>
                            </div>
                        </div>

                        <div className="projects-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => setShowAddForm(true)} className="btn-action">
                                    <i className="i-lucide-plus mr-1"></i>Add Project
                                </button>
                                <button onClick={handleExport} className="btn-action" disabled={totalProjectsCount === 0}>
                                    <i className="i-lucide-download mr-1"></i>Export
                                </button>
                                <button onClick={() => setShowImportModal(true)} className="btn-action">
                                    <i className="i-lucide-upload mr-1"></i>Import
                                </button>
                            </div>
                        </div>

                        {/* Add Project Modal */}
                        {showAddForm && !editingProject && (
                            <div className="import-modal-overlay" onClick={resetForm}>
                                <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                                    <h3 className="mb-4">Add New Project</h3>
                                    <form onSubmit={handleSubmit}>
                                        <div className="mb-4">
                                            <label className="form-label">Title</label>
                                            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="form-control" placeholder="Project title" required />
                                        </div>
                                        <div className="mb-4">
                                            <label className="form-label">Description</label>
                                            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="form-control" placeholder="Brief description (optional)" rows={2} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="form-label">Status</label>
                                                <select value={status} onChange={(e) => setStatus(e.target.value as 'planned' | 'active' | 'paused' | 'completed' | 'archived')} className="form-select">
                                                    <option value="planned">Planned</option>
                                                    <option value="active">Active</option>
                                                    <option value="paused">Paused</option>
                                                    <option value="completed">Completed</option>
                                                    <option value="archived">Archived</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">Priority</label>
                                                <select value={priority} onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')} className="form-select">
                                                    <option value="high">High</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="low">Low</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <label className="form-label">Deadline</label>
                                            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="form-control" />
                                        </div>
                                        <div className="flex gap-2 justify-end mt-5">
                                            <button type="button" onClick={resetForm} className="btn-form-cancel">Cancel</button>
                                            <button type="submit" className="btn-form-submit">Add Project</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Projects Content - always visible, modal overlays on top */}
                        {loading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading projects...</p>
                            </div>
                        ) : projects.length === 0 ? (
                            <div className="projects-empty">
                                <i className="i-lucide-folder-open projects-empty-icon"></i>
                                <p className="projects-empty-title">No projects added yet</p>
                                <p className="projects-empty-text">Add your first project to start tracking progress!</p>
                            </div>
                        ) : (
                            <div className="projects-two-col">
                                <div className="projects-left-col">
                                    <div className="search-container">
                                        <div className="search-input-wrapper">
                                            <i className="search-input-icon fa-solid fa-magnifying-glass"></i>
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onKeyDown={handleSearchKeyDown}
                                                className="search-input"
                                                placeholder='Search projects... (try #planned, #active, #paused, #completed, #archived)'
                                            />
                                            {(searchQuery || submittedSearch) && (
                                                <button
                                                    className="search-clear-btn"
                                                    onClick={clearSearch}
                                                    aria-label="Clear search"
                                                >
                                                    <i className="fa-solid fa-xmark"></i>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="projects-scroll-area">
                                        {submittedSearch && (
                                            <div>
                                                <div className="projects-section-header">
                                                    <i className="i-lucide-search"></i>
                                                    {getSearchHeader()}
                                                </div>
                                                {searchFiltered.length > 0 ? (
                                                    <div className="flex flex-col gap-2 mt-3">
                                                        {searchFiltered.map(renderProjectCard)}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm opacity-50 mt-2">No projects match your search.</p>
                                                )}
                                            </div>
                                        )}

                                        {!submittedSearch && plannedProjects.length > 0 && (
                                            <div className="projects-status-group">
                                                <div className="projects-section-header">
                                                    Planned ({plannedProjects.length})
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {plannedProjects.map(renderProjectCard)}
                                                </div>
                                            </div>
                                        )}

                                        {!submittedSearch && pausedProjects.length > 0 && (
                                            <div className="projects-status-group">
                                                <div className="projects-section-header">
                                                    Paused ({pausedProjects.length})
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {pausedProjects.map(renderProjectCard)}
                                                </div>
                                            </div>
                                        )}

                                        {!submittedSearch && completedProjects.length > 0 && (
                                            <div className="projects-status-group">
                                                <div className="projects-section-header">
                                                    Completed ({completedProjects.length})
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {completedProjects.map(renderProjectCard)}
                                                </div>
                                            </div>
                                        )}

                                        {!submittedSearch && archivedProjects.length > 0 && (
                                            <div className="projects-status-group">
                                                <div className="projects-section-header">
                                                    Archived ({archivedProjects.length})
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {archivedProjects.map(renderProjectCard)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="projects-right-col">
                                    <div className="projects-section-header">
                                        Active ({activeProjects.length})
                                    </div>
                                    <div className="projects-scroll-area">
                                        {activeProjects.length > 0 ? (
                                            <div className="flex flex-col gap-2 mt-3">
                                                {activeProjects.map(renderProjectCard)}
                                            </div>
                                        ) : (
                                            <div className="projects-empty py-6">
                                                <p className="projects-empty-text">No active projects.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit Project Modal */}
            {editModalProject && (
                <div className="import-modal-overlay" onClick={closeEditModal}>
                    <div className="import-modal-card edit-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Edit Project</h3>
                        <form onSubmit={handleEditSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Title</label>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="form-control"
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Description</label>
                                <textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    className="form-control edit-description-textarea"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Status</label>
                                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as 'planned' | 'active' | 'paused' | 'completed' | 'archived')} className="form-select">
                                        <option value="planned">Planned</option>
                                        <option value="active">Active</option>
                                        <option value="paused">Paused</option>
                                        <option value="completed">Completed</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Priority</label>
                                    <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as 'low' | 'medium' | 'high')} className="form-select">
                                        <option value="high">High</option>
                                        <option value="medium">Medium</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Progress</label>
                                <input
                                    type="number"
                                    value={editProgress}
                                    onChange={(e) => setEditProgress(e.target.value)}
                                    className="form-control"
                                    min="0"
                                    max="100"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Deadline</label>
                                <input
                                    type="date"
                                    value={editDeadline}
                                    onChange={(e) => setEditDeadline(e.target.value)}
                                    className="form-control"
                                />
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" onClick={closeEditModal} className="btn-form-cancel" disabled={editLoading}>Cancel</button>
                                <button type="submit" className="btn-form-submit" disabled={editLoading}>
                                    {editLoading ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Project Modal */}
            {viewProject && (
                <div className="import-modal-overlay" onClick={() => setViewProject(null)}>
                    <div className="import-modal-card project-view-card" onClick={(e) => e.stopPropagation()}>
                        <div className="project-view-header">
                            <h3>
                                {viewProject.title}
                                <span className="project-view-status-badge" style={{ backgroundColor: statusColors[viewProject.status] + '20', color: statusColors[viewProject.status] }}>
                                    {statusLabels[viewProject.status]}
                                </span>
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const p = viewProject;
                                        setViewProject(null);
                                        openEditModal(p);
                                    }}
                                    className="project-action-btn"
                                    title="Edit"
                                >
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button
                                    onClick={() => setViewProject(null)}
                                    className="project-action-btn"
                                    title="Close"
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>

                        <div className="project-view-content">
                            <div className="project-notes-section">
                                <div className="project-notes-label">Project Notes</div>
                                <textarea
                                    className="project-notes-editor"
                                    value={notesText}
                                    onChange={(e) => setNotesText(e.target.value)}
                                    onBlur={saveNotes}
                                    placeholder="Add notes to your project..."
                                    rows={6}
                                />
                            </div>

                            <div className="project-plan-section">
                                <div className="project-plan-header">
                                    <span className="project-plan-title">Project Plan ({planItems.length})</span>
                                </div>

                                <div className="project-plan-input-row">
                                    <input
                                        type="text"
                                        value={newPlanTitle}
                                        onChange={(e) => setNewPlanTitle(e.target.value)}
                                        onKeyDown={async (e) => {
                                            if (e.key === 'Enter' && newPlanTitle.trim()) {
                                                try {
                                                    await createProjectPlanItem({
                                                        project_id: viewProject.id!,
                                                        title: newPlanTitle.trim(),
                                                    });
                                                    await refreshPlanItems();
                                                    setNewPlanTitle('');
                                                } catch (err) {
                                                    setPlanError('Failed to add plan item. Please try again.');
                                                    console.error('Error creating plan item:', err);
                                                }
                                            }
                                        }}
                                        className="form-control"
                                        placeholder="Add task to plan..."
                                    />
                                    <button
                                        onClick={async () => {
                                            if (newPlanTitle.trim()) {
                                                try {
                                                    await createProjectPlanItem({
                                                        project_id: viewProject.id!,
                                                        title: newPlanTitle.trim(),
                                                    });
                                                    await refreshPlanItems();
                                                    setNewPlanTitle('');
                                                } catch (err) {
                                                    setPlanError('Failed to add plan item. Please try again.');
                                                    console.error('Error creating plan item:', err);
                                                }
                                            }
                                        }}
                                        className="btn-action"
                                        disabled={!newPlanTitle.trim()}
                                    >
                                        <i className="fa-solid fa-plus"></i>
                                    </button>
                                </div>

                                {planError && (
                                    <div className="auth-error mt-2" style={{ fontSize: '12px' }}>
                                        {planError}
                                    </div>
                                )}

                                <div className="project-plan-list">
                                    {planItems.length === 0 ? (
                                        <p className="text-xs opacity-50 mt-2">No plan items yet. Add one above!</p>
                                    ) : (
                                        <div className="flex flex-col gap-1 mt-2">
                                            {planItems.map(item => (
                                                <div key={item.id} className="project-plan-item">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.is_completed}
                                                        onChange={async () => {
                                                            try {
                                                                await toggleProjectPlanItemComplete(item.id!, item.is_completed);
                                                                await refreshPlanItems();
                                                            } catch (err) {
                                                                setPlanError('Failed to update plan item. Please try again.');
                                                                console.error('Error toggling plan item:', err);
                                                            }
                                                        }}
                                                        className="project-plan-checkbox"
                                                    />
                                                    <span className={`project-plan-item-text ${item.is_completed ? 'line-through opacity-60' : ''}`}>
                                                        {item.title}
                                                    </span>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await deleteProjectPlanItem(item.id!);
                                                                await refreshPlanItems();
                                                            } catch (err) {
                                                                setPlanError('Failed to delete plan item. Please try again.');
                                                                console.error('Error deleting plan item:', err);
                                                            }
                                                        }}
                                                        className="project-plan-delete-btn"
                                                    >
                                                        <i className="fa-solid fa-trash"></i>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="import-modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="import-modal-card delete-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Project</h3>
                        <p className="delete-modal-text">
                            Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>? This action cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-center mt-5">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="btn-form-cancel"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="btn-form-submit btn-form-submit--danger"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="import-modal-overlay">
                    <div className="import-modal-card">
                        <h3 className="mb-4">Import Projects from CSV</h3>
                        <p className="text-sm opacity-70 mb-2">
                            CSV format: <code className="bg-white/10 px-1 rounded">title,description,status,priority,deadline,notes</code>
                        </p>
                        <p className="text-xs opacity-60 mb-4">
                            • All columns are optional except title<br />
                            • If description/status/priority is empty, defaults will be used<br />
                            • Status options: planned, active, paused, completed, archived<br />
                            • Priority options: low, medium, high<br />
                            • Deadline format: YYYY-MM-DD
                        </p>
                        {importError && (<div className="auth-error mb-3">{importError}</div>)}
                        <input type="file" accept=".csv,text/csv" onChange={handleImport} className="form-control mb-4" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowImportModal(false)} className="btn-form-cancel">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ProjectsPage;