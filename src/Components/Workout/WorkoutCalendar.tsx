import React, { useState } from 'react';

interface WorkoutCalendarProps {
    completedDates: string[]; // Array of date strings in YYYY-MM-DD format
    onDateClick?: (date: string) => void;
}

const WorkoutCalendar: React.FC<WorkoutCalendarProps> = ({ completedDates, onDateClick }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

        const days = [];
        
        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push({ date: null, isOtherMonth: true });
        }

        // Add days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            const dateString = date.toISOString().split('T')[0];
            const isCompleted = completedDates.includes(dateString);
            const isToday = dateString === new Date().toISOString().split('T')[0];
            
            days.push({
                date: dateString,
                isOtherMonth: false,
                isCompleted,
                isToday
            });
        }

        return days;
    };

    const previousMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = getDaysInMonth(currentDate);

    return (
        <div className="workout-calendar">
            <div className="workout-calendar__header">
                <h3 className="workout-calendar__title">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
                <div className="workout-calendar__nav">
                    <button
                        className="workout-calendar__nav-btn"
                        onClick={previousMonth}
                        title="Previous month"
                    >
                        <i className="fa-solid fa-chevron-left"></i>
                    </button>
                    <button
                        className="workout-calendar__nav-btn"
                        onClick={goToToday}
                        title="Go to today"
                    >
                        Today
                    </button>
                    <button
                        className="workout-calendar__nav-btn"
                        onClick={nextMonth}
                        title="Next month"
                    >
                        <i className="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            </div>

            <div className="workout-calendar__grid">
                {dayNames.map((day) => (
                    <div key={day} className="workout-calendar__day-label">
                        {day}
                    </div>
                ))}
                {days.map((day, index) => (
                    <div
                        key={index}
                        className={`workout-calendar__day ${
                            day.isOtherMonth ? 'other-month' : ''
                        } ${day.isCompleted ? 'completed' : ''} ${
                            day.isToday ? 'today' : ''
                        }`}
                        onClick={() => day.date && onDateClick && onDateClick(day.date)}
                        title={day.date || ''}
                    >
                        {day.date ? new Date(day.date).getDate() : ''}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WorkoutCalendar;
