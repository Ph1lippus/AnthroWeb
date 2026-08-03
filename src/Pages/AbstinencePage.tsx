import React, { useState, useEffect, useRef } from 'react';
import Title from '../Components/Title';
import {
    getUserAbstinenceGoals,
    getUserAbstinenceHistory,
    createAbstinenceGoal,
    updateAbstinenceGoal,
    deleteAbstinenceGoal,
    endAbstinenceGoal,
    deleteAbstinenceHistory,
    exportAbstinenceToCSV,
    importAbstinenceFromCSV,
} from '../services/abstinenceService';
import type { AbstinenceGoal, AbstinenceHistory } from '../services/abstinenceService';

const AbstinencePage: React.FC = () => {
    const [goals, setGoals] = useState<AbstinenceGoal[]>([]);
    const [history, setHistory] = useState<AbstinenceHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [submittedSearch, setSubmittedSearch] = useState('');

    // Edit modal state
    const [editModalGoal, setEditModalGoal] = useState<AbstinenceGoal | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editName, setEditName] = useState('');
    const [editStartDate, setEditStartDate] = useState('');
    const [editEndDate, setEditEndDate] = useState('');
    const [editTargetDays, setEditTargetDays] = useState('');
    const [editNotes, setEditNotes] = useState('');

    // Add form state
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState('');
    const [targetDays, setTargetDays] = useState('');
    const [notes, setNotes] = useState('');

    // Delete confirmation modal
    const [deleteTarget, setDeleteTarget] = useState<AbstinenceGoal | AbstinenceHistory | null>(null);
    const [deleteType, setDeleteType] = useState<'goal' | 'history'>('goal');

    // End confirmation modal
    const [endTarget, setEndTarget] = useState<AbstinenceGoal | null>(null);

    // View modal
    const [viewGoal, setViewGoal] = useState<AbstinenceGoal | null>(null);
    const [viewNotes, setViewNotes] = useState('');
    const [notesSaving, setNotesSaving] = useState(false);
    const [notesSaved, setNotesSaved] = useState(false);

    // Import modal state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    // Toast notification state
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (type: 'success' | 'error' | 'info', message: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ type, message });
        toastTimerRef.current = setTimeout(() => setToast(null), 2500);
    };

    // Fetch all data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            const [allGoals, allHistory] = await Promise.all([
                getUserAbstinenceGoals(),
                getUserAbstinenceHistory(),
            ]);
            setGoals(allGoals);
            setHistory(allHistory);
            setLoading(false);
        };
        loadData();
    }, []);

    const resetForm = () => {
        setName('');
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate('');
        setTargetDays('');
        setNotes('');
        setShowAddForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            await createAbstinenceGoal({
                name,
                start_date: startDate || undefined,
                end_date: endDate || null,
                target_days: targetDays ? parseInt(targetDays) : null,
                notes: notes || undefined,
            });
            showToast('success', 'Abstinence goal created successfully');

            const [refreshedGoals, refreshedHistory] = await Promise.all([
                getUserAbstinenceGoals(),
                getUserAbstinenceHistory(),
            ]);
            setGoals(refreshedGoals);
            setHistory(refreshedHistory);
            resetForm();
        } catch {
            showToast('error', 'Failed to save abstinence goal');
        }
    };

    const openEditModal = (goal: AbstinenceGoal) => {
        setEditModalGoal(goal);
        setEditName(goal.name);
        setEditStartDate(goal.start_date);
        setEditEndDate(goal.end_date || '');
        setEditTargetDays(goal.target_days?.toString() || '');
        setEditNotes(goal.notes || '');
    };

    const closeEditModal = () => {
        setEditModalGoal(null);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editModalGoal) return;

        setEditLoading(true);
        try {
            await updateAbstinenceGoal(editModalGoal.id!, {
                name: editName,
                start_date: editStartDate,
                end_date: editEndDate || null,
                target_days: editTargetDays ? parseInt(editTargetDays) : null,
                notes: editNotes || undefined,
            });

            const [refreshedGoals, refreshedHistory] = await Promise.all([
                getUserAbstinenceGoals(),
                getUserAbstinenceHistory(),
            ]);
            setGoals(refreshedGoals);
            setHistory(refreshedHistory);
            closeEditModal();
            showToast('success', 'Abstinence goal updated successfully');
        } catch {
            showToast('error', 'Failed to update abstinence goal');
        } finally {
            setEditLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        const deletedName = 'name' in deleteTarget ? deleteTarget.name : '';

        try {
            if (deleteType === 'goal') {
                await deleteAbstinenceGoal(deleteTarget.id!);
            } else {
                await deleteAbstinenceHistory(deleteTarget.id!);
            }
            const [refreshedGoals, refreshedHistory] = await Promise.all([
                getUserAbstinenceGoals(),
                getUserAbstinenceHistory(),
            ]);
            setGoals(refreshedGoals);
            setHistory(refreshedHistory);
            setDeleteTarget(null);
            showToast('error', `Deleted "${deletedName}"`);
        } catch {
            showToast('error', 'Failed to delete');
        }
    };

    const handleEndGoal = async () => {
        if (!endTarget) return;
        const endedName = endTarget.name;

        try {
            await endAbstinenceGoal(endTarget);
            const [refreshedGoals, refreshedHistory] = await Promise.all([
                getUserAbstinenceGoals(),
                getUserAbstinenceHistory(),
            ]);
            setGoals(refreshedGoals);
            setHistory(refreshedHistory);
            setEndTarget(null);
            showToast('success', `Ended "${endedName}" — moved to history`);
        } catch {
            showToast('error', 'Failed to end abstinence goal');
        }
    };

    const handleExport = async () => {
        const csv = exportAbstinenceToCSV(goals);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `abstinence-export-${new Date().toISOString().split('T')[0]}.csv`;
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
                await importAbstinenceFromCSV(content);
                setImportError(null);
                setShowImportModal(false);
                const [refreshedGoals, refreshedHistory] = await Promise.all([
                    getUserAbstinenceGoals(),
                    getUserAbstinenceHistory(),
                ]);
                setGoals(refreshedGoals);
                setHistory(refreshedHistory);
                showToast('success', 'Abstinence goals imported successfully');
            } catch {
                setImportError('Failed to import abstinence goals. Please check your CSV format.');
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

    // Calculate days since start date
    const getDaysSince = (startDate: string): number => {
        const start = new Date(startDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        start.setHours(0, 0, 0, 0);
        return Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    };

    // Calculate progress percentage based on target days
    const getProgressPct = (goal: AbstinenceGoal): number => {
        if (!goal.target_days || goal.target_days === 0) return 0;
        const days = getDaysSince(goal.start_date);
        return Math.min(100, Math.round((days / goal.target_days) * 100));
    };

    const formatDate = (dateStr?: string | null) => {
        if (!dateStr) return null;
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const saveNotes = async () => {
        if (!viewGoal) return;
        setNotesSaving(true);
        setNotesSaved(false);
        try {
            await updateAbstinenceGoal(viewGoal.id!, { notes: viewNotes });
            setViewGoal(prev => prev ? { ...prev, notes: viewNotes } : prev);
            setGoals(prev => prev.map(g => g.id === viewGoal.id ? { ...g, notes: viewNotes } : g));
            setNotesSaved(true);
            setTimeout(() => setNotesSaved(false), 3000);
        } catch (err) {
            console.error('Error saving notes:', err);
            setNotesSaved(false);
        } finally {
            setNotesSaving(false);
        }
    };

    const openViewModal = (goal: AbstinenceGoal) => {
        setViewGoal(goal);
        setViewNotes(goal.notes || '');
    };

    // Search filtering
    const tagMatch = submittedSearch.match(/^(#\w+)\s*(.*)/i);
    const activeTag = tagMatch ? tagMatch[1].toLowerCase() : null;
    const textSearch = tagMatch ? tagMatch[2].trim() : submittedSearch.trim();

    const getFilteredItems = () => {
        if (!submittedSearch) return { goals: [], history: [] };

        let filteredGoals = goals;
        let filteredHistory = history;

        if (activeTag === '#active') {
            filteredGoals = goals;
            filteredHistory = [];
        } else if (activeTag === '#history') {
            filteredGoals = [];
            filteredHistory = history;
        }

        if (textSearch) {
            filteredGoals = filteredGoals.filter(g =>
                g.name.toLowerCase().includes(textSearch.toLowerCase())
            );
            filteredHistory = filteredHistory.filter(h =>
                h.name.toLowerCase().includes(textSearch.toLowerCase())
            );
        }

        return { goals: filteredGoals, history: filteredHistory };
    };

    const searchFiltered = getFilteredItems();

    const getSearchHeader = () => {
        if (!submittedSearch) return '';
        const count = searchFiltered.goals.length + searchFiltered.history.length;
        const label = activeTag ? `${activeTag} ` : '';
        return `${label}Results (${count})`;
    };

    // Stats
    const totalGoalsCount = goals.length;
    const activeCount = goals.length;
    const bestStreak = history.length > 0
        ? Math.max(...history.map(h => h.duration_days))
        : 0;
    const longestActiveStreak = goals.length > 0
        ? Math.max(...goals.map(g => getDaysSince(g.start_date)))
        : 0;

    const renderGoalCard = (goal: AbstinenceGoal) => {
        const days = getDaysSince(goal.start_date);
        const progress = getProgressPct(goal);
        const isComplete = goal.target_days && days >= goal.target_days;

        return (
            <div key={goal.id} className="abstinence-card">
                <div className="abstinence-card-top">
                    <div className="abstinence-title-section" onClick={() => openViewModal(goal)} style={{ cursor: 'pointer' }}>
                        <h3 className="abstinence-title">{goal.name}</h3>
                        <div className="abstinence-badges">
                            <span
                                className="abstinence-day-badge"
                                style={{
                                    backgroundColor: isComplete ? '#43b67d20' : 'var(--color-primary)20',
                                    color: isComplete ? '#43b67d' : 'var(--color-primary)',
                                    borderColor: isComplete ? '#43b67d40' : 'var(--color-primary)40',
                                }}
                            >
                                {days} {days === 1 ? 'day' : 'days'}
                            </span>
                            {goal.target_days && (
                                <span
                                    className="abstinence-target-badge"
                                    style={{
                                        backgroundColor: isComplete ? '#43b67d20' : '#ffa50020',
                                        color: isComplete ? '#43b67d' : '#ffa500',
                                        borderColor: isComplete ? '#43b67d40' : '#ffa50040',
                                    }}
                                >
                                    / {goal.target_days}d target
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button
                            onClick={() => openEditModal(goal)}
                            className="abstinence-action-btn"
                            title="Edit goal"
                            aria-label="Edit goal"
                        >
                            <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button
                            onClick={() => setEndTarget(goal)}
                            className="abstinence-action-btn abstinence-action-btn--end"
                            title="End streak (move to history)"
                            aria-label="End streak"
                        >
                            <i className="fa-solid fa-flag-checkered"></i>
                        </button>
                        <button
                            onClick={() => {
                                setDeleteTarget(goal);
                                setDeleteType('goal');
                            }}
                            className="abstinence-action-btn abstinence-action-btn--danger"
                            title="Delete goal"
                            aria-label="Delete goal"
                        >
                            <i className="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                {goal.target_days && (
                    <div className="abstinence-card-details">
                        <div className="flex items-center gap-2 flex-1">
                            <div className="progress-bar flex-1 h-1.5">
                                <div
                                    className="progress-fill"
                                    style={{
                                        width: `${progress}%`,
                                        background: isComplete ? '#43b67d' : 'var(--color-primary)',
                                    }}
                                ></div>
                            </div>
                            <span className="abstinence-progress-pct">{progress}%</span>
                        </div>
                    </div>
                )}
                {goal.notes && (
                    <p className="abstinence-description">{goal.notes}</p>
                )}
                <div className="abstinence-card-info">
                    <span className="abstinence-start-date">
                        <i className="fa-regular fa-calendar"></i> {formatDate(goal.start_date)}
                    </span>
                </div>
            </div>
        );
    };

    const renderHistoryCard = (entry: AbstinenceHistory) => (
        <div key={entry.id} className="abstinence-card abstinence-card--history">
            <div className="abstinence-card-top">
                <div className="abstinence-title-section">
                    <h3 className="abstinence-title">{entry.name}</h3>
                    <div className="abstinence-badges">
                        <span
                            className="abstinence-day-badge"
                            style={{
                                backgroundColor: '#43b67d20',
                                color: '#43b67d',
                                borderColor: '#43b67d40',
                            }}
                        >
                            {entry.duration_days} {entry.duration_days === 1 ? 'day' : 'days'}
                        </span>
                    </div>
                </div>
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={() => {
                            setDeleteTarget(entry);
                            setDeleteType('history');
                        }}
                        className="abstinence-action-btn abstinence-action-btn--danger"
                        title="Delete history entry"
                        aria-label="Delete history entry"
                    >
                        <i className="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            {entry.notes && (
                <p className="abstinence-description">{entry.notes}</p>
            )}
            <div className="abstinence-card-info">
                <span className="abstinence-start-date">
                    <i className="fa-regular fa-calendar"></i> {formatDate(entry.start_date)} — {formatDate(entry.end_date)}
                </span>
            </div>
        </div>
    );

    return (
        <>
            <Title title="Abstinence" />
            <div className="abstinence-page-wrapper">
                <div className="dashboard-section abstinence-section">
                    <div className="abstinence-card-container">
                        {/* Stats + Top Bar */}
                        <div className="abstinence-stats">
                            <div className="abstinence-stat-item">
                                <span className="abstinence-stat-label">Active Streaks</span>
                                <span className="abstinence-stat-value">{activeCount}</span>
                            </div>
                            <div className="abstinence-stat-item">
                                <span className="abstinence-stat-label">Longest Active</span>
                                <span className="abstinence-stat-value">{longestActiveStreak}d</span>
                            </div>
                            <div className="abstinence-stat-item">
                                <span className="abstinence-stat-label">Best Streak</span>
                                <span className="abstinence-stat-value">{bestStreak}d</span>
                            </div>
                        </div>

                        <div className="abstinence-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => setShowAddForm(true)} className="btn-action">
                                    <i className="i-lucide-plus mr-1"></i>Add Goal
                                </button>
                                <button onClick={handleExport} className="btn-action" disabled={totalGoalsCount === 0}>
                                    <i className="i-lucide-download mr-1"></i>Export
                                </button>
                                <button onClick={() => setShowImportModal(true)} className="btn-action">
                                    <i className="i-lucide-upload mr-1"></i>Import
                                </button>
                            </div>
                        </div>

                        {/* Add Goal Modal */}
                        {showAddForm && (
                            <div className="import-modal-overlay" onClick={resetForm}>
                                <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                                    <h3 className="mb-4">Add New Abstinence Goal</h3>
                                    <form onSubmit={handleSubmit}>
                                        <div className="mb-4">
                                            <label className="form-label">Name</label>
                                            <input
                                                type="text"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="form-control"
                                                placeholder="e.g., No sugar, No caffeine, No social media..."
                                                required
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="form-label">Start Date</label>
                                                <input
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(e) => setStartDate(e.target.value)}
                                                    className="form-control"
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">Target Days (optional)</label>
                                                <input
                                                    type="number"
                                                    value={targetDays}
                                                    onChange={(e) => setTargetDays(e.target.value)}
                                                    className="form-control"
                                                    placeholder="e.g., 30, 90, 365"
                                                    min="1"
                                                />
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <label className="form-label">End Date (optional)</label>
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="form-control"
                                            />
                                        </div>
                                        <div className="mb-4">
                                            <label className="form-label">Notes</label>
                                            <textarea
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                className="form-control"
                                                placeholder="Add notes or motivation (optional)"
                                                rows={2}
                                            />
                                        </div>
                                        <div className="flex gap-2 justify-end mt-5">
                                            <button type="button" onClick={resetForm} className="btn-form-cancel">Cancel</button>
                                            <button type="submit" className="btn-form-submit">Add Goal</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Content */}
                        {loading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading abstinence goals...</p>
                            </div>
                        ) : goals.length === 0 && history.length === 0 ? (
                            <div className="abstinence-empty">
                                <i className="fa-solid fa-shield-halved abstinence-empty-icon"></i>
                                <p className="abstinence-empty-title">No abstinence goals yet</p>
                                <p className="abstinence-empty-text">Add your first goal to start tracking your streaks!</p>
                            </div>
                        ) : (
                            <div className="abstinence-two-col">
                                <div className="abstinence-left-col">
                                    <div className="search-container">
                                        <div className="search-input-wrapper">
                                            <i className="search-input-icon fa-solid fa-magnifying-glass"></i>
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onKeyDown={handleSearchKeyDown}
                                                className="search-input"
                                                placeholder='Search... (try #active, #history)'
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

                                    <div className="abstinence-scroll-area">
                                        {submittedSearch && (
                                            <div>
                                                <div className="abstinence-section-header">
                                                    <i className="i-lucide-search"></i>
                                                    {getSearchHeader()}
                                                </div>
                                                {searchFiltered.goals.length > 0 || searchFiltered.history.length > 0 ? (
                                                    <div className="flex flex-col gap-2 mt-3">
                                                        {searchFiltered.goals.map(renderGoalCard)}
                                                        {searchFiltered.history.map(renderHistoryCard)}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm opacity-50 mt-2">No results match your search.</p>
                                                )}
                                            </div>
                                        )}

                                        {!submittedSearch && history.length > 0 && (
                                            <div className="abstinence-status-group">
                                                <div className="abstinence-section-header">
                                                    <i className="fa-solid fa-clock-rotate-left"></i>
                                                    History ({history.length})
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {history.map(renderHistoryCard)}
                                                </div>
                                            </div>
                                        )}

                                        {!submittedSearch && history.length === 0 && goals.length > 0 && (
                                            <div className="mt-2">
                                                <div className="text-xs opacity-40">
                                                    No completed streaks yet &mdash; press Enter to search
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="abstinence-right-col">
                                    <div className="abstinence-section-header">
                                        <i className="fa-solid fa-fire"></i>
                                        Active Streaks ({goals.length})
                                    </div>
                                    <div className="abstinence-scroll-area">
                                        {goals.length > 0 ? (
                                            <div className="flex flex-col gap-2 mt-3">
                                                {goals.map(renderGoalCard)}
                                            </div>
                                        ) : (
                                            <div className="abstinence-empty py-6">
                                                <p className="abstinence-empty-text">No active streaks. Add a goal to begin!</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {editModalGoal && (
                <div className="import-modal-overlay" onClick={closeEditModal}>
                    <div className="import-modal-card edit-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Edit Abstinence Goal</h3>
                        <form onSubmit={handleEditSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="form-control"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Start Date</label>
                                    <input
                                        type="date"
                                        value={editStartDate}
                                        onChange={(e) => setEditStartDate(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Target Days</label>
                                    <input
                                        type="number"
                                        value={editTargetDays}
                                        onChange={(e) => setEditTargetDays(e.target.value)}
                                        className="form-control"
                                        min="1"
                                    />
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="form-label">End Date (optional)</label>
                                <input
                                    type="date"
                                    value={editEndDate}
                                    onChange={(e) => setEditEndDate(e.target.value)}
                                    className="form-control"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Notes</label>
                                <textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    className="form-control edit-description-textarea"
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

            {/* View Goal Modal */}
            {viewGoal && (
                <div className="import-modal-overlay" onClick={() => setViewGoal(null)}>
                    <div className="import-modal-card abstinence-view-card" onClick={(e) => e.stopPropagation()}>
                        <div className="abstinence-view-header">
                            <h3>
                                {viewGoal.name}
                                <span
                                    className="abstinence-view-day-badge"
                                    style={{
                                        backgroundColor: 'var(--color-primary)20',
                                        color: 'var(--color-primary)',
                                    }}
                                >
                                    {getDaysSince(viewGoal.start_date)} days
                                </span>
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const g = viewGoal;
                                        setViewGoal(null);
                                        openEditModal(g);
                                    }}
                                    className="abstinence-action-btn"
                                    title="Edit"
                                >
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button
                                    onClick={() => setViewGoal(null)}
                                    className="abstinence-action-btn"
                                    title="Close"
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>

                        <div className="abstinence-view-content">
                            <div className="abstinence-view-stats">
                                <div className="abstinence-view-stat">
                                    <span className="abstinence-view-stat-label">Started</span>
                                    <span className="abstinence-view-stat-value">{formatDate(viewGoal.start_date)}</span>
                                </div>
                                {viewGoal.target_days && (
                                    <div className="abstinence-view-stat">
                                        <span className="abstinence-view-stat-label">Target</span>
                                        <span className="abstinence-view-stat-value">{viewGoal.target_days} days</span>
                                    </div>
                                )}
                                <div className="abstinence-view-stat">
                                    <span className="abstinence-view-stat-label">Current</span>
                                    <span className="abstinence-view-stat-value">{getDaysSince(viewGoal.start_date)} days</span>
                                </div>
                                {viewGoal.target_days && (
                                    <div className="abstinence-view-stat">
                                        <span className="abstinence-view-stat-label">Progress</span>
                                        <span className="abstinence-view-stat-value">{getProgressPct(viewGoal)}%</span>
                                    </div>
                                )}
                            </div>

                            {viewGoal.target_days && (
                                <div className="abstinence-view-progress-section">
                                    <div className="progress-bar h-2">
                                        <div
                                            className="progress-fill"
                                            style={{
                                                width: `${getProgressPct(viewGoal)}%`,
                                                background: getProgressPct(viewGoal) >= 100 ? '#43b67d' : 'var(--color-primary)',
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            )}

                            <div className="abstinence-notes-section">
                                <div className="abstinence-notes-label">Notes</div>
                                <textarea
                                    className="abstinence-notes-editor"
                                    value={viewNotes}
                                    onChange={(e) => setViewNotes(e.target.value)}
                                    placeholder="Add notes to your goal..."
                                    rows={6}
                                />
                                <div className="abstinence-notes-actions">
                                    <button
                                        onClick={saveNotes}
                                        className="btn-action"
                                        disabled={notesSaving}
                                    >
                                        {notesSaving ? 'Saving...' : 'Save Notes'}
                                    </button>
                                    {notesSaved && (
                                        <span className="notes-saved-message">
                                            <i className="fa-solid fa-check mr-1"></i>Saved!
                                        </span>
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
                        <h3 className="mb-4">Delete {deleteType === 'goal' ? 'Goal' : 'History Entry'}</h3>
                        <p className="delete-modal-text">
                            Are you sure you want to delete <strong>"{('name' in deleteTarget ? deleteTarget.name : '')}"</strong>? This action cannot be undone.
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

            {/* End Streak Confirmation Modal */}
            {endTarget && (
                <div className="import-modal-overlay" onClick={() => setEndTarget(null)}>
                    <div className="import-modal-card delete-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">End Streak</h3>
                        <p className="delete-modal-text">
                            Are you sure you want to end the streak for <strong>"{endTarget.name}"</strong>?
                            <br />
                            <span className="text-sm opacity-60">
                                It lasted <strong>{getDaysSince(endTarget.start_date)} days</strong> and will be moved to history.
                            </span>
                        </p>
                        <div className="flex gap-2 justify-center mt-5">
                            <button
                                type="button"
                                onClick={() => setEndTarget(null)}
                                className="btn-form-cancel"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleEndGoal}
                                className="btn-form-submit"
                            >
                                End Streak
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="import-modal-overlay">
                    <div className="import-modal-card">
                        <h3 className="mb-4">Import Abstinence Goals from CSV</h3>
                        <p className="text-sm opacity-70 mb-2">
                            CSV format: <code className="bg-white/10 px-1 rounded">name,start_date,end_date,target_days,notes</code>
                        </p>
                        <p className="text-xs opacity-60 mb-4">
                            • All columns are optional except name<br />
                            • If start_date is empty, today will be used<br />
                            • Date format: YYYY-MM-DD<br />
                            • If target_days is empty, it will be null (no target)
                        </p>
                        {importError && (<div className="auth-error mb-3">{importError}</div>)}
                        <input type="file" accept=".csv,text/csv" onChange={handleImport} className="form-control mb-4" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowImportModal(false)} className="btn-form-cancel">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className="toast-container">
                    <div className={`toast toast--${toast.type}`}>
                        <i className={`toast-icon ${toast.type === 'success' ? 'i-lucide-check-circle' : toast.type === 'error' ? 'i-lucide-x-circle' : 'i-lucide-info'}`}></i>
                        <span className="toast-text">{toast.message}</span>
                    </div>
                </div>
            )}
        </>
    );
};

export default AbstinencePage;