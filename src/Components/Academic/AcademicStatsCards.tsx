import React from 'react';
import {
    Award,
    BarChart3,
    BookCheck,
    CalendarDays,
    ChevronUp,
    GraduationCap,
    Hourglass,
    ListChecks,
    Scale,
    Target,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import {
    averageCredits,
    computeGpa,
    computeGradeSpread,
    computeInputProgress,
    computeProjectedGpa,
    countCoursesInProgress,
    formatGpa,
    formatPoints,
    integerInterval,
    nextGradeUp,
    percentToPoints,
    predictionAccuracy,
    rankCoursesByPrediction,
} from '../../utils/academicGpa';
import type { AcademicCourse, CoursePrediction, GpaScale } from '../../utils/academicGpa';
import { resolveSemesterName } from '../../utils/semester';
import type { AcademicSemester } from '../../services/academicService';

interface AcademicStatsCardsProps {
    courses: AcademicCourse[];
    semesters: AcademicSemester[];
    predictions: Map<string, CoursePrediction>;
    scale: GpaScale;
}

interface Stat {
    key: string;
    label: string;
    value: string;
    hint: string;
    icon: React.ReactNode;
    tone: 'good' | 'warn' | 'flat';
    highlight?: boolean;
}

const statTips: Record<string, string> = {
    gpa: 'Credit-weighted average of courses with teacher-entered final grades.',
    projected: 'Credit-weighted GPA using final grades plus the points currently banked in unfinished courses.',
    semester: 'GPA for the most recently listed semester with its courses.',
    next: 'The next whole-grade boundary above your earned GPA and how far away it is.',
    weakest: 'The lowest current subject prediction.',
    strongest: 'The highest current subject prediction.',
    credits: 'Total ECTS included in the earned GPA.',
    courses: 'Number of courses currently included in the earned GPA.',
    accuracy: 'Average difference between a subject prediction and its teacher-entered final grade.',
    'best-semester': 'Highest completed semester GPA.',
    'worst-semester': 'Lowest completed semester GPA when at least two semesters have grades.',
    spread: 'How much subject grades vary around their average.',
    'in-progress': 'Courses that do not have a teacher-entered final grade yet.',
    inputs: 'Assessment inputs with a score entered, compared with all created inputs.',
    'credits-per-course': 'Average ECTS value across all courses.',
    'on-the-edge': 'Subjects close to crossing into the next whole grade.',
};

const AcademicStatsCards: React.FC<AcademicStatsCardsProps> = ({
    courses,
    semesters,
    predictions,
    scale,
}) => {
    const overall = computeGpa(courses, scale);
    const projected = computeProjectedGpa(courses, predictions, scale);
    const accuracy = predictionAccuracy(courses, predictions);
    const ranked = rankCoursesByPrediction(courses, predictions, scale);

    // The service orders semesters newest first.
    const latestSemester = semesters[0];
    const latestCourses = latestSemester?.id
        ? courses.filter(course => course.semester_id === latestSemester.id)
        : [];
    const semesterGpa = computeGpa(latestCourses, scale);

    const weakest = ranked[0] ?? null;
    const strongest = ranked.length > 0 ? ranked[ranked.length - 1] : null;

    const spread = computeGradeSpread(courses, scale);
    const inputProgress = computeInputProgress(predictions);
    const inProgress = countCoursesInProgress(courses);
    const meanCredits = averageCredits(courses);
    const projectedCoverage = courses.reduce(
        (sum, course) => {
            if (!course.id || course.credits <= 0) return sum;
            const finalGrade = typeof course.final_grade === 'number' && !Number.isNaN(course.final_grade);
            const prediction = predictions.get(course.id);
            if (finalGrade) {
                return {
                    coveredCredits: sum.coveredCredits + course.credits,
                    totalCredits: sum.totalCredits + course.credits,
                };
            }
            if (prediction?.percent === null || prediction?.percent === undefined) return sum;
            return {
                coveredCredits: sum.coveredCredits + (course.credits * Math.min(100, prediction.gradedWeight)) / 100,
                totalCredits: sum.totalCredits + course.credits,
            };
        },
        { coveredCredits: 0, totalCredits: 0 },
    );
    const projectedConfidence = projectedCoverage.totalCredits > 0
        ? Math.round((projectedCoverage.coveredCredits / projectedCoverage.totalCredits) * 100)
        : null;

    // Best and worst completed term, so a single strong semester is visible next
    // to the aggregate instead of being averaged away.
    const semesterRanked = semesters
        .map(semester => {
            const owned = courses.filter(course => (course.semester_id ?? '') === (semester.id ?? ''));
            return { semester, gpa: computeGpa(owned, scale).gpa };
        })
        .filter(entry => entry.gpa !== null)
        .sort((a, b) => (b.gpa ?? 0) - (a.gpa ?? 0));
    const bestSemester = semesterRanked[0] ?? null;
    const worstSemester = semesterRanked.length > 1 ? semesterRanked[semesterRanked.length - 1] : null;

    // Courses whose prediction sits within a hair of rounding up to the next
    // whole grade, which is where a little effort pays off most visibly.
    const onTheEdge = ranked.filter(entry => {
        const grade = percentToPoints(entry.percent, scale);
        const interval = integerInterval(grade, scale);
        if (!interval) return false;
        return Math.min(entry.points - interval.loPoints, interval.hiPoints - entry.points) < 0.15;
    });

    // The whole point of a running average: how far from the next grade step.
    const nextGrade = overall.percent === null ? null : nextGradeUp(overall.percent, scale);
    const neededPercent = nextGrade === null || overall.percent === null
        ? null
        : Math.max(0, nextGrade.minPercent - overall.percent);

    const stats: Stat[] = [
        {
            key: 'gpa',
            label: 'Earned GPA',
            value: formatGpa(overall.gpa, scale),
            hint:
                overall.gpa === null
                    ? 'No final grades yet'
                    : `${overall.coursesCounted} graded · ${overall.credits} ECTS`,
            icon: <GraduationCap size={14} className="analysis-card-icon" />,
            tone: overall.gpa === null ? 'flat' : 'good',
            highlight: true,
        },
        {
            key: 'projected',
            label: 'Projected GPA',
            value: formatGpa(projected.points, scale),
            hint:
                projected.points === null
                    ? 'Nothing measurable yet'
                    : projected.predictedCount === 0
                      ? `${projected.finalCount} final grade${projected.finalCount === 1 ? '' : 's'} · confidence 100%`
                      : `${projected.finalCount} final + ${projected.predictedCount} in progress · confidence ${projectedConfidence ?? 0}%`,
            icon: <Target size={14} className="analysis-card-icon" />,
            tone: projected.points === null ? 'flat' : 'good',
        },
        {
            key: 'semester',
            label: 'Latest Semester',
            value: formatGpa(semesterGpa.gpa, scale),
            hint: latestSemester
                ? resolveSemesterName(latestSemester.name, latestSemester.year, latestSemester.semester)
                : 'No semester yet',
            icon: <CalendarDays size={14} className="analysis-card-icon" />,
            tone: semesterGpa.gpa === null ? 'flat' : 'good',
        },
        {
            key: 'next',
            label: 'Next Grade Up',
            value: nextGrade === null ? '—' : formatPoints(nextGrade.points, scale),
            hint:
                nextGrade === null
                    ? overall.percent === null
                        ? 'Needs a final grade to compare'
                        : 'Already at the top of the scale'
                    : neededPercent !== null && neededPercent <= 0
                      ? 'Reached'
                      : `${neededPercent?.toFixed(1)}% short of ${nextGrade.minPercent}%`,
            icon: <ChevronUp size={14} className="analysis-card-icon" />,
            tone: nextGrade === null ? 'flat' : 'warn',
        },
        {
            key: 'weakest',
            label: 'Weakest Subject',
            value: weakest ? formatPoints(weakest.points, scale) : '—',
            hint: weakest ? weakest.course.name : 'Needs a prediction',
            icon: <TrendingDown size={14} className="analysis-card-icon" />,
            tone: weakest === null ? 'flat' : weakest.percent < 50 ? 'warn' : 'flat',
        },
        {
            key: 'strongest',
            label: 'Strongest Subject',
            value: strongest ? formatPoints(strongest.points, scale) : '—',
            hint: strongest ? strongest.course.name : 'Needs a prediction',
            icon: <TrendingUp size={14} className="analysis-card-icon" />,
            tone: strongest === null ? 'flat' : 'good',
        },
        {
            key: 'credits',
            label: 'Credits Earned',
            value: `${overall.credits}`,
            hint:
                overall.uncountedCourses > 0
                    ? `${overall.uncountedCourses} course(s) missing credits`
                    : 'ECTS counted toward the GPA',
            icon: <Award size={14} className="analysis-card-icon" />,
            tone: overall.uncountedCourses > 0 ? 'warn' : 'flat',
        },
        {
            key: 'courses',
            label: 'Courses Graded',
            value: `${overall.coursesCounted}`,
            hint: `${courses.length} in total`,
            icon: <BookCheck size={14} className="analysis-card-icon" />,
            tone: 'flat',
        },
        {
            key: 'accuracy',
            label: 'Prediction Accuracy',
            value: accuracy.meanAbsError === null ? '—' : `±${accuracy.meanAbsError.toFixed(1)}%`,
            hint:
                accuracy.count === 0
                    ? 'Needs a prediction and a final grade'
                    : `Average miss over ${accuracy.count} course(s)`,
            icon: <Target size={14} className="analysis-card-icon" />,
            tone:
                accuracy.meanAbsError === null
                    ? 'flat'
                    : accuracy.meanAbsError <= 5
                      ? 'good'
                      : 'warn',
        },
        {
            key: 'best-semester',
            label: 'Best Semester',
            value: bestSemester ? formatGpa(bestSemester.gpa, scale) : '—',
            hint: bestSemester
                ? resolveSemesterName(
                      bestSemester.semester.name,
                      bestSemester.semester.year,
                      bestSemester.semester.semester,
                  )
                : 'Needs a graded semester',
            icon: <TrendingUp size={14} className="analysis-card-icon" />,
            tone: bestSemester === null ? 'flat' : 'good',
        },
        {
            key: 'worst-semester',
            label: 'Weakest Semester',
            value: worstSemester ? formatGpa(worstSemester.gpa, scale) : '—',
            hint: worstSemester
                ? resolveSemesterName(
                      worstSemester.semester.name,
                      worstSemester.semester.year,
                      worstSemester.semester.semester,
                  )
                : 'Needs two graded semesters',
            icon: <TrendingDown size={14} className="analysis-card-icon" />,
            tone: worstSemester === null ? 'flat' : 'warn',
        },
        {
            key: 'spread',
            label: 'Grade Spread',
            value: spread.stdDev === null ? '—' : `±${spread.stdDev.toFixed(2)}`,
            hint:
                spread.stdDev === null
                    ? 'Needs two graded courses'
                    : `out of ${scale.max_value} · ${spread.spread?.toFixed(2)} best to worst`,
            icon: <BarChart3 size={14} className="analysis-card-icon" />,
            tone: 'flat',
        },
        {
            key: 'in-progress',
            label: 'In Progress',
            value: `${inProgress}`,
            hint:
                inProgress === 0
                    ? 'Every course has a final grade'
                    : `${courses.length - inProgress} of ${courses.length} finished`,
            icon: <Hourglass size={14} className="analysis-card-icon" />,
            tone: inProgress === 0 ? 'good' : 'warn',
        },
        {
            key: 'inputs',
            label: 'Inputs Graded',
            value: `${inputProgress.graded}/${inputProgress.total}`,
            hint:
                inputProgress.percent === null
                    ? 'No inputs yet'
                    : `${inputProgress.percent}% of all tests entered`,
            icon: <ListChecks size={14} className="analysis-card-icon" />,
            tone: inputProgress.percent === null ? 'flat' : inputProgress.percent >= 80 ? 'good' : 'warn',
        },
        {
            key: 'credits-per-course',
            label: 'Avg Credits',
            value: meanCredits === null ? '—' : `${meanCredits}`,
            hint: meanCredits === null ? 'No courses yet' : 'ECTS per course',
            icon: <Scale size={14} className="analysis-card-icon" />,
            tone: 'flat',
        },
        {
            key: 'on-the-edge',
            label: 'Just Below A Grade',
            value: `${onTheEdge.length}`,
            hint:
                onTheEdge.length === 0
                    ? 'Nothing sitting on a rounding boundary'
                    : onTheEdge[0].course.name,
            icon: <ChevronUp size={14} className="analysis-card-icon" />,
            tone: onTheEdge.length === 0 ? 'flat' : 'warn',
        },
    ];

    return (
        <div className="analysis-grid">
            {stats.map(stat => (
                <div
                    key={stat.key}
                    data-tip={statTips[stat.key]}
                    className={`analysis-card analysis-card--${stat.tone}${stat.highlight ? ' academic-gpa-card' : ''}`}
                >
                    <div className="analysis-card-head">
                        {stat.icon}
                        <span className="analysis-card-label">{stat.label}</span>
                    </div>
                    <div className="analysis-card-value">{stat.value}</div>
                    <div className="analysis-card-hint">{stat.hint}</div>
                </div>
            ))}
        </div>
    );
};

export default AcademicStatsCards;
