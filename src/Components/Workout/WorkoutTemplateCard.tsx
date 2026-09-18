import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { WorkoutTemplate } from '../../services/workoutService';
import { Pencil, Check, Copy, Trash2 } from 'lucide-react';

interface WorkoutTemplateCardProps {
    template: WorkoutTemplate;
    isActive: boolean;
    onActivate: (id: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    dayCount?: number;
}

const WorkoutTemplateCard: React.FC<WorkoutTemplateCardProps> = ({
    template,
    isActive,
    onActivate,
    onDuplicate,
    onDelete,
    dayCount = 0
}) => {
    const navigate = useNavigate();

    const handleEdit = () => {
        navigate(`/Workouts/Template/${template.id}`);
    };

    return (
        <div className={`workout-template-card ${isActive ? 'active' : ''}`}>
            <div className="workout-template-card__header">
                <div>
                    <h3 className="workout-template-card__title">{template.name}</h3>
                    {template.description && (
                        <p className="workout-template-card__description">{template.description}</p>
                    )}
                </div>
                {isActive && (
                    <span className="workout-template-card__badge">Active</span>
                )}
            </div>

            <div className="workout-template-card__days">
                <span className="workout-template-card__day">{dayCount} exercises</span>
            </div>

            <div className="workout-template-card__actions">
                <button
                    className="workout-template-card__action"
                    onClick={handleEdit}
                    title="Edit template"
                >
                    <Pencil /> Edit
                </button>
                <button
                    className="workout-template-card__action"
                    onClick={() => onActivate(template.id!)}
                    title={isActive ? 'Already active' : 'Set as active'}
                    disabled={isActive}
                >
                    <Check /> {isActive ? 'Active' : 'Activate'}
                </button>
                <button
                    className="workout-template-card__action"
                    onClick={() => onDuplicate(template.id!)}
                    title="Duplicate template"
                >
                    <Copy /> Copy
                </button>
                <button
                    className="workout-template-card__action danger"
                    onClick={() => onDelete(template.id!)}
                    title="Delete template"
                >
                    <Trash2 /> Delete
                </button>
            </div>
        </div>
    );
};

export default WorkoutTemplateCard;
