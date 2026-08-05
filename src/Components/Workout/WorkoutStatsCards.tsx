import React from 'react';

interface WorkoutStatsCardsProps {
    workoutsThisWeek: number;
    totalPRs: number;
    currentStreak: number;
    completionRate: number;
}

const WorkoutStatsCards: React.FC<WorkoutStatsCardsProps> = ({
    workoutsThisWeek,
    totalPRs,
    currentStreak,
    completionRate
}) => {
    return (
        <div className="workout-dashboard-grid">
            <div className="workout-stats-card">
                <div className="workout-stats-card__icon">
                    <i className="fa-solid fa-calendar-check"></i>
                </div>
                <div className="workout-stats-card__value">{workoutsThisWeek}</div>
                <div className="workout-stats-card__label">Workouts This Week</div>
                <div className="workout-stats-card__trend">
                    {workoutsThisWeek >= 3 ? 'On track! 🎯' : 'Keep going! 💪'}
                </div>
            </div>

            <div className="workout-stats-card">
                <div className="workout-stats-card__icon">
                    <i className="fa-solid fa-trophy"></i>
                </div>
                <div className="workout-stats-card__value">{totalPRs}</div>
                <div className="workout-stats-card__label">Total PRs</div>
                <div className="workout-stats-card__trend">
                    {totalPRs > 0 ? 'Great progress! 🏆' : 'Start lifting! 🚀'}
                </div>
            </div>

            <div className="workout-stats-card">
                <div className="workout-stats-card__icon">
                    <i className="fa-solid fa-fire"></i>
                </div>
                <div className="workout-stats-card__value">{currentStreak}</div>
                <div className="workout-stats-card__label">Day Streak</div>
                <div className="workout-stats-card__trend">
                    {currentStreak >= 7 ? 'On fire! 🔥' : 'Building momentum ⚡'}
                </div>
            </div>

            <div className="workout-stats-card">
                <div className="workout-stats-card__icon">
                    <i className="fa-solid fa-chart-line"></i>
                </div>
                <div className="workout-stats-card__value">{completionRate.toFixed(0)}%</div>
                <div className="workout-stats-card__label">Completion Rate</div>
                <div className="workout-stats-card__trend">
                    {completionRate >= 80 ? 'Excellent! 📈' : 'Room to improve 📊'}
                </div>
            </div>
        </div>
    );
};

export default WorkoutStatsCards;
