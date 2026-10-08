import React, { useMemo } from 'react';
import { BookOpen, GraduationCap, ShieldCheck } from 'lucide-react';
import type { Book } from '../../services/bookService';
import type { AcademicCourse, AcademicItem, StudySession } from '../../services/academicService';
import type { AbstinenceGoal, AbstinenceHistory } from '../../services/abstinenceService';
import type { DashboardExtrasPending } from '../../hooks/useDashboardExtras';
import { isPastDeadline } from '../../utils/academicAlerts';

interface DashboardExtrasProps {
    books: Book[];
    courses: AcademicCourse[];
    academicItems: AcademicItem[];
    studySessions: StudySession[];
    abstinenceGoals: AbstinenceGoal[];
    abstinenceHistory: AbstinenceHistory[];
    pending: DashboardExtrasPending;
}

const daysSince = (date: string): number =>
    Math.max(0, Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000));

const DashboardExtras: React.FC<DashboardExtrasProps> = ({
    books,
    courses,
    academicItems,
    studySessions,
    abstinenceGoals,
    abstinenceHistory,
    pending,
}) => {
    const stats = useMemo(() => {
        const reading = books.filter(book => book.status === 'reading');
        const completed = books.filter(book => book.status === 'completed');
        const openItems = academicItems.filter(item => item.score == null);
        // Past the deadline, not past the date: an exam that sat at 09:00 is
        // overdue all afternoon, while an item with no hour owns its whole day
        // and only goes over at the next midnight. Same lapse rule as the
        // academic page's finished marker -- shared so the two can't disagree.
        const overdueItems = openItems.filter(item => isPastDeadline(item));
        const studyMinutes = studySessions
            .filter(session => session.session_type !== 'break')
            .reduce((total, session) => total + session.duration_minutes, 0);
        const activeGoal = abstinenceGoals
            .slice()
            .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
        const activeDays = activeGoal ? daysSince(activeGoal.start_date) : null;

        const bestStreak = abstinenceHistory.length > 0
            ? Math.max(...abstinenceHistory.map(entry => entry.duration_days))
            : null;

        return {
            totalBooks: books.length,
            reading,
            completed,
            openItems,
            overdueItems,
            studyHours: Math.floor(studyMinutes / 60),
            studyMinutes: studyMinutes % 60,
            activeGoal,
            activeDays,
            bestStreak,
        };
    }, [books, academicItems, studySessions, abstinenceGoals, abstinenceHistory]);

    /**
     * The grid is never replaced by a placeholder block.
     *
     * It used to be: one bordered 10rem box with a spinner, which is two bugs at
     * once. It is one row tall where six cards are two, so everything below it
     * jumped down when the data arrived; and it had a border and a radius the
     * cards do not, so it read as "these are still loading" while the rest of the
     * page was finished.
     *
     * Each card now decides on its own, so a card whose query has landed is filled
     * in while its neighbours are still waiting.
     */
    const card = (
        label: string,
        Icon: typeof BookOpen,
        loading: boolean,
        value: string,
        hint: string,
    ) => (
        <article className="analysis-card">
            <div className="analysis-card-head">
                <Icon className="analysis-card-icon" size={18} />
                <span className="analysis-card-label">{label}</span>
            </div>
            <strong className="analysis-card-value">{loading ? '--' : value}</strong>
            <span className="analysis-card-hint">{loading ? ' ' : hint}</span>
        </article>
    );

    return (
        <section className="dashboard-extras" aria-label="Additional progress">
            <div className="analysis-grid dashboard-extras-grid">
                {card(
                    'Reading',
                    BookOpen,
                    pending.reading,
                    String(stats.totalBooks),
                    `${stats.reading.length} reading · ${stats.completed.length} completed`,
                )}
                {card(
                    'Academics',
                    GraduationCap,
                    pending.academics,
                    String(stats.reading.length),
                    `${books.reduce((sum, book) => sum + book.current_page, 0)} pages read`,
                )}
                {card(
                    'Courses',
                    GraduationCap,
                    pending.courses,
                    String(courses.length),
                    `${stats.openItems.length} open · ${stats.overdueItems.length} overdue`,
                )}
                {card(
                    'Study time',
                    GraduationCap,
                    pending.study,
                    `${stats.studyHours}h ${stats.studyMinutes}m`,
                    'Recorded study sessions',
                )}
                {card(
                    'Abstinence',
                    ShieldCheck,
                    pending.abstinence,
                    stats.activeDays === null ? '--' : `${stats.activeDays}d`,
                    stats.activeGoal
                        ? `${stats.activeGoal.name}${stats.activeGoal.target_days ? ` · ${stats.activeGoal.target_days}d target` : ''}`
                        : `${abstinenceHistory.length} completed goals`,
                )}
                {card(
                    'Best streak',
                    ShieldCheck,
                    pending.streak,
                    stats.bestStreak === null ? '--' : `${stats.bestStreak}d`,
                    `${abstinenceHistory.length} completed goals`,
                )}
            </div>
        </section>
    );
};

export default DashboardExtras;
