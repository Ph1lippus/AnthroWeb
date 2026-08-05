import React, { useState, useEffect, useRef } from 'react';
import Title from '../Components/Title';
import {
    getUserAcademicSemesters,
    createAcademicSemester,
    updateAcademicSemester,
    deleteAcademicSemester,
    getUserGradingScales,
    createGradingScale,
    updateGradingScale,
    deleteGradingScale,
    getUserAcademicGrades,
    createAcademicGrade,
    updateAcademicGrade,
    deleteAcademicGrade,
    exportAcademicGradesToCSV,
    importAcademicGradesFromCSV,
    getUserAcademicGoals,
    createAcademicGoal,
    updateAcademicGoal,
    deleteAcademicGoal,
    getUserAcademicAssessments,
    createAcademicAssessment,
    updateAcademicAssessment,
    deleteAcademicAssessment,
    toggleAssessmentComplete,
    getUserStudySessions,
    createStudySession,
    updateStudySession,
    deleteStudySession,
} from '../services/academicService';
import type {
    AcademicSemester,
    GradingScale,
    AcademicGrade,
    AcademicGoal,
    AcademicAssessment,
    StudySession,
} from '../services/academicService';

type TabType = 'semesters' | 'gradingScales' | 'grades' | 'goals' | 'assessments' | 'studySessions';

const AcademicPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('semesters');
    const [searchQuery, setSearchQuery] = useState('');
    const [submittedSearch, setSubmittedSearch] = useState('');

    // Toast notification state
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (type: 'success' | 'error' | 'info', message: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ type, message });
        toastTimerRef.current = setTimeout(() => setToast(null), 2500);
    };

    // ==================== SEMESTERS STATE ====================
    const [semesters, setSemesters] = useState<AcademicSemester[]>([]);
    const [showSemesterForm, setShowSemesterForm] = useState(false);
    const [editingSemester, setEditingSemester] = useState<AcademicSemester | null>(null);
    const [semesterName, setSemesterName] = useState('');
    const [semesterYear, setSemesterYear] = useState('');
    const [semesterNum, setSemesterNum] = useState('1');
    const [semesterStart, setSemesterStart] = useState('');
    const [semesterEnd, setSemesterEnd] = useState('');
    const [deleteSemesterTarget, setDeleteSemesterTarget] = useState<AcademicSemester | null>(null);

    // ==================== GRADING SCALES STATE ====================
    const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
    const [showScaleForm, setShowScaleForm] = useState(false);
    const [editingScale, setEditingScale] = useState<GradingScale | null>(null);
    const [scaleName, setScaleName] = useState('');
    const [scaleMaxScore, setScaleMaxScore] = useState('');
    const [scalePassingScore, setScalePassingScore] = useState('');
    const [deleteScaleTarget, setDeleteScaleTarget] = useState<GradingScale | null>(null);

    // ==================== GRADES STATE ====================
    const [grades, setGrades] = useState<AcademicGrade[]>([]);
    const [showGradeForm, setShowGradeForm] = useState(false);
    const [editingGrade, setEditingGrade] = useState<AcademicGrade | null>(null);
    const [gradeCourseName, setGradeCourseName] = useState('');
    const [gradeValue, setGradeValue] = useState('');
    const [gradeWeight, setGradeWeight] = useState('1.0');
    const [gradeAttendance, setGradeAttendance] = useState('');
    const [gradeAttendanceWeight, setGradeAttendanceWeight] = useState('0.0');
    const [gradeNotes, setGradeNotes] = useState('');
    const [deleteGradeTarget, setDeleteGradeTarget] = useState<AcademicGrade | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    // ==================== GOALS STATE ====================
    const [goals, setGoals] = useState<AcademicGoal[]>([]);
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [editingGoal, setEditingGoal] = useState<AcademicGoal | null>(null);
    const [goalCourseName, setGoalCourseName] = useState('');
    const [goalTargetGrade, setGoalTargetGrade] = useState('');
    const [goalCurrentGrade, setGoalCurrentGrade] = useState('');
    const [deleteGoalTarget, setDeleteGoalTarget] = useState<AcademicGoal | null>(null);

    // ==================== ASSESSMENTS STATE ====================
    const [assessments, setAssessments] = useState<AcademicAssessment[]>([]);
    const [showAssessmentForm, setShowAssessmentForm] = useState(false);
    const [editingAssessment, setEditingAssessment] = useState<AcademicAssessment | null>(null);
    const [assessmentCourseName, setAssessmentCourseName] = useState('');
    const [assessmentName, setAssessmentName] = useState('');
    const [assessmentGrade, setAssessmentGrade] = useState('');
    const [assessmentWeight, setAssessmentWeight] = useState('');
    const [assessmentCompleted, setAssessmentCompleted] = useState(false);
    const [deleteAssessmentTarget, setDeleteAssessmentTarget] = useState<AcademicAssessment | null>(null);

    // ==================== STUDY SESSIONS STATE ====================
    const [studySessions, setStudySessions] = useState<StudySession[]>([]);
    const [showSessionForm, setShowSessionForm] = useState(false);
    const [editingSession, setEditingSession] = useState<StudySession | null>(null);
    const [sessionDate, setSessionDate] = useState('');
    const [sessionDuration, setSessionDuration] = useState('');
    const [sessionType, setSessionType] = useState<'study' | 'break'>('study');
    const [sessionNotes, setSessionNotes] = useState('');
    const [deleteSessionTarget, setDeleteSessionTarget] = useState<StudySession | null>(null);

    // Load data based on active tab
    useEffect(() => {
        const loadData = async () => {
            switch (activeTab) {
                case 'semesters':
                    const semData = await getUserAcademicSemesters();
                    setSemesters(semData);
                    break;
                case 'gradingScales':
                    const scaleData = await getUserGradingScales();
                    setGradingScales(scaleData);
                    break;
                case 'grades':
                    const gradeData = await getUserAcademicGrades();
                    setGrades(gradeData);
                    break;
                case 'goals':
                    const goalData = await getUserAcademicGoals();
                    setGoals(goalData);
                    break;
                case 'assessments':
                    const assessData = await getUserAcademicAssessments();
                    setAssessments(assessData);
                    break;
                case 'studySessions':
                    const sessionData = await getUserStudySessions();
                    setStudySessions(sessionData);
                    break;
            }
        };
        loadData();
    }, [activeTab]);

    // ==================== SEMESTER HANDLERS ====================
    const resetSemesterForm = () => {
        setSemesterName('');
        setSemesterYear('');
        setSemesterNum('1');
        setSemesterStart('');
        setSemesterEnd('');
        setEditingSemester(null);
        setShowSemesterForm(false);
    };

    const handleSemesterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingSemester) {
                await updateAcademicSemester(editingSemester.id!, {
                    name: semesterName,
                    year: parseInt(semesterYear),
                    semester: parseInt(semesterNum),
                    start_date: semesterStart || undefined,
                    end_date: semesterEnd || undefined,
                });
                showToast('success', 'Semester updated successfully');
            } else {
                await createAcademicSemester({
                    user_id: '',
                    name: semesterName,
                    year: parseInt(semesterYear),
                    semester: parseInt(semesterNum),
                    start_date: semesterStart || undefined,
                    end_date: semesterEnd || undefined,
                });
                showToast('success', 'Semester created successfully');
            }
            const refreshed = await getUserAcademicSemesters();
            setSemesters(refreshed);
            resetSemesterForm();
        } catch {
            showToast('error', 'Failed to save semester');
        }
    };

    const handleDeleteSemester = async () => {
        if (!deleteSemesterTarget) return;
        await deleteAcademicSemester(deleteSemesterTarget.id!);
        const refreshed = await getUserAcademicSemesters();
        setSemesters(refreshed);
        setDeleteSemesterTarget(null);
        showToast('error', 'Semester deleted');
    };

    const openEditSemester = (semester: AcademicSemester) => {
        setEditingSemester(semester);
        setSemesterName(semester.name);
        setSemesterYear(semester.year.toString());
        setSemesterNum(semester.semester.toString());
        setSemesterStart(semester.start_date || '');
        setSemesterEnd(semester.end_date || '');
    };

    // ==================== GRADING SCALE HANDLERS ====================
    const resetScaleForm = () => {
        setScaleName('');
        setScaleMaxScore('');
        setScalePassingScore('');
        setEditingScale(null);
        setShowScaleForm(false);
    };

    const handleScaleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingScale) {
                await updateGradingScale(editingScale.id!, {
                    name: scaleName,
                    max_score: scaleMaxScore ? parseFloat(scaleMaxScore) : undefined,
                    passing_score: scalePassingScore ? parseFloat(scalePassingScore) : undefined,
                });
                showToast('success', 'Grading scale updated successfully');
            } else {
                await createGradingScale({
                    user_id: '',
                    name: scaleName,
                    max_score: scaleMaxScore ? parseFloat(scaleMaxScore) : undefined,
                    passing_score: scalePassingScore ? parseFloat(scalePassingScore) : undefined,
                });
                showToast('success', 'Grading scale created successfully');
            }
            const refreshed = await getUserGradingScales();
            setGradingScales(refreshed);
            resetScaleForm();
        } catch {
            showToast('error', 'Failed to save grading scale');
        }
    };

    const handleDeleteScale = async () => {
        if (!deleteScaleTarget) return;
        await deleteGradingScale(deleteScaleTarget.id!);
        const refreshed = await getUserGradingScales();
        setGradingScales(refreshed);
        setDeleteScaleTarget(null);
        showToast('error', 'Grading scale deleted');
    };

    const openEditScale = (scale: GradingScale) => {
        setEditingScale(scale);
        setScaleName(scale.name);
        setScaleMaxScore(scale.max_score?.toString() || '');
        setScalePassingScore(scale.passing_score?.toString() || '');
    };

    // ==================== GRADE HANDLERS ====================
    const resetGradeForm = () => {
        setGradeCourseName('');
        setGradeValue('');
        setGradeWeight('1.0');
        setGradeAttendance('');
        setGradeAttendanceWeight('0.0');
        setGradeNotes('');
        setEditingGrade(null);
        setShowGradeForm(false);
    };

    const handleGradeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingGrade) {
                await updateAcademicGrade(editingGrade.id!, {
                    course_name: gradeCourseName,
                    grade: gradeValue ? parseFloat(gradeValue) : undefined,
                    weight: parseFloat(gradeWeight),
                    attendance_grade: gradeAttendance ? parseFloat(gradeAttendance) : undefined,
                    attendance_weight: parseFloat(gradeAttendanceWeight),
                    notes: gradeNotes || undefined,
                });
                showToast('success', 'Grade updated successfully');
            } else {
                await createAcademicGrade({
                    user_id: '',
                    course_name: gradeCourseName,
                    grade: gradeValue ? parseFloat(gradeValue) : undefined,
                    weight: parseFloat(gradeWeight),
                    attendance_grade: gradeAttendance ? parseFloat(gradeAttendance) : undefined,
                    attendance_weight: parseFloat(gradeAttendanceWeight),
                    notes: gradeNotes || undefined,
                });
                showToast('success', 'Grade created successfully');
            }
            const refreshed = await getUserAcademicGrades();
            setGrades(refreshed);
            resetGradeForm();
        } catch {
            showToast('error', 'Failed to save grade');
        }
    };

    const handleDeleteGrade = async () => {
        if (!deleteGradeTarget) return;
        await deleteAcademicGrade(deleteGradeTarget.id!);
        const refreshed = await getUserAcademicGrades();
        setGrades(refreshed);
        setDeleteGradeTarget(null);
        showToast('error', 'Grade deleted');
    };

    const openEditGrade = (grade: AcademicGrade) => {
        setEditingGrade(grade);
        setGradeCourseName(grade.course_name);
        setGradeValue(grade.grade?.toString() || '');
        setGradeWeight(grade.weight?.toString() || '1.0');
        setGradeAttendance(grade.attendance_grade?.toString() || '');
        setGradeAttendanceWeight(grade.attendance_weight?.toString() || '0.0');
        setGradeNotes(grade.notes || '');
    };

    const handleExportGrades = async () => {
        const csv = exportAcademicGradesToCSV(grades);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grades-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportGrades = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result as string;
            try {
                await importAcademicGradesFromCSV(content);
                setImportError(null);
                setShowImportModal(false);
                const refreshed = await getUserAcademicGrades();
                setGrades(refreshed);
                showToast('success', 'Grades imported successfully');
            } catch {
                setImportError('Failed to import grades. Please check your CSV format.');
            }
        };
        reader.readAsText(file);
    };

    // ==================== GOAL HANDLERS ====================
    const resetGoalForm = () => {
        setGoalCourseName('');
        setGoalTargetGrade('');
        setGoalCurrentGrade('');
        setEditingGoal(null);
        setShowGoalForm(false);
    };

    const handleGoalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingGoal) {
                await updateAcademicGoal(editingGoal.id!, {
                    course_name: goalCourseName,
                    target_grade: parseFloat(goalTargetGrade),
                    current_grade: goalCurrentGrade ? parseFloat(goalCurrentGrade) : undefined,
                });
                showToast('success', 'Goal updated successfully');
            } else {
                await createAcademicGoal({
                    user_id: '',
                    course_name: goalCourseName,
                    target_grade: parseFloat(goalTargetGrade),
                    current_grade: goalCurrentGrade ? parseFloat(goalCurrentGrade) : undefined,
                });
                showToast('success', 'Goal created successfully');
            }
            const refreshed = await getUserAcademicGoals();
            setGoals(refreshed);
            resetGoalForm();
        } catch {
            showToast('error', 'Failed to save goal');
        }
    };

    const handleDeleteGoal = async () => {
        if (!deleteGoalTarget) return;
        await deleteAcademicGoal(deleteGoalTarget.id!);
        const refreshed = await getUserAcademicGoals();
        setGoals(refreshed);
        setDeleteGoalTarget(null);
        showToast('error', 'Goal deleted');
    };

    const openEditGoal = (goal: AcademicGoal) => {
        setEditingGoal(goal);
        setGoalCourseName(goal.course_name);
        setGoalTargetGrade(goal.target_grade.toString());
        setGoalCurrentGrade(goal.current_grade?.toString() || '');
    };

    // ==================== ASSESSMENT HANDLERS ====================
    const resetAssessmentForm = () => {
        setAssessmentCourseName('');
        setAssessmentName('');
        setAssessmentGrade('');
        setAssessmentWeight('');
        setAssessmentCompleted(false);
        setEditingAssessment(null);
        setShowAssessmentForm(false);
    };

    const handleAssessmentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingAssessment) {
                await updateAcademicAssessment(editingAssessment.id!, {
                    course_name: assessmentCourseName,
                    name: assessmentName,
                    grade: assessmentGrade ? parseFloat(assessmentGrade) : undefined,
                    weight: parseFloat(assessmentWeight),
                    is_completed: assessmentCompleted,
                });
                showToast('success', 'Assessment updated successfully');
            } else {
                await createAcademicAssessment({
                    user_id: '',
                    course_name: assessmentCourseName,
                    name: assessmentName,
                    grade: assessmentGrade ? parseFloat(assessmentGrade) : undefined,
                    weight: parseFloat(assessmentWeight),
                    is_completed: assessmentCompleted,
                });
                showToast('success', 'Assessment created successfully');
            }
            const refreshed = await getUserAcademicAssessments();
            setAssessments(refreshed);
            resetAssessmentForm();
        } catch {
            showToast('error', 'Failed to save assessment');
        }
    };

    const handleDeleteAssessment = async () => {
        if (!deleteAssessmentTarget) return;
        await deleteAcademicAssessment(deleteAssessmentTarget.id!);
        const refreshed = await getUserAcademicAssessments();
        setAssessments(refreshed);
        setDeleteAssessmentTarget(null);
        showToast('error', 'Assessment deleted');
    };

    const openEditAssessment = (assessment: AcademicAssessment) => {
        setEditingAssessment(assessment);
        setAssessmentCourseName(assessment.course_name);
        setAssessmentName(assessment.name);
        setAssessmentGrade(assessment.grade?.toString() || '');
        setAssessmentWeight(assessment.weight.toString());
        setAssessmentCompleted(assessment.is_completed || false);
    };

    const handleToggleAssessmentComplete = async (assessment: AcademicAssessment) => {
        await toggleAssessmentComplete(assessment.id!, !assessment.is_completed);
        const refreshed = await getUserAcademicAssessments();
        setAssessments(refreshed);
    };

    // ==================== STUDY SESSION HANDLERS ====================
    const resetSessionForm = () => {
        setSessionDate('');
        setSessionDuration('');
        setSessionType('study');
        setSessionNotes('');
        setEditingSession(null);
        setShowSessionForm(false);
    };

    const handleSessionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingSession) {
                await updateStudySession(editingSession.id!, {
                    session_date: sessionDate,
                    duration_minutes: parseInt(sessionDuration),
                    session_type: sessionType,
                    notes: sessionNotes || undefined,
                });
                showToast('success', 'Study session updated successfully');
            } else {
                await createStudySession({
                    user_id: '',
                    session_date: sessionDate,
                    duration_minutes: parseInt(sessionDuration),
                    session_type: sessionType,
                    notes: sessionNotes || undefined,
                });
                showToast('success', 'Study session created successfully');
            }
            const refreshed = await getUserStudySessions();
            setStudySessions(refreshed);
            resetSessionForm();
        } catch {
            showToast('error', 'Failed to save study session');
        }
    };

    const handleDeleteSession = async () => {
        if (!deleteSessionTarget) return;
        await deleteStudySession(deleteSessionTarget.id!);
        const refreshed = await getUserStudySessions();
        setStudySessions(refreshed);
        setDeleteSessionTarget(null);
        showToast('error', 'Study session deleted');
    };

    const openEditSession = (session: StudySession) => {
        setEditingSession(session);
        setSessionDate(session.session_date);
        setSessionDuration(session.duration_minutes.toString());
        setSessionType(session.session_type || 'study');
        setSessionNotes(session.notes || '');
    };

    // ==================== SEARCH HANDLER ====================
    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            setSubmittedSearch(searchQuery);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSubmittedSearch('');
    };

    const filteredSemesters = semesters.filter(s => 
        s.name.toLowerCase().includes(submittedSearch.toLowerCase()) ||
        s.year.toString().includes(submittedSearch)
    );

    const filteredScales = gradingScales.filter(s => 
        s.name.toLowerCase().includes(submittedSearch.toLowerCase())
    );

    const filteredGrades = grades.filter(g => 
        g.course_name.toLowerCase().includes(submittedSearch.toLowerCase())
    );

    const filteredGoals = goals.filter(g => 
        g.course_name.toLowerCase().includes(submittedSearch.toLowerCase())
    );

    const filteredAssessments = assessments.filter(a => 
        a.course_name.toLowerCase().includes(submittedSearch.toLowerCase()) ||
        a.name.toLowerCase().includes(submittedSearch.toLowerCase())
    );

    const filteredSessions = studySessions.filter(s => 
        s.session_date.includes(submittedSearch) ||
        (s.notes && s.notes.toLowerCase().includes(submittedSearch.toLowerCase()))
    );

    const totalSemesters = semesters.length;
    const totalScales = gradingScales.length;
    const totalGrades = grades.length;
    const totalGoals = goals.length;
    const totalAssessments = assessments.length;
    const totalSessions = studySessions.length;

    const getCurrentData = () => {
        switch (activeTab) {
            case 'semesters': return filteredSemesters;
            case 'gradingScales': return filteredScales;
            case 'grades': return filteredGrades;
            case 'goals': return filteredGoals;
            case 'assessments': return filteredAssessments;
            case 'studySessions': return filteredSessions;
            default: return [];
        }
    };

    const getCurrentTotal = () => {
        switch (activeTab) {
            case 'semesters': return totalSemesters;
            case 'gradingScales': return totalScales;
            case 'grades': return totalGrades;
            case 'goals': return totalGoals;
            case 'assessments': return totalAssessments;
            case 'studySessions': return totalSessions;
            default: return 0;
        }
    };

    const renderCard = (item: any) => {
        switch (activeTab) {
            case 'semesters':
                return (
                    <div key={item.id} className="book-card">
                        <div className="book-card-top">
                            <h3 className="book-title">{item.name}</h3>
                            <div className="flex gap-1 shrink-0">
                                <button onClick={() => openEditSemester(item)} className="book-action-btn" title="Edit semester">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onClick={() => setDeleteSemesterTarget(item)} className="book-action-btn book-action-btn--danger" title="Delete semester">
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div className="book-card-details">
                            <p className="text-sm opacity-70">Year {item.year} - Semester {item.semester}</p>
                            {item.start_date && item.end_date && (
                                <p className="text-xs opacity-50 mt-1">{item.start_date} to {item.end_date}</p>
                            )}
                        </div>
                    </div>
                );
            case 'gradingScales':
                return (
                    <div key={item.id} className="book-card">
                        <div className="book-card-top">
                            <h3 className="book-title">{item.name}</h3>
                            <div className="flex gap-1 shrink-0">
                                <button onClick={() => openEditScale(item)} className="book-action-btn" title="Edit scale">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onClick={() => setDeleteScaleTarget(item)} className="book-action-btn book-action-btn--danger" title="Delete scale">
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div className="book-card-details">
                            <p className="text-sm opacity-70">Max: {item.max_score ?? 'N/A'} | Passing: {item.passing_score ?? 'N/A'}</p>
                        </div>
                    </div>
                );
            case 'grades':
                return (
                    <div key={item.id} className="book-card">
                        <div className="book-card-top">
                            <h3 className="book-title">{item.course_name}</h3>
                            <div className="flex gap-1 shrink-0">
                                <button onClick={() => openEditGrade(item)} className="book-action-btn" title="Edit grade">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onClick={() => setDeleteGradeTarget(item)} className="book-action-btn book-action-btn--danger" title="Delete grade">
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div className="book-card-details">
                            <p className="text-sm opacity-70">Grade: {item.grade ?? 'N/A'} (Weight: {item.weight})</p>
                            {item.attendance_grade && (
                                <p className="text-xs opacity-50 mt-1">Attendance: {item.attendance_grade} (Weight: {item.attendance_weight})</p>
                            )}
                        </div>
                    </div>
                );
            case 'goals':
                return (
                    <div key={item.id} className="book-card">
                        <div className="book-card-top">
                            <h3 className="book-title">{item.course_name}</h3>
                            <div className="flex gap-1 shrink-0">
                                <button onClick={() => openEditGoal(item)} className="book-action-btn" title="Edit goal">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onClick={() => setDeleteGoalTarget(item)} className="book-action-btn book-action-btn--danger" title="Delete goal">
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div className="book-card-details">
                            <p className="text-sm opacity-70">Target: {item.target_grade} | Current: {item.current_grade ?? 'N/A'}</p>
                        </div>
                    </div>
                );
            case 'assessments':
                return (
                    <div key={item.id} className="book-card">
                        <div className="book-card-top">
                            <h3 className="book-title">{item.name}</h3>
                            <div className="flex gap-1 shrink-0">
                                <button onClick={() => handleToggleAssessmentComplete(item)} className={`book-action-btn ${item.is_completed ? 'book-action-btn--success' : ''}`} title={item.is_completed ? 'Mark incomplete' : 'Mark complete'}>
                                    <i className={`fa-solid ${item.is_completed ? 'fa-check-circle' : 'fa-circle'}`}></i>
                                </button>
                                <button onClick={() => openEditAssessment(item)} className="book-action-btn" title="Edit assessment">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onClick={() => setDeleteAssessmentTarget(item)} className="book-action-btn book-action-btn--danger" title="Delete assessment">
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div className="book-card-details">
                            <p className="text-sm opacity-70">{item.course_name} - Grade: {item.grade ?? 'N/A'} (Weight: {item.weight})</p>
                        </div>
                    </div>
                );
            case 'studySessions':
                return (
                    <div key={item.id} className="book-card">
                        <div className="book-card-top">
                            <h3 className="book-title">{item.session_date}</h3>
                            <div className="flex gap-1 shrink-0">
                                <button onClick={() => openEditSession(item)} className="book-action-btn" title="Edit session">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onClick={() => setDeleteSessionTarget(item)} className="book-action-btn book-action-btn--danger" title="Delete session">
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div className="book-card-details">
                            <p className="text-sm opacity-70">{item.duration_minutes} minutes - {item.session_type}</p>
                            {item.notes && (
                                <p className="text-xs opacity-50 mt-1">{item.notes}</p>
                            )}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <>
            <Title title="Academic" />
            <div className="books-page-wrapper">
                <div className="dashboard-section books-section">
                    <div className="books-card">
                        {/* Stats + Top Bar */}
                        <div className="books-stats">
                            <div className="books-stat-item">
                                <span className="books-stat-label">Total</span>
                                <span className="books-stat-value">{getCurrentTotal()}</span>
                            </div>
                        </div>

                        <div className="books-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => {
                                    switch (activeTab) {
                                        case 'semesters': setShowSemesterForm(true); break;
                                        case 'gradingScales': setShowScaleForm(true); break;
                                        case 'grades': setShowGradeForm(true); break;
                                        case 'goals': setShowGoalForm(true); break;
                                        case 'assessments': setShowAssessmentForm(true); break;
                                        case 'studySessions': setShowSessionForm(true); break;
                                    }
                                }} className="btn-action">
                                    <i className="i-lucide-plus mr-1"></i>Add
                                </button>
                                {activeTab === 'grades' && (
                                    <>
                                        <button onClick={handleExportGrades} className="btn-action" disabled={totalGrades === 0}>
                                            <i className="i-lucide-download mr-1"></i>Export
                                        </button>
                                        <button onClick={() => setShowImportModal(true)} className="btn-action">
                                            <i className="i-lucide-upload mr-1"></i>Import
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Tab Navigation */}
                            <div className="flex gap-2 flex-wrap">
                                {[
                                    { id: 'semesters' as TabType, label: 'Semesters' },
                                    { id: 'gradingScales' as TabType, label: 'Scales' },
                                    { id: 'grades' as TabType, label: 'Grades' },
                                    { id: 'goals' as TabType, label: 'Goals' },
                                    { id: 'assessments' as TabType, label: 'Assessments' },
                                    { id: 'studySessions' as TabType, label: 'Sessions' },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`btn-action ${activeTab === tab.id ? 'btn-action--active' : ''}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search */}
                        <div className="search-container">
                            <div className="search-input-wrapper">
                                <i className="search-input-icon fa-solid fa-magnifying-glass"></i>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                    className="search-input"
                                    placeholder="Search..."
                                />
                                {(searchQuery || submittedSearch) && (
                                    <button className="search-clear-btn" onClick={clearSearch}>
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Content */}
                        {getCurrentData().length === 0 ? (
                            <div className="projects-empty">
                                <i className="i-lucide-folder-open projects-empty-icon"></i>
                                <p className="projects-empty-title">No items found</p>
                                <p className="projects-empty-text">Add your first item to get started!</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 mt-3">
                                {getCurrentData().map(renderCard)}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ==================== MODALS ==================== */}

            {/* Semester Form Modal */}
            {showSemesterForm && (
                <div className="import-modal-overlay" onClick={resetSemesterForm}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">{editingSemester ? 'Edit Semester' : 'Add Semester'}</h3>
                        <form onSubmit={handleSemesterSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Name</label>
                                <input type="text" value={semesterName} onChange={(e) => setSemesterName(e.target.value)} className="form-control" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Year</label>
                                    <input type="number" value={semesterYear} onChange={(e) => setSemesterYear(e.target.value)} className="form-control" required />
                                </div>
                                <div>
                                    <label className="form-label">Semester (1-3)</label>
                                    <input type="number" min="1" max="3" value={semesterNum} onChange={(e) => setSemesterNum(e.target.value)} className="form-control" required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Start Date</label>
                                    <input type="date" value={semesterStart} onChange={(e) => setSemesterStart(e.target.value)} className="form-control" />
                                </div>
                                <div>
                                    <label className="form-label">End Date</label>
                                    <input type="date" value={semesterEnd} onChange={(e) => setSemesterEnd(e.target.value)} className="form-control" />
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" onClick={resetSemesterForm} className="btn-form-cancel">Cancel</button>
                                <button type="submit" className="btn-form-submit">{editingSemester ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Grading Scale Form Modal */}
            {showScaleForm && (
                <div className="import-modal-overlay" onClick={resetScaleForm}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">{editingScale ? 'Edit Grading Scale' : 'Add Grading Scale'}</h3>
                        <form onSubmit={handleScaleSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Name</label>
                                <input type="text" value={scaleName} onChange={(e) => setScaleName(e.target.value)} className="form-control" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Max Score</label>
                                    <input type="number" step="0.1" value={scaleMaxScore} onChange={(e) => setScaleMaxScore(e.target.value)} className="form-control" />
                                </div>
                                <div>
                                    <label className="form-label">Passing Score</label>
                                    <input type="number" step="0.1" value={scalePassingScore} onChange={(e) => setScalePassingScore(e.target.value)} className="form-control" />
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" onClick={resetScaleForm} className="btn-form-cancel">Cancel</button>
                                <button type="submit" className="btn-form-submit">{editingScale ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Grade Form Modal */}
            {showGradeForm && (
                <div className="import-modal-overlay" onClick={resetGradeForm}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">{editingGrade ? 'Edit Grade' : 'Add Grade'}</h3>
                        <form onSubmit={handleGradeSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Course Name</label>
                                <input type="text" value={gradeCourseName} onChange={(e) => setGradeCourseName(e.target.value)} className="form-control" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Grade</label>
                                    <input type="number" step="0.1" value={gradeValue} onChange={(e) => setGradeValue(e.target.value)} className="form-control" />
                                </div>
                                <div>
                                    <label className="form-label">Weight</label>
                                    <input type="number" step="0.1" value={gradeWeight} onChange={(e) => setGradeWeight(e.target.value)} className="form-control" required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Attendance Grade</label>
                                    <input type="number" step="0.1" value={gradeAttendance} onChange={(e) => setGradeAttendance(e.target.value)} className="form-control" />
                                </div>
                                <div>
                                    <label className="form-label">Attendance Weight</label>
                                    <input type="number" step="0.1" value={gradeAttendanceWeight} onChange={(e) => setGradeAttendanceWeight(e.target.value)} className="form-control" />
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Notes</label>
                                <textarea value={gradeNotes} onChange={(e) => setGradeNotes(e.target.value)} className="form-control" rows={3} />
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" onClick={resetGradeForm} className="btn-form-cancel">Cancel</button>
                                <button type="submit" className="btn-form-submit">{editingGrade ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Goal Form Modal */}
            {showGoalForm && (
                <div className="import-modal-overlay" onClick={resetGoalForm}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">{editingGoal ? 'Edit Goal' : 'Add Goal'}</h3>
                        <form onSubmit={handleGoalSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Course Name</label>
                                <input type="text" value={goalCourseName} onChange={(e) => setGoalCourseName(e.target.value)} className="form-control" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Target Grade</label>
                                    <input type="number" step="0.1" value={goalTargetGrade} onChange={(e) => setGoalTargetGrade(e.target.value)} className="form-control" required />
                                </div>
                                <div>
                                    <label className="form-label">Current Grade</label>
                                    <input type="number" step="0.1" value={goalCurrentGrade} onChange={(e) => setGoalCurrentGrade(e.target.value)} className="form-control" />
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" onClick={resetGoalForm} className="btn-form-cancel">Cancel</button>
                                <button type="submit" className="btn-form-submit">{editingGoal ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Assessment Form Modal */}
            {showAssessmentForm && (
                <div className="import-modal-overlay" onClick={resetAssessmentForm}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">{editingAssessment ? 'Edit Assessment' : 'Add Assessment'}</h3>
                        <form onSubmit={handleAssessmentSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Course Name</label>
                                <input type="text" value={assessmentCourseName} onChange={(e) => setAssessmentCourseName(e.target.value)} className="form-control" required />
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Assessment Name</label>
                                <input type="text" value={assessmentName} onChange={(e) => setAssessmentName(e.target.value)} className="form-control" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Grade</label>
                                    <input type="number" step="0.1" value={assessmentGrade} onChange={(e) => setAssessmentGrade(e.target.value)} className="form-control" />
                                </div>
                                <div>
                                    <label className="form-label">Weight</label>
                                    <input type="number" step="0.1" value={assessmentWeight} onChange={(e) => setAssessmentWeight(e.target.value)} className="form-control" required />
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="form-label flex items-center gap-2">
                                    <input type="checkbox" checked={assessmentCompleted} onChange={(e) => setAssessmentCompleted(e.target.checked)} />
                                    Completed
                                </label>
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" onClick={resetAssessmentForm} className="btn-form-cancel">Cancel</button>
                                <button type="submit" className="btn-form-submit">{editingAssessment ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Study Session Form Modal */}
            {showSessionForm && (
                <div className="import-modal-overlay" onClick={resetSessionForm}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">{editingSession ? 'Edit Study Session' : 'Add Study Session'}</h3>
                        <form onSubmit={handleSessionSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Date</label>
                                <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="form-control" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Duration (minutes)</label>
                                    <input type="number" value={sessionDuration} onChange={(e) => setSessionDuration(e.target.value)} className="form-control" required />
                                </div>
                                <div>
                                    <label className="form-label">Type</label>
                                    <select value={sessionType} onChange={(e) => setSessionType(e.target.value as 'study' | 'break')} className="form-select">
                                        <option value="study">Study</option>
                                        <option value="break">Break</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Notes</label>
                                <textarea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} className="form-control" rows={3} />
                            </div>
                            <div className="flex gap-2 justify-end mt-5">
                                <button type="button" onClick={resetSessionForm} className="btn-form-cancel">Cancel</button>
                                <button type="submit" className="btn-form-submit">{editingSession ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modals */}
            {deleteSemesterTarget && (
                <div className="import-modal-overlay" onClick={() => setDeleteSemesterTarget(null)}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Semester?</h3>
                        <p className="mb-4">Are you sure you want to delete "{deleteSemesterTarget.name}"?</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteSemesterTarget(null)} className="btn-form-cancel">Cancel</button>
                            <button onClick={handleDeleteSemester} className="btn-form-submit btn-form-submit--danger">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {deleteScaleTarget && (
                <div className="import-modal-overlay" onClick={() => setDeleteScaleTarget(null)}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Grading Scale?</h3>
                        <p className="mb-4">Are you sure you want to delete "{deleteScaleTarget.name}"?</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteScaleTarget(null)} className="btn-form-cancel">Cancel</button>
                            <button onClick={handleDeleteScale} className="btn-form-submit btn-form-submit--danger">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {deleteGradeTarget && (
                <div className="import-modal-overlay" onClick={() => setDeleteGradeTarget(null)}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Grade?</h3>
                        <p className="mb-4">Are you sure you want to delete grade for "{deleteGradeTarget.course_name}"?</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteGradeTarget(null)} className="btn-form-cancel">Cancel</button>
                            <button onClick={handleDeleteGrade} className="btn-form-submit btn-form-submit--danger">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {deleteGoalTarget && (
                <div className="import-modal-overlay" onClick={() => setDeleteGoalTarget(null)}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Goal?</h3>
                        <p className="mb-4">Are you sure you want to delete goal for "{deleteGoalTarget.course_name}"?</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteGoalTarget(null)} className="btn-form-cancel">Cancel</button>
                            <button onClick={handleDeleteGoal} className="btn-form-submit btn-form-submit--danger">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {deleteAssessmentTarget && (
                <div className="import-modal-overlay" onClick={() => setDeleteAssessmentTarget(null)}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Assessment?</h3>
                        <p className="mb-4">Are you sure you want to delete "{deleteAssessmentTarget.name}"?</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteAssessmentTarget(null)} className="btn-form-cancel">Cancel</button>
                            <button onClick={handleDeleteAssessment} className="btn-form-submit btn-form-submit--danger">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {deleteSessionTarget && (
                <div className="import-modal-overlay" onClick={() => setDeleteSessionTarget(null)}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Delete Study Session?</h3>
                        <p className="mb-4">Are you sure you want to delete session from "{deleteSessionTarget.session_date}"?</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteSessionTarget(null)} className="btn-form-cancel">Cancel</button>
                            <button onClick={handleDeleteSession} className="btn-form-submit btn-form-submit--danger">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="import-modal-overlay" onClick={() => {
                    setShowImportModal(false);
                    setImportError(null);
                }}>
                    <div className="import-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-4">Import Grades from CSV</h3>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleImportGrades}
                            className="form-control"
                        />
                        {importError && (
                            <p className="text-red-500 mt-2">{importError}</p>
                        )}
                        <div className="flex gap-2 justify-end mt-5">
                            <button onClick={() => {
                                setShowImportModal(false);
                                setImportError(null);
                            }} className="btn-form-cancel">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className={`toast-notification toast-${toast.type}`}>
                    {toast.message}
                </div>
            )}
        </>
    );
};

export default AcademicPage;
