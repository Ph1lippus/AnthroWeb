import React, { useMemo } from 'react';
import { BookOpen, GraduationCap, ShieldCheck } from 'lucide-react';
import type { Book } from '../../services/bookService';
import type { AcademicCourse, AcademicItem, StudySession } from '../../services/academicService';
import type { AbstinenceGoal, AbstinenceHistory } from '../../services/abstinenceService';
import LoadingSpinner from '../LoadingSpinner';

interface DashboardExtrasProps {
    books: Book[];
    courses: AcademicCourse[];
    academicItems: AcademicItem[];
    studySessions: StudySession[];
    abstinenceGoals: AbstinenceGoal[];
    abstinenceHistory: AbstinenceHistory[];
    isLoading: boolean;
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
    isLoading,
}) => {
    const stats = useMemo(() => {
        const reading = books.filter(book => book.status === 'reading');
        const completed = books.filter(book => book.status === 'completed');
        const openItems = academicItems.filter(item => item.score == null);
        const overdueItems = openItems.filter(item => item.due_date && item.due_date < new Date().toISOString().slice(0, 10));
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

    if (isLoading) {
        return <div className="dashboard-extras-loading"><LoadingSpinner /></div>;
    }

    return (
        <section className="dashboard-extras" aria-label="Additional progress">
            <div className="analysis-grid dashboard-extras-grid">
                <article className="analysis-card">
                    <div className="analysis-card-head">
                        <BookOpen className="analysis-card-icon" size={18} />
                        <span className="analysis-card-label">Reading</span>
                    </div>
                    <strong className="analysis-card-value">{stats.totalBooks}</strong>
                    <span className="analysis-card-hint">{stats.reading.length} reading · {stats.completed.length} completed</span>
                </article>
                <article className="analysis-card">
                    <div className="analysis-card-head">
                        <GraduationCap className="analysis-card-icon" size={18} />
                        <span className="analysis-card-label">Academics</span>
                    </div>
                    <strong className="analysis-card-value">{stats.reading.length}</strong>
                    <span className="analysis-card-hint">{books.reduce((sum, book) => sum + book.current_page, 0)} pages read</span>
                </article>
                <article className="analysis-card">
                    <div className="analysis-card-head">
                        <GraduationCap className="analysis-card-icon" size={18} />
                        <span className="analysis-card-label">Courses</span>
                    </div>
                    <strong className="analysis-card-value">{courses.length}</strong>
                    <span className="analysis-card-hint">{stats.openItems.length} open · {stats.overdueItems.length} overdue</span>
                </article>
                <article className="analysis-card">
                    <div className="analysis-card-head">
                        <GraduationCap className="analysis-card-icon" size={18} />
                        <span className="analysis-card-label">Study time</span>
                    </div>
                    <strong className="analysis-card-value">{stats.studyHours}h {stats.studyMinutes}m</strong>
                    <span className="analysis-card-hint">Recorded study sessions</span>
                </article>
                <article className="analysis-card">
                    <div className="analysis-card-head">
                        <ShieldCheck className="analysis-card-icon" size={18} />
                        <span className="analysis-card-label">Abstinence</span>
                    </div>
                    <strong className="analysis-card-value">{stats.activeDays === null ? '--' : `${stats.activeDays}d`}</strong>
                    <span className="analysis-card-hint">
                        {stats.activeGoal ? `${stats.activeGoal.name}${stats.activeGoal.target_days ? ` · ${stats.activeGoal.target_days}d target` : ''}` : `${abstinenceHistory.length} completed goals`}
                    </span>
                </article>
                <article className="analysis-card">
                    <div className="analysis-card-head">
                        <ShieldCheck className="analysis-card-icon" size={18} />
                        <span className="analysis-card-label">Best streak</span>
                    </div>
                    <strong className="analysis-card-value">{stats.bestStreak === null ? '--' : `${stats.bestStreak}d`}</strong>
                    <span className="analysis-card-hint">{abstinenceHistory.length} completed goals</span>
                </article>
            </div>
        </section>
    );
};

export default DashboardExtras;
