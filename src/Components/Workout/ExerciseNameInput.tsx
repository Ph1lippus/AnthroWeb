import React, { useEffect, useRef, useState } from 'react';
import { searchWgerExercises, getCachedExerciseNames } from '../../services/wgerService';

interface ExerciseNameInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

const ExerciseNameInput: React.FC<ExerciseNameInputProps> = ({
    value,
    onChange,
    placeholder,
    className,
}) => {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    useEffect(() => {
        if (!value.trim()) return;
        const timer = setTimeout(async () => {
            const online = await searchWgerExercises(value, 8);
            const cached = getCachedExerciseNames()
                .filter(n => n.toLowerCase().includes(value.toLowerCase()))
                .slice(0, 4);
            setSuggestions([...new Set([...online, ...cached])]);
            setOpen(true);
            setLoading(false);
        }, 350);
        return () => clearTimeout(timer);
    }, [value]);

    const handleChange = (next: string) => {
        onChange(next);
        if (!next.trim()) {
            setSuggestions([]);
            setOpen(false);
            setLoading(false);
        } else {
            setLoading(true);
            setOpen(true);
        }
    };

    return (
        <div className="exercise-name-input" ref={wrapperRef}>
            <input
                type="text"
                className={className}
                value={value}
                placeholder={placeholder ?? 'Exercise name'}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => {
                    if (value.trim()) setOpen(true);
                }}
            />
            {loading && <span className="exercise-name-input__spinner" />}
            {open && suggestions.length > 0 && (
                <ul className="exercise-name-input__list">
                    {suggestions.map((name) => (
                        <li
                            key={name}
                            className="exercise-name-input__item"
                            onMouseDown={() => {
                                onChange(name);
                                setOpen(false);
                            }}
                        >
                            {name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ExerciseNameInput;