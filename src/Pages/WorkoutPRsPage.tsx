import React, { useState } from 'react';
import Title from '../Components/Title';
import WorkoutsNav from '../Components/Workout/WorkoutsNav';
import PRList from '../Components/Workout/PRList';
import { usePRs } from '../hooks/useWorkouts';
import { useUserSettings } from '../hooks/useUserSettings';
import { fromKg } from '../utils/units';
import type { PRHistory } from '../services/workoutService';
import { Trophy, ArrowLeft, Search, X } from 'lucide-react';

const WorkoutPRsPage: React.FC = () => {
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';
    const { data: prs = [], isLoading } = usePRs();
    const [selectedPR, setSelectedPR] = useState<PRHistory | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const groupedPRs = prs.reduce((acc, pr) => {
        if (!acc[pr.exercise_name]) acc[pr.exercise_name] = [];
        acc[pr.exercise_name].push(pr);
        return acc;
    }, {} as Record<string, PRHistory[]>);
    const exerciseNames = Object.keys(groupedPRs).sort();

    const filteredPRs = prs.filter(pr =>
        pr.exercise_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pr.workout_date.includes(searchQuery)
    );

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });

    const formatWeight = (w?: number) => (w != null ? `${fromKg(w, weightUnit).toFixed(1)} ${weightUnit}` : '');

    return (
        <>
            <Title title="Personal Records" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        <WorkoutsNav />

                        <div className="dashboard-section__head">
                            <h2>Personal Records</h2>
                            <span>Your all-time best lifts, ranked</span>
                        </div>

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

                        <div className="workout-pr-top-bar">
                            <div className="search-container workout-pr-search">
                                <div className="search-input-wrapper">
                                    <Search className="search-input-icon" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                        placeholder="Search PRs..."
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
                                <p>Loading PRs...</p>
                            </div>
                        ) : (
                            <div className="workout-pr-content">
                                {selectedPR ? (
                                    <div className="workout-pr-selected">
                                        <div className="workout-pr-selected__header">
                                            <button onClick={() => setSelectedPR(null)} className="workout-pr-selected__back">
                                                <ArrowLeft className="mr-1" />Back
                                            </button>
                                            <h3>
                                                <Trophy className="mr-1" />
                                                {selectedPR.exercise_name}
                                            </h3>
                                        </div>
                                        <p className="workout-pr-selected__date">Achieved on {formatDate(selectedPR.workout_date)}</p>

                                        <div className="workout-pr-selected__stats">
                                            {selectedPR.weight !== undefined && (
                                                <div className="workout-pr-selected__stat">
                                                    <span className="workout-pr-selected__stat-label">Weight</span>
                                                    <span className="workout-pr-selected__stat-value">{formatWeight(selectedPR.weight)}</span>
                                                </div>
                                            )}
                                            {selectedPR.reps !== undefined && (
                                                <div className="workout-pr-selected__stat">
                                                    <span className="workout-pr-selected__stat-label">Reps</span>
                                                    <span className="workout-pr-selected__stat-value">{selectedPR.reps}</span>
                                                </div>
                                            )}
                                        </div>

                                        {(groupedPRs[selectedPR.exercise_name]?.length ?? 0) > 1 && (
                                            <div className="workout-pr-progression">
                                                <h4>Progression for {selectedPR.exercise_name}</h4>
                                                <div className="workout-pr-progression__list">
                                                    {(groupedPRs[selectedPR.exercise_name] ?? [])
                                                        .sort((a, b) => new Date(b.workout_date).getTime() - new Date(a.workout_date).getTime())
                                                        .map((pr) => (
                                                            <div
                                                                key={pr.id}
                                                                className={`workout-pr-progression-item ${pr.id === selectedPR.id ? 'workout-pr-progression-item--selected' : ''}`}
                                                                onClick={() => setSelectedPR(pr)}
                                                            >
                                                                <div className="workout-pr-progression-item__date">{formatDate(pr.workout_date)}</div>
                                                                <div className="workout-pr-progression-item__stats">
                                                                    {pr.weight !== undefined && formatWeight(pr.weight)}
                                                                    {pr.weight !== undefined && pr.reps !== undefined && ' • '}
                                                                    {pr.reps !== undefined && `${pr.reps} reps`}
                                                                </div>
                                                                {pr.id === selectedPR.id && (
                                                                    <div className="workout-pr-progression-item__trophy">
                                                                        <Trophy />
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
                                            <PRList prs={filteredPRs} onPRClick={setSelectedPR} weightUnit={weightUnit} />
                                        ) : (
                                            <div className="workout-pr-empty">
                                                <Trophy className="workout-pr-empty__icon" />
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