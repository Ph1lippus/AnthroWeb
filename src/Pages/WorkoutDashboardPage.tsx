import React from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import WorkoutsNav from '../Components/Workout/WorkoutsNav';
import WorkoutContributionChart from '../Components/Workout/WorkoutContributionChart';
import WorkoutStatsCards from '../Components/Workout/WorkoutStatsCards';
import WorkoutCalendar from '../Components/Workout/WorkoutCalendar';
import PRList from '../Components/Workout/PRList';
import MeasurementCharts from '../Components/Measurement/MeasurementCharts';
import { useWorkoutLogsWithVolume, usePRs } from '../hooks/useWorkouts';
import { useBodyMeasurements } from '../hooks/useMeasurements';
import { useUserSettings } from '../hooks/useUserSettings';
import { ageFromDob } from '../utils/measurementCalculations';
import type { WorkoutCompletionLog } from '../services/workoutService';
import { Calendar, LineChart, Trophy, Ruler, ArrowRight } from 'lucide-react';

const WorkoutDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { settings } = useUserSettings();
    const weightUnit = settings?.weight_unit ?? 'kg';

    const { data: workoutHistory = [], isLoading } = useWorkoutLogsWithVolume(120);
    const { data: prHistory = [] } = usePRs();
    const { data: measurements = [] } = useBodyMeasurements();

    const completedDates = workoutHistory.filter(w => w.completed).map(w => w.workout_date);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const within = (date: string, cutoff: Date) => new Date(date) >= cutoff;

    const weekly = workoutHistory.filter(w => within(w.workout_date, weekAgo));
    const monthly = workoutHistory.filter(w => within(w.workout_date, monthAgo));

    const volumeSum = (list: Array<WorkoutCompletionLog & { volume?: number }>) =>
        list.reduce((total, w) => total + (w.volume ?? 0), 0);

    const weeklyStats = {
        totalWorkouts: weekly.length,
        completedWorkouts: weekly.filter(w => w.completed).length,
        totalVolume: volumeSum(weekly),
    };
    const monthlyStats = {
        totalWorkouts: monthly.length,
        completedWorkouts: monthly.filter(w => w.completed).length,
        totalVolume: volumeSum(monthly),
    };

    const measurementContext = React.useMemo(() => {
        const maxPRWeight = prHistory.reduce((max, p) => (p.weight != null && p.weight > max ? p.weight : max), 0);
        return {
            gender: settings?.gender ?? '',
            height_cm: settings?.height_cm ?? null,
            age: ageFromDob(settings?.date_of_birth),
            relativeBestLift: maxPRWeight > 0 ? maxPRWeight : null,
        };
    }, [settings, prHistory]);

    const handleDateClick = () => navigate('/Workouts/History');

    return (
        <>
            <Title title="Workouts Dashboard" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        <WorkoutsNav />

                        <div className="dashboard-section__head">
                            <h2>Workouts Dashboard</h2>
                            <span>Track your fitness journey</span>
                        </div>

                        {isLoading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading dashboard...</p>
                            </div>
                        ) : (
                            <>
                                <WorkoutStatsCards weeklyStats={weeklyStats} monthlyStats={monthlyStats} weightUnit={weightUnit} />

                                <div className="workout-dashboard-section">
                                    <h3 className="workout-dashboard-section__title">
                                        <Calendar className="mr-1" />
                                        Workout Calendar
                                    </h3>
                                    <WorkoutCalendar completedDates={completedDates} onDateClick={handleDateClick} />
                                </div>

                                <div className="workout-dashboard-section">
                                    <h3 className="workout-dashboard-section__title">
                                        <LineChart className="mr-1" />
                                        Activity Overview
                                    </h3>
                                    <WorkoutContributionChart completedDates={completedDates} onDateClick={handleDateClick} />
                                </div>

                                <div className="workout-dashboard-section">
                                    <div className="workout-dashboard-section__head">
                                        <h3 className="workout-dashboard-section__title">
                                            <Ruler className="mr-1" />
                                            Body Measurements
                                        </h3>
                                        <button onClick={() => navigate('/Measurements')} className="btn-action">
                                            Log Measurements
                                            <ArrowRight className="ml-1" />
                                        </button>
                                    </div>
                                    {measurements.length < 2 ? (
                                        <div className="workout-empty">
                                            <Ruler className="workout-empty-icon" />
                                            <p className="workout-empty-title">Charts appear after 2 measurements</p>
                                            <p className="workout-empty-text">Save measurements on different dates to see your trends here.</p>
                                        </div>
                                    ) : (
                                        <MeasurementCharts records={measurements} context={measurementContext} />
                                    )}
                                </div>

                                <div className="workout-dashboard-section">
                                    <h3 className="workout-dashboard-section__title">
                                        <Trophy className="mr-1" />
                                        Recent Personal Records
                                    </h3>
                                    <PRList prs={prHistory.slice(0, 5)} weightUnit={weightUnit} />
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