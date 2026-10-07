import React, { useMemo } from 'react';
import { Sunrise, Moon, TrendingUp, TrendingDown, Flame, CalendarCheck2, Hash } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DailyLog } from '../../services/dailyLogService';
import { moodFor, meanMood, dayDelta, moodDistribution, MOOD_TONE_COLOR } from '../../utils/moodSeries';
import { rangeStart } from './range';
import { todayString, addDays } from '../../utils/dates';

interface Stat {
    key: string;
    label: string;
    value: string;
    hint: string;
    Icon: LucideIcon;
    tone: 'good' | 'warn' | 'flat';
    /** Overrides the tone colour on the value, where the value *is* a rating. */
    color?: string;
}

const fmt = (n: number, digits = 1): string => String(Number(n.toFixed(digits)));

/**
 * The month's mood in six tiles.
 *
 * The two halves are summarised separately before they are combined, because
 * averaging them first loses the one thing worth knowing: whether mornings and
 * evenings tend to agree, and if they do not, which way they part. A single
 * "average mood" figure hides a month of good mornings and bad evenings behind a
 * comfortable number.
 *
 * Every tile is null-safe. A range with no ratings at all shows "—" rather than
 * 0, because "no days rated" and "every day rated zero" are different facts and
 * only one of them is bad news.
 */
const MoodStatCards: React.FC<{ logs: DailyLog[]; maxDays: number | null }> = ({ logs, maxDays }) => {
    // The same window the band chart below resolves, from the same helper, so the
    // tiles and the chart can never describe different sets of days.
    const start = rangeStart(maxDays);

    const stats = useMemo<Stat[]>(() => {
        const scoped = [...logs].filter(l => start === null || l.log_date >= start);

        const mornings = scoped.map(l => moodFor(l, 'morning')).filter((v): v is number => v !== null);
        const evenings = scoped.map(l => moodFor(l, 'evening')).filter((v): v is number => v !== null);

        const avg = (values: number[]): number | null =>
            values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

        const amMean = avg(mornings);
        const pmMean = avg(evenings);
        const dist = moodDistribution(scoped);

        // Consecutive days ending today that carry anything at all -- a rating or
        // an entry. Stops at the first gap. Walked with `addDays` on the date
        // strings so it counts calendar days rather than 86.4-million-millisecond
        // steps, which slip by an hour across a daylight-saving boundary and drop
        // a day from the count.
        let streak = 0;
        const dated = new Map(scoped.map(l => [l.log_date, l]));
        let cursor = todayString();
        for (let i = 0; i < (maxDays ?? 400); i++) {
            const log = dated.get(cursor);
            const hasSomething = log && (meanMood(log) !== null
                || (log.journal_morning?.length ?? 0) > 0
                || (log.journal_evening?.length ?? 0) > 0);
            if (!hasSomething) break;
            streak++;
            cursor = addDays(cursor, -1);
        }

        // The largest single-swing day, and the topic that recurs most. The topic is
        // the same count the graph sizes its bubbles by, so a number here and a
        // bubble there always agree.
        let widest: { date: string; delta: number } | null = null;
        for (const log of scoped) {
            const delta = dayDelta(log);
            if (delta === null) continue;
            if (!widest || Math.abs(delta) > Math.abs(widest.delta)) {
                widest = { date: log.log_date, delta };
            }
        }

        const topicCounts = new Map<string, number>();
        for (const log of scoped) {
            for (const raw of log.journal_links ?? []) {
                const label = raw.trim();
                if (!label) continue;
                const key = label.toLowerCase();
                topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);
            }
        }
        let topTopic: { label: string; count: number } | null = null;
        for (const [key, count] of topicCounts) {
            if (!topTopic || count > topTopic.count) topTopic = { label: key, count };
        }

        const toneFor = (m: number | null): 'good' | 'warn' | 'flat' =>
            m === null ? 'flat' : m >= 7 ? 'good' : 'warn';

        const out: Stat[] = [
            {
                key: 'am',
                label: 'Avg morning',
                value: amMean === null ? '—' : `${fmt(amMean)}/10`,
                hint: mornings.length ? `${mornings.length} rated` : 'no morning ratings',
                Icon: Sunrise,
                tone: toneFor(amMean),
                color: amMean === null ? undefined : MOOD_TONE_COLOR[amMean <= 4 ? 'low' : amMean <= 6 ? 'mid' : 'high'],
            },
            {
                key: 'pm',
                label: 'Avg evening',
                value: pmMean === null ? '—' : `${fmt(pmMean)}/10`,
                hint: evenings.length ? `${evenings.length} rated` : 'no evening ratings',
                Icon: Moon,
                tone: toneFor(pmMean),
                color: pmMean === null ? undefined : MOOD_TONE_COLOR[pmMean <= 4 ? 'low' : pmMean <= 6 ? 'mid' : 'high'],
            },
            {
                key: 'streak',
                label: 'Journal streak',
                value: streak > 0 ? `${streak}d` : '—',
                hint: streak > 0 ? 'consecutive days' : 'nothing written today or yesterday',
                Icon: Flame,
                tone: streak >= 3 ? 'good' : streak > 0 ? 'warn' : 'flat',
            },
            {
                key: 'rated',
                label: 'Days rated',
                value: String(dist.rated),
                hint: dist.rated === 0
                    ? 'no ratings in range'
                    : `${dist.low} low · ${dist.mid} mid · ${dist.high} good`,
                Icon: CalendarCheck2,
                tone: 'flat',
            },
            {
                key: 'swing',
                label: 'Biggest swing',
                value: widest === null ? '—' : `${widest.delta > 0 ? '+' : ''}${widest.delta}`,
                hint: widest === null
                    ? 'needs both halves rated'
                    : `${widest.date} · ${widest.delta > 0 ? 'evening was better' : widest.delta < 0 ? 'evening was worse' : 'even all day'}`,
                Icon: widest !== null && widest.delta < 0 ? TrendingDown : TrendingUp,
                tone: 'flat',
                color: widest === null || widest.delta === 0
                    ? undefined
                    : MOOD_TONE_COLOR[widest.delta < 0 ? 'low' : 'high'],
            },
            {
                key: 'topic',
                label: 'Top topic',
                value: topTopic === null ? '—' : topTopic.label,
                hint: topTopic === null ? 'no topics linked' : `linked on ${topTopic.count} ${topTopic.count === 1 ? 'entry' : 'entries'}`,
                Icon: Hash,
                tone: 'flat',
            },
        ];
        return out;
    }, [logs, start, maxDays]);

    return (
        <div className="analysis-grid">
            {stats.map(stat => {
                const Icon = stat.Icon;
                return (
                    <div key={stat.key} className={`analysis-card analysis-card--${stat.tone}`}>
                        <div className="analysis-card-head">
                            <Icon className="analysis-card-icon" size={15} aria-hidden="true" />
                            <span className="analysis-card-label">{stat.label}</span>
                        </div>
                        <div className="analysis-card-value" style={stat.color ? { color: stat.color } : undefined}>
                            {stat.value}
                        </div>
                        <div className="analysis-card-hint">{stat.hint}</div>
                    </div>
                );
            })}
        </div>
    );
};

export default MoodStatCards;