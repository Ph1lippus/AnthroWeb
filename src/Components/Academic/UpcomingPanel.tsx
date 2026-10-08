import React from 'react';
import { CalendarClock } from 'lucide-react';
import { CATEGORY_LABELS } from '../../utils/academicGpa';
import { collectUpcoming, URGENT_WITHIN_DAYS } from '../../utils/academicAlerts';
import type { UpcomingEntry } from '../../utils/academicAlerts';
import type { AcademicCourse, AcademicItem } from '../../utils/academicGpa';

interface UpcomingPanelProps {
    courses: AcademicCourse[];
    items: AcademicItem[];
    /** Overridable so the rendered output can be pinned to a fixed date. */
    now?: Date;
    onSelect?: (entry: UpcomingEntry) => void;
}

const formatDay = (timestamp: number): string =>
    new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const weekdayOf = (timestamp: number): string =>
    new Date(timestamp).toLocaleDateString(undefined, { weekday: 'short' });

/** "in 3 days" / "today" / "tomorrow". */
const countdown = (days: number): string => {
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
};

/**
 * Everything dated that is still ungraded, soonest first.
 *
 * Only work with a real due date appears, and only while it is still in the
 * future: a deadline that has passed is history, and one that has been marked is
 * done. That leaves the panel meaning "what is still coming at you", which is
 * the only question worth a permanent slot on the page. Renders nothing at all
 * when the answer is nothing.
 */
const UpcomingPanel: React.FC<UpcomingPanelProps> = ({ courses, items, now, onSelect }) => {
    const entries = collectUpcoming(courses, items, now);

    if (entries.length === 0) return null;

    return (
        <aside className="academic-upcoming">
            <div className="academic-upcoming__head">
                <CalendarClock size={14} />
                <span className="academic-upcoming__title">Coming up</span>
                <span className="academic-upcoming__count">{entries.length}</span>
            </div>

            <div className="academic-upcoming__list">
                {entries.map(entry => {
                    const urgent = entry.days <= URGENT_WITHIN_DAYS;

                    return (
                        <button
                            key={entry.item.id}
                            type="button"
                            className={`upcoming-row${urgent ? ' upcoming-row--urgent' : ''}`}
                            onClick={() => onSelect?.(entry)}
                            disabled={!onSelect}
                            data-tip={`${entry.item.name} · ${entry.course.name}${
                                entry.item.weight > 0 ? ` · worth ${entry.item.weight}%` : ''
                            }`}
                        >
                            <span className="upcoming-row__date">
                                <span className="upcoming-row__weekday">{weekdayOf(entry.due)}</span>
                                <span className="upcoming-row__daynum">{formatDay(entry.due)}</span>
                            </span>

                            <span className="upcoming-row__text">
                                <span className="upcoming-row__name">{entry.item.name}</span>
                                <span className="upcoming-row__course">
                                    {entry.course.name} · {CATEGORY_LABELS[entry.item.category]}
                                </span>
                            </span>

                            <span className={`upcoming-row__when${urgent ? ' upcoming-row__when--urgent' : ''}`}>
                                {entry.item.due_time ? `${entry.item.due_time.slice(0, 5)} · ` : ''}
                                {countdown(entry.days)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
};

export default UpcomingPanel;