import React from 'react';
import { formatWeight, type WeightUnit } from '../../utils/units';
import type { PeriodTotals } from '../../utils/workoutStats';

interface WorkoutStatsCardProps {
    last7: PeriodTotals;
    last30: PeriodTotals;
    streak: number;
    weightUnit: WeightUnit;
}

/**
 * Four numbers, as one card's body rather than four bordered boxes.
 *
 * Four separate cards side by side is four borders and four titles saying
 * almost the same thing; this reads as a single figure with a 2x2 grid inside
 * it, which is what the daily log's habit counter does at a smaller scale.
 *
 * The seven-day figure is the one that changes what you do tomorrow, so it
 * leads. Volume and the streak are context; the month figure is the slow trend.
 */
const WorkoutStatsCard: React.FC<WorkoutStatsCardProps> = ({ last7, last30, streak, weightUnit }) => {
    const stats = [
        {
            key: 'week',
            label: 'This week',
            value: String(last7.sessions),
            foot: last7.sessions >= 4 ? 'on track' : last7.sessions > 0 ? 'keep going' : 'nothing yet',
            accent: last7.sessions >= 4,
        },
        {
            key: 'streak',
            label: 'Day streak',
            value: String(streak),
            foot: streak > 0 ? 'in a row' : 'mark a day',
            accent: streak >= 3,
        },
        {
            key: 'volume',
            label: 'Volume',
            value: last7.volumeKg > 0 ? formatWeight(last7.volumeKg, weightUnit, 0) : '—',
            foot: last7.sets > 0 ? `${last7.sets} sets` : 'no sets',
            accent: false,
        },
        {
            key: 'month',
            label: 'This month',
            value: String(last30.sessions),
            foot: last30.minutes > 0 ? `${Math.round(last30.minutes)} min` : 'sessions',
            accent: last30.sessions >= 12,
        },
    ];

    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title">Stats</h3>
            </div>
            <div className="card-body">
                <div className="workout-stats">
                    {stats.map(stat => (
                        <div className="workout-stat" key={stat.key}>
                            <span className="workout-stat__label">{stat.label}</span>
                            <span className={`workout-stat__value ${stat.accent ? 'workout-stat__value--accent' : ''}`}>
                                {stat.value}
                            </span>
                            <span className={`workout-stat__foot ${stat.accent ? 'workout-stat__foot--accent' : ''}`}>
                                {stat.foot}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default WorkoutStatsCard;