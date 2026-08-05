import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import {
    getAllPRs,
    type PRHistory
} from '../services/workoutService';

const WorkoutPRsPage: React.FC = () => {
    const navigate = useNavigate();
    const [prs, setPrs] = useState<PRHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPR, setSelectedPR] = useState<PRHistory | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadPRs();
    }, []);

    const loadPRs = async () => {
        try {
            setLoading(true);
            const allPRs = await getAllPRs();
            setPrs(allPRs);
        } catch (error) {
            console.error('Error loading PRs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePRClick = (pr: PRHistory) => {
        setSelectedPR(pr);
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            weekday: 'long',
            month: 'long', 
            day: 'numeric', 
            year: 'numeric' 
        });
    };

    // Group PRs by exercise name
    const groupedPRs = prs.reduce((acc, pr) => {
        if (!acc[pr.exercise_name]) {
            acc[pr.exercise_name] = [];
        }
        acc[pr.exercise_name].push(pr);
        return acc;
    }, {} as Record<string, PRHistory[]>);

    // Get unique exercise names
    const exerciseNames = Object.keys(groupedPRs).sort();

    const filteredPRs = prs.filter(pr =>
        pr.exercise_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pr.workout_date.includes(searchQuery)
    );

    const renderPRCard = (pr: PRHistory) => {
        return (
            <div 
                key={pr.id} 
                className="workout-pr-card"
                onClick={() => handlePRClick(pr)}
            >
                <div className="workout-pr-card__top">
                    <div className="workout-pr-card__title-section">
                        <h3 className="workout-pr-card__title">
                            <i className="fa-solid fa-trophy workout-pr-card__icon"></i>
                            {pr.exercise_name}
                        </h3>
                        <p className="workout-pr-card__date">{formatDate(pr.workout_date)}</p>
                    </div>
                    <div className="workout-pr-card__chevron">
                        <i className="fa-solid fa-chevron-right"></i>
                    </div>
                </div>
                <div className="workout-pr-card__stats">
                    {pr.weight !== undefined && (
                        <div className="workout-pr-card__stat">
                            <span className="workout-pr-card__stat-label">Weight</span>
                            <span className="workout-pr-card__stat-value">{pr.weight}kg</span>
                        </div>
                    )}
                    {pr.reps !== undefined && (
                        <div className="workout-pr-card__stat">
                            <span className="workout-pr-card__stat-label">Reps</span>
                            <span className="workout-pr-card__stat-value">{pr.reps}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <Title title="Personal Records" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        {/* Stats */}
                        <div className="workout-pr-stats">
                            <div className="workout-pr-stat-item">
                                <span className="workout-pr-stat-label">Total PRs</span>
                                <span className="workout-pr-stat-value">{prs.length}</span>
                            </div>
                            <div className="workout-pr-stat-item">
                                <span className="workout-pr-stat-label">Exercises</span>
                                <span className="workout-pr-stat-value">{exerciseNames.length}</span>
                            </div>
                        </div>

                        {/* Top Bar */}
                        <div className="workout-pr-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => navigate('/Workouts')} className="btn-action">
                                    <i className="fa-solid fa-dumbbell mr-1"></i>Dashboard
                                </button>
                                <button onClick={() => navigate('/Workouts/Check')} className="btn-action">
                                    <i className="fa-solid fa-clipboard-check mr-1"></i>Log Workout
                                </button>
                                <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                    <i className="fa-solid fa-layer-group mr-1"></i>Templates
                                </button>
                                <button onClick={() => navigate('/Workouts/History')} className="btn-action">
                                    <i className="fa-solid fa-clock-rotate-left mr-1"></i>History
                                </button>
                            </div>
                            <div className="search-container workout-pr-search">
                                <div className="search-input-wrapper">
                                    <i className="search-input-icon fa-solid fa-magnifying-glass"></i>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                        placeholder="Search PRs..."
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

                        {/* Content */}
                        {loading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading PRs...</p>
                            </div>
                        ) : (
                            <div className="workout-pr-content">
                                {selectedPR ? (
                                    <div className="workout-pr-selected">
                                        <div className="workout-pr-selected__header">
                                            <button 
                                                onClick={() => setSelectedPR(null)}
                                                className="workout-pr-selected__back"
                                            >
                                                <i className="fa-solid fa-arrow-left mr-1"></i>Back
                                            </button>
                                            <h3>
                                                <i className="fa-solid fa-trophy mr-1"></i>
                                                {selectedPR.exercise_name}
                                            </h3>
                                        </div>
                                        <p className="workout-pr-selected__date">Achieved on {formatDate(selectedPR.workout_date)}</p>

                                        <div className="workout-pr-selected__stats">
                                            {selectedPR.weight !== undefined && (
                                                <div className="workout-pr-selected__stat">
                                                    <span className="workout-pr-selected__stat-label">Weight</span>
                                                    <span className="workout-pr-selected__stat-value">{selectedPR.weight}kg</span>
                                                </div>
                                            )}
                                            {selectedPR.reps !== undefined && (
                                                <div className="workout-pr-selected__stat">
                                                    <span className="workout-pr-selected__stat-label">Reps</span>
                                                    <span className="workout-pr-selected__stat-value">{selectedPR.reps}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Exercise History */}
                                        {groupedPRs[selectedPR.exercise_name] && groupedPRs[selectedPR.exercise_name].length > 1 && (
                                            <div className="workout-pr-progression">
                                                <h4>Progression for {selectedPR.exercise_name}</h4>
                                                <div className="workout-pr-progression__list">
                                                    {groupedPRs[selectedPR.exercise_name]
                                                        .sort((a, b) => new Date(b.workout_date).getTime() - new Date(a.workout_date).getTime())
                                                        .map((pr) => (
                                                            <div 
                                                                key={pr.id} 
                                                                className={`workout-pr-progression-item ${pr.id === selectedPR.id ? 'workout-pr-progression-item--selected' : ''}`}
                                                                onClick={() => setSelectedPR(pr)}
                                                            >
                                                                <div className="workout-pr-progression-item__date">{formatDate(pr.workout_date)}</div>
                                                                <div className="workout-pr-progression-item__stats">
                                                                    {pr.weight !== undefined && `${pr.weight}kg`}
                                                                    {pr.weight !== undefined && pr.reps !== undefined && ' • '}
                                                                    {pr.reps !== undefined && `${pr.reps} reps`}
                                                                </div>
                                                                {pr.id === selectedPR.id && (
                                                                    <div className="workout-pr-progression-item__trophy">
                                                                        <i className="fa-solid fa-trophy"></i>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        {filteredPRs.length > 0 ? (
                                            <div className="workout-pr-grid">
                                                {filteredPRs.map(renderPRCard)}
                                            </div>
                                        ) : (
                                            <div className="workout-pr-empty">
                                                <i className="fa-solid fa-trophy workout-pr-empty__icon"></i>
                                                <p className="workout-pr-empty__title">No personal records yet</p>
                                                <p className="workout-pr-empty__text">Start logging workouts to set your first PR!</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutPRsPage;