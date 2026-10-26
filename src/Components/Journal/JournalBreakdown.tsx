/**
 * The journal's left-hand panel: what this day's entry is made of.
 *
 * The Daily Log answers "how was today" with a score ring and a breakdown of the
 * metrics behind it. The journal has no score -- a number that judged a piece of
 * writing would be a different product, not a similar one -- but it has the same
 * *shape* of information: how much was written, whether both halves were, how
 * each half was rated, and which topics came up.
 *
 * So it is built from the same `BreakdownPanel` and the same chip vocabulary as
 * the Daily Log's rather than from new markup. That is the whole point of the
 * journal page borrowing the Daily Log's grid: two pages that read as one app,
 * and they read as one app because they are drawn from the same parts.
 *
 * Every figure here is derived from what is on screen. There is no second source
 * and no fetch -- a summary that could disagree with the editors would be worse
 * than no summary, because the obvious response to a wrong number is to stop
 * trusting the page.
 */
import React from 'react';
import BreakdownPanel from '../DailyLog/BreakdownPanel';
import type { BreakdownGroup } from '../DailyLog/BreakdownPanel';
import { journalDocumentText, journalWordCount, journalTopicSuggestions } from '../../utils/journalContent';
import type { JournalDocument } from '../../utils/journalContent';
import { moodColor, moodLabel } from '../../utils/moodSeries';

interface JournalBreakdownProps {
    document: JournalDocument;
    morningMood: number | null;
    eveningMood: number | null;
    dateLabel: string;
    expanded: boolean;
}

/** Words in one half, or nothing if the half is blank. */
const wordsIn = (html: string): number => {
    const text = journalDocumentText({ version: 1, morning: html, evening: '', links: [] });
    return text ? text.split(/\s+/).length : 0;
};

const JournalBreakdown: React.FC<JournalBreakdownProps> = ({
    document,
    morningMood,
    eveningMood,
    dateLabel,
    expanded,
}) => {
    const morningWords = wordsIn(document.morning);
    const eveningWords = wordsIn(document.evening);
    const total = journalWordCount(document);
    const topics = journalTopicSuggestions(document);

    const morningColor = moodColor(morningMood);
    const eveningColor = moodColor(eveningMood);

    const groups: BreakdownGroup[] = [
        {
            key: 'writing',
            title: 'Writing',
            count: `${total} ${total === 1 ? 'word' : 'words'}`,
            chips: [
                {
                    key: 'morning-words',
                    label: 'Morning',
                    value: morningWords > 0 ? String(morningWords) : '—',
                    tone: morningWords > 0 ? 'value' : 'missing',
                    color: 'var(--color-primary)',
                },
                {
                    key: 'evening-words',
                    label: 'Evening',
                    value: eveningWords > 0 ? String(eveningWords) : '—',
                    tone: eveningWords > 0 ? 'value' : 'missing',
                    color: 'var(--color-warning)',
                },
            ],
        },
        {
            key: 'mood',
            title: 'Mood',
            count: morningMood != null && eveningMood != null ? 'both rated' : 'partial',
            chips: [
                {
                    key: 'morning-mood',
                    label: 'Morning',
                    value: morningMood != null ? `${morningMood}/10` : '—',
                    tone: morningMood != null ? 'value' : 'missing',
                    color: morningColor,
                },
                {
                    key: 'evening-mood',
                    label: 'Evening',
                    value: eveningMood != null ? `${eveningMood}/10` : '—',
                    tone: eveningMood != null ? 'value' : 'missing',
                    color: eveningColor,
                },
            ],
        },
    ];

    // Topics are only a group when there are some. An empty category heading with
    // nothing under it reads as a failure to load rather than as "none yet".
    if (topics.length > 0) {
        groups.push({
            key: 'topics',
            title: 'Topics',
            count: String(topics.length),
            chips: topics.map(topic => ({
                key: topic,
                label: `#${topic}`,
                value: '',
                tone: 'value' as const,
                color: 'var(--color-primary)',
            })),
        });
    }

    return (
        <div className="card daily-score-card journal-breakdown-card">
            <div className="card-header">
                <h3 className="card-title">
                    {dateLabel} <span className="card-title-words">{total} {total === 1 ? 'word' : 'words'}</span>
                </h3>
            </div>
            <div className="card-body">
                {/* `moodLabel` rather than a hand-written "7/10", so the figure here
                    is spelled the same way it is in every tooltip and aria label
                    elsewhere in the app. Two spellings of one value is how a number
                    starts looking wrong in one place and right in another. */}
                <p className="journal-breakdown-mood-line">
                    {morningMood != null && eveningMood != null ? (
                        <>
                            Rated <strong>{moodLabel(morningMood)}</strong> this morning and{' '}
                            <strong>{moodLabel(eveningMood)}</strong> this evening
                        </>
                    ) : morningMood != null ? (
                        <>Rated <strong>{moodLabel(morningMood)}</strong> this morning</>
                    ) : eveningMood != null ? (
                        <>Rated <strong>{moodLabel(eveningMood)}</strong> this evening</>
                    ) : (
                        'Not rated yet'
                    )}
                </p>

                <BreakdownPanel expanded={expanded} groups={groups} />
            </div>
        </div>
    );
};

export default JournalBreakdown;
