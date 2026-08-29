import React, { useEffect, useState } from 'react';
import { getScoreColor } from '../../utils/dailyScoring';

interface ScoreRingProps {
    score: number;
    size?: number;
    strokeWidth?: number;
}

const ScoreRing: React.FC<ScoreRingProps> = ({ score, size = 96, strokeWidth = 8 }) => {
    const [animated, setAnimated] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => setAnimated(score), 60);
        return () => clearTimeout(timer);
    }, [score]);

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, animated));
    const offset = circumference - (clamped / 100) * circumference;
    const color = score > 0 ? getScoreColor(score) : 'rgba(255, 255, 255, 0.18)';

    return (
        <div className="score-ring" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth={strokeWidth}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{
                        stroke: color,
                        transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.3s ease',
                    }}
                />
            </svg>
            <div className="score-ring-inner">
                <span className="score-ring-value" style={{ color }}>{score}</span>
                <span className="score-ring-suffix">/100</span>
            </div>
        </div>
    );
};

export default ScoreRing;