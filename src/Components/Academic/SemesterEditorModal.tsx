import React, { useState } from 'react';
import type { AcademicSemester } from '../../services/academicService';
import {
    MAX_SEMESTER,
    MIN_ACADEMIC_YEAR,
    academicYearLabel,
    currentAcademicYear,
    semesterLabel,
} from '../../utils/semester';

interface SemesterEditorModalProps {
    semester: AcademicSemester | null;
    onClose: () => void;
    onSubmit: (semester: AcademicSemester) => void;
    busy?: boolean;
}

const SemesterEditorModal: React.FC<SemesterEditorModalProps> = ({
    semester,
    onClose,
    onSubmit,
    busy = false,
}) => {
    // The name is optional on purpose. Blank means "derive it from the year and
    // number", which is what almost every semester wants.
    const [name, setName] = useState(semester?.name ?? '');
    const [year, setYear] = useState(String(semester?.year ?? currentAcademicYear()));
    const [semesterNum, setSemesterNum] = useState(String(semester?.semester ?? 1));
    const [startDate, setStartDate] = useState(semester?.start_date ?? '');
    const [endDate, setEndDate] = useState(semester?.end_date ?? '');

    const parsedYear = Number(year);
    const validYear = Number.isFinite(parsedYear) && parsedYear >= MIN_ACADEMIC_YEAR;
    const parsedSemester = Number(semesterNum);
    const autoName = validYear
        ? semesterLabel(parsedYear, parsedSemester)
        : 'Semester …';

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!validYear) return;

        onSubmit({
            id: semester?.id,
            user_id: semester?.user_id ?? '',
            name: name.trim(),
            year: parsedYear,
            semester: parsedSemester,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
        });
    };

    const showAutoName = name.trim().length === 0 && validYear;

    return (
        <div className="import-modal-overlay" onClick={() => { if (!busy) onClose(); }}>
            <div className="import-modal-card" onClick={event => event.stopPropagation()}>
                <h3>{semester ? 'Edit Semester' : 'Add Semester'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-2 gap-4 mb-2">
                        <div>
                            {/* Only the starting year is stored; the closing year
                                is derived, so the two can never disagree. */}
                            <label className="form-label">Academic year</label>
                            <div className="academic-year-field">
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={MIN_ACADEMIC_YEAR}
                                    value={year}
                                    onChange={event => setYear(event.target.value)}
                                    className="form-control"
                                    required
                                    autoFocus
                                    aria-describedby="academic-year-hint"
                                />
                                <span className="academic-year-field__suffix">
                                    /{Number.isFinite(parsedYear) ? parsedYear + 1 : '…'}
                                </span>
                            </div>
                            <span id="academic-year-hint" className="academic-field-hint">
                                {validYear
                                    ? `The academic year ${academicYearLabel(parsedYear)}.`
                                    : `Enter a year from ${MIN_ACADEMIC_YEAR} onwards.`}
                            </span>
                        </div>
                        <div>
                            <label className="form-label">Semester</label>
                            <select
                                value={semesterNum}
                                onChange={event => setSemesterNum(event.target.value)}
                                className="form-select"
                            >
                                {Array.from({ length: MAX_SEMESTER }, (_, index) => index + 1).map(number => (
                                    <option key={number} value={number}>{number}</option>
                                ))}
                            </select>
                            <span className="academic-field-hint">
                                Where this term sits within the academic year.
                            </span>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="form-label">
                            Name <span className="form-label__optional">optional</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            className="form-control"
                            placeholder={autoName}
                            maxLength={80}
                        />
                        <span className="academic-field-hint">
                            {showAutoName
                                ? <>Showing <strong>{autoName}</strong>. Type here only to rename it.</>
                                : 'Uses your own name instead of the generated one.'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="form-label">Start date <span className="form-label__optional">optional</span></label>
                            <input
                                type="date"
                                value={startDate ?? ''}
                                onChange={event => setStartDate(event.target.value)}
                                className="form-control"
                            />
                        </div>
                        <div>
                            <label className="form-label">End date <span className="form-label__optional">optional</span></label>
                            <input
                                type="date"
                                value={endDate ?? ''}
                                onChange={event => setEndDate(event.target.value)}
                                className="form-control"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end mt-5">
                        <button type="button" className="btn-form-cancel" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-form-submit" disabled={busy || !validYear}>
                            {busy ? 'Saving...' : semester ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SemesterEditorModal;