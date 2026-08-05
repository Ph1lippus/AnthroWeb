import React, { useState } from 'react';

interface WorkoutContributionChartProps {
    completedDates: string[]; // Array of date strings in YYYY-MM-DD format
    onDateClick?: (date: string) => void;
}

const WorkoutContributionChart: React.FC<WorkoutContributionChartProps> = ({ completedDates, onDateClick }) => {
    const [hoveredDate, setHoveredDate] = useState<string | null>(null);

    // Generate data for the last 52 weeks (1 year)
    const generateWeeks = () => {
        const weeks = [];
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 364); // Go back 1 year

        // Start from the first Sunday
        const dayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - dayOfWeek);

        let currentDate = new Date(startDate);
        let week = [];

        for (let i = 0; i < 364; i++) {
            const dateString = currentDate.toISOString().split('T')[0];
            const isCompleted = completedDates.includes(dateString);
            const isToday = dateString === today.toISOString().split('T')[0];

            week.push({
                date: dateString,
                isCompleted,
                isToday
            });

            // End of week (Saturday)
            if (currentDate.getDay() === 6) {
                weeks.push(week);
                week = [];
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Add the last week if it has days
        if (week.length > 0) {
            weeks.push(week);
        }

        return weeks;
    };

    const weeks = generateWeeks();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const calculateCurrentStreak = (dates: string[]): number => {
        const today = new Date().toISOString().split('T')[0];
        const sortedDates = [...dates].sort().reverse();
        let streak = 0;
        
        for (let i = 0; i < sortedDates.length; i++) {
            const date = new Date(sortedDates[i]);
            const expectedDate = new Date(today);
            expectedDate.setDate(expectedDate.getDate() - i);
            
            if (date.toISOString().split('T')[0] === expectedDate.toISOString().split('T')[0]) {
                streak++;
            } else {
                break;
            }
        }
        
        return streak;
    };

    const getMonthLabel = (weekIndex: number) => {
        if (weekIndex === 0) return months[0];
        const weekDate = weeks[weekIndex][0].date;
        const monthIndex = new Date(weekDate).getMonth();
        const prevWeekDate = weeks[weekIndex - 1][0].date;
        const prevMonthIndex = new Date(prevWeekDate).getMonth();
        
        // Only show month label if it's different from previous week
        if (monthIndex !== prevMonthIndex) {
            return months[monthIndex];
        }
        return '';
    };

    const totalWorkouts = completedDates.length;
    const currentStreak = calculateCurrentStreak(completedDates);

    return (
        <div className="workout-contribution-chart">
            <div className="workout-contribution-chart__header">
                <div className="workout-contribution-chart__stats">
                    <div className="workout-contribution-chart__stat">
                        <span className="workout-contribution-chart__stat-value">{totalWorkouts}</span>
                        <span className="workout-contribution-chart__stat-label">Workouts</span>
                    </div>
                    <div className="workout-contribution-chart__stat">
                        <span className="workout-contribution-chart__stat-value">{currentStreak}</span>
                        <span className="workout-contribution-chart__stat-label">Day Streak</span>
                    </div>
                </div>
            </div>

            <div className="workout-contribution-chart__container">
                <div className="workout-contribution-chart__months">
                    {weeks.map((week, weekIndex) => (
                        <div key={weekIndex} className="workout-contribution-chart__month">
                            {getMonthLabel(weekIndex)}
                        </div>
                    ))}
                </div>

                <div className="workout-contribution-chart__grid">
                    <div className="workout-contribution-chart__days">
                        {days.map((day) => (
                            <div key={day} className="workout-contribution-chart__day-label">
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="workout-contribution-chart__weeks">
                        {weeks.map((week, weekIndex) => (
                            <div key={weekIndex} className="workout-contribution-chart__week">
                                {week.map((day) => (
                                    <div
                                        key={day.date}
                                        className={`workout-contribution-chart__day ${
                                            day.isCompleted ? 'workout-contribution-chart__day--completed' : ''
                                        } ${day.isToday ? 'workout-contribution-chart__day--today' : ''}`}
                                        onClick={() => day.date && onDateClick && onDateClick(day.date)}
                                        onMouseEnter={() => setHoveredDate(day.date)}
                                        onMouseLeave={() => setHoveredDate(null)}
                                        title={day.date}
                                    >
                                        {day.isToday && <div className="workout-contribution-chart__today-indicator"></div>}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {hoveredDate && (
                <div className="workout-contribution-chart__tooltip">
                    {new Date(hoveredDate).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    })}
                </div>
            )}

            <div className="workout-contribution-chart__legend">
                <span className="workout-contribution-chart__legend-label">Less</span>
                <div className="workout-contribution-chart__legend-squares">
                    <div className="workout-contribution-chart__legend-square"></div>
                    <div className="workout-contribution-chart__legend-square workout-contribution-chart__legend-square--completed"></div>
                </div>
                <span className="workout-contribution-chart__legend-label">More</span>
            </div>
        </div>
    );
};

export default WorkoutContributionChart;