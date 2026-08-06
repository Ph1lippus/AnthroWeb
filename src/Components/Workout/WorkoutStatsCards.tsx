import React from 'react';

interface WorkoutStatsCardsProps {
    weeklyStats: {
        totalWorkouts: number;
        completedWorkouts: number;
        totalVolume: number;
    };
    monthlyStats: {
        totalWorkouts: number;
        completedWorkouts: number;
        totalVolume: number;
    };
}

const WorkoutStatsCards: React.FC<WorkoutStatsCardsProps> = ({
    weeklyStats,
    monthlyStats
}) => {
    const monthlyCompletionRate = monthlyStats.totalWorkouts > 0 
        ? (monthlyStats.completedWorkouts / monthlyStats.totalWorkouts) * 100 
        : 0;

    return (
        <div className="workout-dashboard-grid">
            <div className="workout-stats-card">
                <div className="workout-stats-card__icon">
                    <i className="fa-solid fa-calendar-check"></i>
                </div>
                <div className="workout-stats-card__value">{weeklyStats.completedWorkouts}</div>
                <div className="workout-stats-card__label">Workouts This Week</div>
                <div className="workout-stats-card__trend">
                    {weeklyStats.completedWorkouts >= 3 ? 'On track! 🎯' : 'Keep going! 💪'}
                </div>
            </div>

            <div className="workout-stats-card">
                <div className="workout-stats-card__icon">
                    <i className="fa-solid fa-dumbbell"></i>
                </div>
                <div className="workout-stats-card__value">{weeklyStats.totalVolume}</div>
                <div className="workout-stats-card__label">Weekly Volume</div>
                <div className="workout-stats-card__trend">
                    {weeklyStats.totalVolume > 1000 ? 'Great volume! 💪' : 'Keep pushing! ⚡'}
                </div>
            </div>

            <div className="workout-stats-card">
                <div className="workout-stats-card__icon">
                    <i className="fa-solid fa-calendar"></i>
                </div>
                <div className="workout-stats-card__value">{monthlyStats.completedWorkouts}</div>
                <div className="workout-stats-card__label">Workouts This Month</div>
                <div className="workout-stats-card__trend">
                    {monthlyStats.completedWorkouts >= 12 ? 'Excellent! 🏆' : 'Building consistency 📈'}
                </div>
            </div>

            <div className="workout-stats-card">
                <div className="workout-stats-card__icon">
                    <i className="fa-solid fa-chart-line"></i>
                </div>
                <div className="workout-stats-card__value">{monthlyCompletionRate.toFixed(0)}%</div>
                <div className="workout-stats-card__label">Monthly Completion Rate</div>
                <div className="workout-stats-card__trend">
                    {monthlyCompletionRate >= 80 ? 'Excellent! 📈' : 'Room to improve 📊'}
                </div>
            </div>
        </div>
    );
};

export default WorkoutStatsCards;
