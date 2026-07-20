import React, { useState, useEffect } from 'react';
import Title from '../Components/Title';
import { getUserProjects, createProject, updateProject, deleteProject } from '../services/projectService';
import type { Project } from '../services/projectService';

const priorityColors: Record<string, string> = {
    low: '#43b67d',
    medium: '#ffa500',
    high: '#ff6b70',
};

const statusLabels: Record<string, string> = {
    active: 'Active',
    paused: 'Paused',
    completed: 'Completed',
    archived: 'Archived',
};

const statusColors: Record<string, string> = {
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

    // Delete confirmation modal
    const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

    // Edit modal state
    const [editModalProject, setEditModalProject] = useState<Project | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editStatus, setEditStatus] = useState<'active' | 'paused' | 'completed' | 'archived'>('active');
    const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');
    const [editProgress, setEditProgress] = useState('');
    const [editDeadline, setEditDeadline] = useState('');

    // Add form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<'active' | 'paused' | 'completed' | 'archived'>('active');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
    const [deadline, setDeadline] = useState('');

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
            progress: 100,
            completed_at: new Date().toISOString().split('T')[0],
        });
        const refreshedProjects = await getUserProjects();
        setProjects(refreshedProjects);
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setStatus('active');
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
        setEditProgress(project.progress.toString());
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

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            setSubmittedSearch(searchQuery);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSubmittedSearch('');
    };

    const activeProjects = projects.filter(p => p.status === 'active');
    const completedProjects = projects.filter(p => p.status === 'completed');
    const pausedProjects = projects.filter(p => p.status === 'paused');
    const archivedProjects = projects.filter(p => p.status === 'archived');

    const tagMatch = submittedSearch.match(/^(#\w+)\s*(.*)/i);
    const activeTag = tagMatch ? tagMatch[1].toLowerCase() : null;
    const textSearch = tagMatch ? tagMatch[2].trim() : submittedSearch.trim();

    const getFilteredProjects = () => {
        if (!submittedSearch) return [];

        let filtered = projects;

        if (activeTag === '#active') {
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

    const renderProjectCard = (project: Project) => {
        const overdue = project.status !== 'completed' && project.status !== 'archived' && isOverdue(project.deadline);

        return (
            <div key={project.id} className="project-card">
                <div className="project-card-top">
                    <div className="project-title-section">
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
                                <i className="fa-regular fa-calendar mr-1"></i>
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
                                                <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'paused' | 'completed' | 'archived')} className="form-select">
                                                    <option value="active">Active</option>
                                                    <option value="paused">Paused</option>
                                                    <option value="completed">Completed</option>
                                                    <option value="archived">Archived</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">Priority</label>
                                                <select value={priority} onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')} className="form-select">
                                                    <option value="low">Low</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="high">High</option>
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
                                                placeholder='Search projects... (try #active, #paused, #completed, #archived)'
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

                                        {!submittedSearch && activeProjects.length > 0 && (
                                            <div className="projects-status-group">
                                                <div className="projects-section-header">
                                                    <i className="i-lucide-play-circle"></i>
                                                    Active ({activeProjects.length})
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {activeProjects.map(renderProjectCard)}
                                                </div>
                                            </div>
                                        )}

                                        {!submittedSearch && pausedProjects.length > 0 && (
                                            <div className="projects-status-group">
                                                <div className="projects-section-header">
                                                    <i className="i-lucide-pause-circle"></i>
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
                                                    <i className="i-lucide-check-circle"></i>
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
                                                    <i className="i-lucide-archive"></i>
                                                    Archived ({archivedProjects.length})
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {archivedProjects.map(renderProjectCard)}
                                                </div>
                                            </div>
                                        )}

                                        {!submittedSearch && projects.length > 0 && activeProjects.length === 0 && pausedProjects.length === 0 && completedProjects.length === 0 && archivedProjects.length === 0 && (
                                            <div className="projects-empty py-6">
                                                <p className="projects-empty-text">All projects are in other statuses.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="projects-right-col">
                                    <div className="projects-section-header">
                                        <i className="i-lucide-trending-up"></i>
                                        Overview
                                    </div>
                                    <div className="projects-scroll-area">
                                        <div className="flex flex-col gap-3 mt-3">
                                            <div className="project-overview-item">
                                                <span className="project-overview-label">Completion Rate</span>
                                                <span className="project-overview-value">
                                                    {totalProjectsCount > 0
                                                        ? Math.round((completedCount / totalProjectsCount) * 100)
                                                        : 0}%
                                                </span>
                                            </div>
                                            <div className="project-overview-item">
                                                <span className="project-overview-label">Total Active</span>
                                                <span className="project-overview-value">{activeCount}</span>
                                            </div>
                                            <div className="project-overview-item">
                                                <span className="project-overview-label">Average Progress</span>
                                                <span className="project-overview-value">
                                                    {totalProjectsCount > 0
                                                        ? Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / totalProjectsCount)
                                                        : 0}%
                                                </span>
                                            </div>
                                        </div>
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
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
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
                                    className="form-control"
                                    rows={2}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Status</label>
                                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as 'active' | 'paused' | 'completed' | 'archived')} className="form-select">
                                        <option value="active">Active</option>
                                        <option value="paused">Paused</option>
                                        <option value="completed">Completed</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Priority</label>
                                    <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as 'low' | 'medium' | 'high')} className="form-select">
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>
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
        </>
    );
};

export default ProjectsPage;