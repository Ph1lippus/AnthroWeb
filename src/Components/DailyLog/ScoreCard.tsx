import React, { useState } from 'react';
import ScoreRing from './ScoreRing';
import { getScoreColor } from '../../utils/dailyScoring';
import type { MetricScore } from '../../utils/dailyScoring';

type Category = 'sleep' | 'vitals' | 'nutrition' | 'body' | 'mood' | 'habits';

interface ScoreMetricMeta {
    key: string;
    label: string;
    cat: Category;
}

interface ScoreCardProps {
    score: number;
    dateLabel: string;
    metrics: Record<string, MetricScore>;
}

const CATEGORY_LABELS: Record<Category, string> = {
    sleep: 'Sleep',
    vitals: 'Vitals & BP',
    nutrition: 'Nutrition',
    body: 'Body Metrics',
    mood: 'Mood',
    habits: 'Habits',
};

const CATEGORY_ORDER: Category[] = ['sleep', 'vitals', 'nutrition', 'body', 'mood', 'habits'];

const METRIC_META: ScoreMetricMeta[] = [
    { key: 'wakeTime', label: 'Wake Time', cat: 'sleep' },
    { key: 'bedtime', label: 'Bedtime', cat: 'sleep' },
    { key: 'sleepQuality', label: 'Sleep Quality', cat: 'sleep' },
    { key: 'morningSystolic', label: 'Morning Systolic', cat: 'vitals' },
    { key: 'morningDiastolic', label: 'Morning Diastolic', cat: 'vitals' },
    { key: 'morningBpm', label: 'Morning BPM', cat: 'vitals' },
    { key: 'eveningSystolic', label: 'Evening Systolic', cat: 'vitals' },
    { key: 'eveningDiastolic', label: 'Evening Diastolic', cat: 'vitals' },
    { key: 'eveningBpm', label: 'Evening BPM', cat: 'vitals' },
    { key: 'bodyTemperature', label: 'Body Temp', cat: 'vitals' },
    { key: 'calories', label: 'Calories', cat: 'nutrition' },
    { key: 'protein', label: 'Protein', cat: 'nutrition' },
    { key: 'carbs', label: 'Carbs', cat: 'nutrition' },
    { key: 'fat', label: 'Fat', cat: 'nutrition' },
    { key: 'water', label: 'Water', cat: 'nutrition' },
    { key: 'weight', label: 'Weight', cat: 'body' },
    { key: 'bodyFat', label: 'Body Fat', cat: 'body' },
    { key: 'measurementRecency', label: 'Measurements Recency', cat: 'body' },
    { key: 'mood', label: 'Mood', cat: 'mood' },
    { key: 'habits', label: 'Habits', cat: 'habits' },
];

const ScoreCard: React.FC<ScoreCardProps> = ({ score, dateLabel, metrics }) => {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="daily-score-card">
            <div className="daily-score-main">
                <span className="daily-score-info-date">{dateLabel}</span>
                <ScoreRing score={score} />
                <button type="button" onClick={() => setExpanded(e => !e)} className="daily-score-toggle">
                    {expanded ? 'Hide breakdown' : 'Show breakdown'}
                </button>
            </div>

            {expanded && (
                <div className="daily-score-breakdown">
                    {CATEGORY_ORDER.map(cat => {
                        const catMetrics = METRIC_META.filter(m => m.cat === cat);
                        const logged = catMetrics.filter(m => metrics[m.key]?.logged).length;
                        return (
                            <div key={cat} className="daily-score-category">
                                <div className="daily-score-category-head">
                                    <span className="daily-score-category-title">{CATEGORY_LABELS[cat]}</span>
                                    <span className="daily-score-category-count">{logged}/{catMetrics.length}</span>
                                </div>
                                <div className="metric-chips">
                                    {catMetrics.map(m => {
                                        const metric = metrics[m.key];
                                        if (!metric?.logged) {
                                            return (
                                                <span key={m.key} className="metric-chip metric-chip--unlogged">
                                                    <span className="metric-chip-dot" />
                                                    <span className="metric-chip-label">{m.label}</span>
                                                    <span className="metric-chip-value">—</span>
                                                </span>
                                            );
                                        }
                                        return (
                                            <span key={m.key} className="metric-chip">
                                                <span className="metric-chip-dot" style={{ background: getScoreColor(metric.score) }} />
                                                <span className="metric-chip-label">{m.label}</span>
                                                <span className="metric-chip-value" style={{ color: getScoreColor(metric.score) }}>
                                                    {metric.score}
                                                </span>
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ScoreCard;