import React from 'react';
import { Dumbbell, HeartPulse, PersonStanding, TrendingUp } from 'lucide-react';
import { fromKg, type WeightUnit } from '../../utils/units';
import { formatDayLabel } from '../../utils/dates';
import type { ExerciseRollup } from '../../utils/workoutStats';
import type { ActivityType } from '../../utils/workoutSets';

interface TemplateExerciseStatsProps {
    rows: ExerciseRollup[];
    weightUnit: WeightUnit;
}

const ICONS: Record<ActivityType, React.ReactNode> = {
    strength: <Dumbbell size={11} />,
    cardio: <HeartPulse size={11} />,
    mobility: <PersonStanding size={11} />,
};

/** Tonnage abbreviated so the column stays narrow enough to read at a glance. */
const compact = (value: number): string =>
    value >= 10000 ? `${Math.round(value / 1000)}k`
        : value >= 1000 ? `${(value / 1000).toFixed(1)}k`
            : String(Math.round(value));

/**
 * How each exercise in the active template is actually going.
 *
 * Restricted to the template's exercises on purpose. "Stats about the template
 * exercises" is the question this answers; a table of every lift the user has
 * ever typed is a different page and does not belong here.
 *
 * Times logged and best set are the columns that change a plan. 30-day volume
 * says whether an exercise is being trained or merely written down.
 */
const TemplateExerciseStats: React.FC<TemplateExerciseStatsProps> = ({ rows, weightUnit }) => {
    if (rows.length === 0) {
        return (
            <div className="workout-empty">
                <p className="workout-empty__title">No exercises in the active template</p>
                <p className="workout-empty__text">
                    Add exercises to a template and this table tracks how each one is going.
                </p>
            </div>
        );
    }

    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="workout-table">
                <thead>
                    <tr>
                        <th scope="col">Exercise</th>
                        <th scope="col" className="workout-table__num">Done</th>
                        <th scope="col" className="workout-table__num">Sets</th>
                        <th scope="col" className="workout-table__num">Best set</th>
                        <th scope="col" className="workout-table__num">Total</th>
                        <th scope="col" className="workout-table__num">30d</th>
                        <th scope="col">Last</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const isCardio = row.activityType !== 'strength';
                        const best = row.bestWeight != null ? (
                            <>
                                {row.bestReps != null && `${row.bestReps}× `}
                                {fromKg(row.bestWeight, weightUnit)}
                            </>
                        ) : row.minutesLogged > 0 ? (
                            `${Math.round(row.minutesLogged)}m`
                        ) : (
                            <span className="workout-table__muted">—</span>
                        );

                        return (
                            <tr key={row.key}>
                                <th scope="row" className="workout-table__name">
                                    <span className="workout-table__icon">{ICONS[row.activityType]}</span>
                                    <span className={row.timesLogged === 0 ? 'workout-table__muted' : ''}>
                                        {row.exercise_name}
                                    </span>
                                </th>
                                <td className="workout-table__num">{row.timesLogged || <span className="workout-table__muted">—</span>}</td>
                                <td className="workout-table__num">{row.setsLogged || <span className="workout-table__muted">—</span>}</td>
                                <td className="workout-table__num">{best}</td>
                                <td className="workout-table__num">
                                    {isCardio ? `${Math.round(row.distanceKm)} km` : compact(row.volumeKg)}
                                </td>
                                <td className="workout-table__num">
                                    {row.recentVolumeKg > 0 ? (
                                        <span className="workout-table__accent">
                                            <TrendingUp size={10} /> {isCardio ? 'yes' : compact(row.recentVolumeKg)}
                                        </span>
                                    ) : <span className="workout-table__muted">—</span>}
                                </td>
                                <td className="workout-table__muted">
                                    {row.lastDate ? formatDayLabel(row.lastDate) : 'never'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default TemplateExerciseStats;