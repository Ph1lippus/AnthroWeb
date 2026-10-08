import React from 'react';
import ScoreRing from './ScoreRing';
import BreakdownPanel from './BreakdownPanel';
import type { BreakdownGroup } from './BreakdownPanel';
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
    /**
     * The day being scored, spelled out in full. It belongs on the card rather than
     * in the row of controls above it: those pick a day, this is the day they picked.
     */
    dateLabel: string;
    metrics: Record<string, MetricScore>;
    /**
     * Whether the breakdown is drawn. Owned by the page rather than by this card,
     * because the control for it lives in the row of controls above the card.
     */
    expanded: boolean;
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

const ScoreCard: React.FC<ScoreCardProps> = ({
    score,
    dateLabel,
    metrics,
    expanded,
}) => {
    /*
     * Built here and handed down rather than drawn inside the panel, because the
     * category definitions are this card's business -- the panel is the shared
     * shape, and the measurements page fills the same shape with different rows.
     */
    const groups: BreakdownGroup[] = CATEGORY_ORDER.map(cat => {
        const catMetrics = METRIC_META.filter(m => m.cat === cat);
        const logged = catMetrics.filter(m => metrics[m.key]?.logged).length;
        return {
            key: cat,
            title: CATEGORY_LABELS[cat],
            count: `${logged}/${catMetrics.length}`,
            chips: catMetrics.map(m => {
                const metric = metrics[m.key];
                if (!metric?.logged) {
                    return { key: m.key, label: m.label, value: '—', tone: 'missing' as const };
                }
                const color = getScoreColor(metric.score);
                return {
                    key: m.key,
                    label: m.label,
                    value: String(metric.score),
                    tone: 'value' as const,
                    color,
                };
            }),
        };
    });

    return (
        <div className="daily-score-card">
            <div className="daily-score-main">
                {/* First in the DOM, so no `order` is needed to put it above the ring. */}
                <span className="daily-score-info-date">{dateLabel}</span>
                <ScoreRing score={score} />
            </div>

            {/*
                Kept mounted and collapsed to nothing rather than unmounted, because
                a panel that vanishes has nothing to animate. `grid-template-rows`
                from `0fr` to `1fr` is the one height transition that works without
                measuring, and the inner wrapper carries `overflow: hidden` so the
                chips do not spill out while the rows are still collapsing.
            */}
            <BreakdownPanel expanded={expanded} groups={groups} />
        </div>
    );
};

export default ScoreCard;