import React from 'react';
import type { PRHistory } from '../../services/workoutService';
import { Trophy } from 'lucide-react';
import { fromKg, type WeightUnit } from '../../utils/units';

interface PRListProps {
    prs: PRHistory[];
    onPRClick?: (pr: PRHistory) => void;
    weightUnit?: WeightUnit;
}

const PRList: React.FC<PRListProps> = ({ prs, onPRClick, weightUnit = 'kg' }) => {
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    };

    if (prs.length === 0) {
        return (
            <div className="workout-empty-state">
                <div className="workout-empty-state__icon">
                    <Trophy />
                </div>
                <h3 className="workout-empty-state__title">No PRs Yet</h3>
                <p className="workout-empty-state__description">
                    Start logging your workouts to track your personal records!
                </p>
            </div>
        );
    }

    return (
        <div className="pr-list">
            {prs.map((pr) => (
                <div 
                    key={pr.id} 
                    className="pr-item"
                    onClick={() => onPRClick && onPRClick(pr)}
                    style={{ cursor: onPRClick ? 'pointer' : 'default' }}
                >
                    <div className="pr-item__icon">
                        <Trophy />
                    </div>
                    <div className="pr-item__info">
                        <div className="pr-item__exercise">{pr.exercise_name}</div>
                        <div className="pr-item__date">{formatDate(pr.workout_date)}</div>
                    </div>
                    <div className="pr-item__stats">
                        {pr.weight !== undefined && (
                            <div className="pr-item__stat">
                                <span className="pr-item__stat-value">{fromKg(pr.weight, weightUnit).toFixed(1)}</span>
                                <span className="pr-item__stat-label">{weightUnit}</span>
                            </div>
                        )}
                        {pr.reps !== undefined && (
                            <div className="pr-item__stat">
                                <span className="pr-item__stat-value">{pr.reps}</span>
                                <span className="pr-item__stat-label">Reps</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default PRList;
