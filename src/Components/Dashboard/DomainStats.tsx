import React, { useMemo } from 'react';
import { BookOpen, FolderKanban, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDomainStats } from '../../hooks/useDomainStats';

/**
 * The dashboard's second stats row: the strips that used to sit on top of the
 * Projects, Books and Abstinence pages, moved here so those pages open straight
 * on their content.
 *
 * These are lifetime totals rather than range-scoped ones, so the range pills
 * above deliberately do not touch them. Each card fills itself in when its own
 * query lands and shows `--` until then -- one slow query must not hold a row of
 * independent numbers hostage.
 */
interface Stat {
    key: string;
    label: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    tone: 'good' | 'warn' | 'flat';
    /** Withheld while its query is in flight. */
    pending: boolean;
}

const daysSince = (date: string): number =>
    Math.max(0, Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000));

const DomainStats: React.FC = () => {
    const { projects, books, abstinenceGoals, abstinenceHistory, pending } = useDomainStats();

    const stats = useMemo<Stat[]>(() => {
        const active = projects.filter(p => p.status === 'active');
        const completed = projects.filter(p => p.status === 'completed');
        const maintenance = projects.filter(p => p.status === 'maintenance');
        const highPriority = active.filter(p => p.priority === 'high');

        const pagesRead = books.reduce((sum, b) => sum + b.current_page, 0);
        const booksFinished = books.filter(b => b.total_pages > 0 && b.current_page >= b.total_pages);
        const reading = books.filter(b => b.status === 'reading');
        const libraryPct = books.length > 0 ? Math.round((booksFinished.length / books.length) * 100) : 0;

        const withTarget = abstinenceGoals.filter(g => g.target_days != null);
        const longest = abstinenceGoals.length > 0
            ? abstinenceGoals.reduce((best, g) => (daysSince(g.start_date) > daysSince(best.start_date) ? g : best))
            : null;
        const bestStreak = abstinenceHistory.length > 0
            ? Math.max(...abstinenceHistory.map(h => h.duration_days))
            : null;

        return [
            {
                key: 'projectsTotal',
                label: 'Projects',
                value: String(projects.length),
                hint: `${active.length} active · ${completed.length} completed`,
                icon: FolderKanban,
                tone: 'flat',
                pending: pending.projects,
            },
            {
                key: 'projectsActive',
                label: 'Active Projects',
                value: String(active.length),
                hint: highPriority.length > 0 ? `${highPriority.length} high priority` : 'Nothing high priority',
                icon: FolderKanban,
                tone: active.length > 0 ? 'good' : 'flat',
                pending: pending.projects,
            },
            {
                key: 'projectsCompleted',
                label: 'Completed Projects',
                value: String(completed.length),
                hint: maintenance.length > 0 ? `${maintenance.length} in maintenance` : 'Nothing in maintenance',
                icon: FolderKanban,
                tone: completed.length > 0 ? 'good' : 'flat',
                pending: pending.projects,
            },
            // Same rule as the Projects page: a tile that always reads 0 is noise.
            ...(maintenance.length > 0
                ? [{
                    key: 'projectsMaintenance',
                    label: 'In Maintenance',
                    value: String(maintenance.length),
                    hint: 'Past the finish line, still open',
                    icon: FolderKanban,
                    tone: 'flat' as const,
                    pending: pending.projects,
                }]
                : []),
            {
                key: 'booksTotal',
                label: 'Books',
                value: String(books.length),
                hint: `${reading.length} reading now`,
                icon: BookOpen,
                tone: 'flat',
                pending: pending.books,
            },
            {
                key: 'booksPages',
                label: 'Pages Read',
                value: String(pagesRead),
                hint: books.length > 0 ? `${booksFinished.length} of ${books.length} finished` : 'No books yet',
                icon: BookOpen,
                tone: 'flat',
                pending: pending.books,
            },
            {
                key: 'booksCompleted',
                label: 'Completed Books',
                value: String(booksFinished.length),
                hint: `${libraryPct}% of the library`,
                icon: BookOpen,
                tone: booksFinished.length > 0 ? 'good' : 'flat',
                pending: pending.books,
            },
            {
                key: 'abstinenceActive',
                label: 'Active Streaks',
                value: String(abstinenceGoals.length),
                hint: withTarget.length > 0 ? `${withTarget.length} with a target` : 'No targets set',
                icon: ShieldCheck,
                tone: abstinenceGoals.length > 0 ? 'good' : 'flat',
                pending: pending.abstinenceGoals,
            },
            {
                key: 'abstinenceLongest',
                label: 'Longest Active',
                value: longest === null ? '0d' : `${daysSince(longest.start_date)}d`,
                hint: longest === null ? 'No active streaks' : longest.name,
                icon: ShieldCheck,
                tone: 'flat',
                pending: pending.abstinenceGoals,
            },
            {
                key: 'abstinenceBest',
                label: 'Best Streak',
                value: bestStreak === null ? '0d' : `${bestStreak}d`,
                hint: `${abstinenceHistory.length} completed goal${abstinenceHistory.length === 1 ? '' : 's'}`,
                icon: ShieldCheck,
                tone: bestStreak !== null && bestStreak > 0 ? 'good' : 'flat',
                pending: pending.abstinenceHistory,
            },
        ];
    }, [projects, books, abstinenceGoals, abstinenceHistory, pending]);

    if (stats.length === 0) return null;

    return (
        <div className="analysis-grid">
            {stats.map(s => {
                const Icon = s.icon;
                return (
                    <div key={s.key} className={`analysis-card analysis-card--${s.tone}`}>
                        <div className="analysis-card-head">
                            <Icon className="analysis-card-icon" size={15} aria-hidden="true" />
                            <span className="analysis-card-label">{s.label}</span>
                        </div>
                        <div className="analysis-card-value">{s.pending ? '--' : s.value}</div>
                        <div className="analysis-card-hint">{s.pending ? ' ' : s.hint}</div>
                    </div>
                );
            })}
        </div>
    );
};

export default React.memo(DomainStats);
