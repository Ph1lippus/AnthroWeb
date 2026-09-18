import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCompletedHabitsForDate } from '../../services/habitService';
import type { Habit } from '../../services/habitService';
import type { DailyLog } from '../../services/dailyLogService';
import type { UserSettings } from '../../services/profileService';
import { computeDailyScore, calculateSleepDuration } from '../../utils/dailyScoring';
import type { ActiveGoals, DailyScoringInput } from '../../utils/dailyScoring';
import ScoreCard from '../DailyLog/ScoreCard';
import ScoreRing from '../DailyLog/ScoreRing';

const toDateString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

interface TodayScoreCardProps {
    logs: DailyLog[] | null;
    habits: Habit[] | null;
    settings: UserSettings | null;
}

const TodayScoreCard: React.FC<TodayScoreCardProps> = ({ logs, habits, settings }) => {
    const navigate = useNavigate();
    const [completedHabits, setCompletedHabits] = useState<Set<string>>(new Set());

    const today = toDateString(new Date());

    useEffect(() => {
        let active = true;
        getCompletedHabitsForDate(today).then(completed => {
            if (active) setCompletedHabits(completed);
        });
        return () => {
            active = false;
        };
    }, [today]);

    const result = useMemo(() => {
        if (!logs || !settings) return null;
        const log = logs.find(l => l.log_date === today);
        if (!log) return null;

        const input: DailyScoringInput = {
            wakeTime: log.wake_time || '',
            bedtime: log.bedtime || '',
            sleepQuality: log.sleep_quality?.toString() || '',
            morningSystolic: log.morning_systolic?.toString() || '',
            morningDiastolic: log.morning_diastolic?.toString() || '',
            morningBpm: log.morning_bpm?.toString() || '',
            eveningSystolic: log.evening_systolic?.toString() || '',
            eveningDiastolic: log.evening_diastolic?.toString() || '',
            eveningBpm: log.evening_bpm?.toString() || '',
            bodyTemperature: log.body_temperature?.toString() || '',
            calories: log.calories?.toString() || '',
            protein: log.protein?.toString() || '',
            carbs: log.carbs?.toString() || '',
            fat: log.fat?.toString() || '',
            water: log.water?.toString() || '',
            weight: log.weight?.toString() || '',
            bodyFat: log.body_fat?.toString() || '',
            mood: log.mood?.toString() || '',
            habits: {
                morningRoutine: log.morning_routine || false,
                eveningRoutine: log.evening_routine || false,
                fruitServing: log.fruit_serving || false,
                studied: log.studied || false,
                journal: log.journal || false,
                stretching: log.stretching || false,
                reading: log.reading || false,
                projectWorkDone: log.project_work_done || false,
            },
            customCompleted: completedHabits.size,
            customTotal: habits?.length || 0,
            activeGoals: (settings?.active_goals as ActiveGoals | undefined) || null,
            settings,
            computedSleepDuration: log.no_sleep ? null : calculateSleepDuration(log.wake_time || '', log.bedtime || ''),
            noSleep: log.no_sleep || false,
        };

        return computeDailyScore(input);
    }, [logs, settings, habits, completedHabits, today]);

    const dateLabel = new Date(today + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    const renderEmpty = () => (
        <div className="daily-score-card">
            <div className="daily-score-main">
                <ScoreRing score={0} />
                <div className="daily-score-info">
                    <span className="daily-score-info-date">{dateLabel}</span>
                    <span className="daily-score-heading">Today's Score</span>
                    <span className="daily-score-based">No metrics logged today yet.</span>
                    <button type="button" onClick={() => navigate('/Daily-Log')} className="btn-action">
                        Open Daily Log
                    </button>
                </div>
            </div>
        </div>
    );

    if (logs === null) {
        return (
            <div className="daily-score-card">
                <div className="profile-loading">
                    <div className="profile-loading-spinner"></div>
                    <p>Loading today's score...</p>
                </div>
            </div>
        );
    }

    if (result === null || result.loggedCount === 0) {
        return renderEmpty();
    }

    return (
        <ScoreCard
            score={result.score}
            loggedCount={result.loggedCount}
            totalMetrics={result.totalMetrics}
            dateLabel={dateLabel}
            metrics={result.metrics}
        />
    );
};

export default TodayScoreCard;