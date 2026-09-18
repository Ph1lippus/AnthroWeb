import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import WorkoutContributionChart from '../Components/Workout/WorkoutContributionChart';
import WorkoutStatsCards from '../Components/Workout/WorkoutStatsCards';
import WorkoutCalendar from '../Components/Workout/WorkoutCalendar';
import PRList from '../Components/Workout/PRList';
import { useWorkoutStore } from '../stores/useWorkoutStore';
import { ClipboardCheck, Layers, History, Trophy, Calendar, LineChart } from 'lucide-react';

const WorkoutDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { 
        workoutHistory, 
        prHistory, 
        loading, 
        fetchWorkoutHistory, 
        fetchAllPRs 
    } = useWorkoutStore();
    
    const [weeklyStats, setWeeklyStats] = useState({
        totalWorkouts: 0,
        completedWorkouts: 0,
        totalVolume: 0,
    });
    
    const [monthlyStats, setMonthlyStats] = useState({
        totalWorkouts: 0,
        completedWorkouts: 0,
        totalVolume: 0,
    });

    useEffect(() => {
        const loadData = async () => {
            await Promise.all([
                fetchWorkoutHistory(90), // Last 90 days for calendar
                fetchAllPRs(),
            ]);
        };
        
        loadData();
    }, [fetchWorkoutHistory, fetchAllPRs]);

    // Calculate stats
    useEffect(() => {
        const calculateStats = () => {
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

            const weeklyWorkouts = workoutHistory.filter(w => 
                new Date(w.workout_date) >= weekAgo
            );
            
            const monthlyWorkouts = workoutHistory.filter(w => 
                new Date(w.workout_date) >= monthAgo
            );

            const calculateVolume = (workouts: any[]) => {
                // This would need exercise logs to calculate actual volume
                // For now, we'll use a simplified calculation
                return workouts.reduce((total, workout) => {
                    if (workout.completed && workout.intensity) {
                        return total + (workout.intensity * 10); // Simplified volume calculation
                    }
                    return total;
                }, 0);
            };

            setWeeklyStats({
                totalWorkouts: weeklyWorkouts.length,
                completedWorkouts: weeklyWorkouts.filter(w => w.completed).length,
                totalVolume: calculateVolume(weeklyWorkouts),
            });

            setMonthlyStats({
                totalWorkouts: monthlyWorkouts.length,
                completedWorkouts: monthlyWorkouts.filter(w => w.completed).length,
                totalVolume: calculateVolume(monthlyWorkouts),
            });
        };

        calculateStats();
    }, [workoutHistory]);

    const completedDates = workoutHistory
        .filter(w => w.completed)
        .map(w => w.workout_date);

    const handleDateClick = () => {
        // Navigate to history page
        navigate('/Workouts/History');
    };

    return (
        <>
            <Title title="Workout Dashboard" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        {/* Top Bar */}
                        <div className="workout-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => navigate('/Workouts/Check')} className="btn-action">
                                    <ClipboardCheck className="mr-1" />Log Workout
                                </button>
                                <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                    <Layers className="mr-1" />Templates
                                </button>
                                <button onClick={() => navigate('/Workouts/History')} className="btn-action">
                                    <History className="mr-1" />History
                                </button>
                                <button onClick={() => navigate('/Workouts/PRs')} className="btn-action">
                                    <Trophy className="mr-1" />PRs
                                </button>
                            </div>
                        </div>

                        <div className="dashboard-section__head">
                            <h2>Workout Dashboard</h2>
                            <span>Track your fitness journey</span>
                        </div>

                        {loading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading dashboard...</p>
                            </div>
                        ) : (
                            <>
                                {/* Stats Cards */}
                                <WorkoutStatsCards
                                    weeklyStats={weeklyStats}
                                    monthlyStats={monthlyStats}
                                />

                                {/* Calendar View */}
                                <div className="workout-dashboard-section">
                                    <h3 className="workout-dashboard-section__title">
                                        <Calendar className="mr-1" />
                                        Workout Calendar
                                    </h3>
                                    <WorkoutCalendar
                                        completedDates={completedDates}
                                        onDateClick={handleDateClick}
                                    />
                                </div>

                                {/* Contribution Chart */}
                                <div className="workout-dashboard-section">
                                    <h3 className="workout-dashboard-section__title">
                                        <LineChart className="mr-1" />
                                        Activity Overview
                                    </h3>
                                    <WorkoutContributionChart
                                        completedDates={completedDates}
                                        onDateClick={handleDateClick}
                                    />
                                </div>

                                {/* Recent PRs */}
                                <div className="workout-dashboard-section">
                                    <h3 className="workout-dashboard-section__title">
                                        <Trophy className="mr-1" />
                                        Recent Personal Records
                                    </h3>
                                    <PRList prs={prHistory.slice(0, 5)} />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutDashboardPage;