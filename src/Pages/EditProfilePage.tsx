import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserSettings, createUserSettings, updateUserSettings } from '../services/profileService';
import { getCurrentUser } from '../services/profileService';
import { supabase } from '../services/supabaseClient';
import type { UserSettings } from '../services/profileService';
import Title from '../Components/Title';

type GenderType = 'male' | 'female' | 'other' | 'prefer_not_to_say' | '';
type GoalType = 'maintain' | 'lose' | 'gain' | '';

// Date input mask - formats as DD/MM/YYYY
const formatDateInput = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) {
        return numbers;
    } else if (numbers.length <= 4) {
        return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    } else if (numbers.length <= 8) {
        return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
    }
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
};

// Convert DD/MM/YYYY to YYYY-MM-DD for storage
const convertToStorageFormat = (value: string): string => {
    const parts = value.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return value;
};

// Convert YYYY-MM-DD to DD/MM/YYYY for display
const convertToDisplayFormat = (value: string): string => {
    if (!value) return '';
    if (value.includes('-')) {
        const parts = value.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return value;
};

const EditProfilePage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isNewUser, setIsNewUser] = useState(true);
    
    // Form states
    const [username, setUsername] = useState<string>('');
    const [gender, setGender] = useState<GenderType>('');
    const [heightCm, setHeightCm] = useState<number | ''>('');
    const [dateOfBirth, setDateOfBirth] = useState<string>('');
    const [goal, setGoal] = useState<GoalType>('');
    const [startingWeight, setStartingWeight] = useState<number | ''>('');
    const [startingBodyfat, setStartingBodyfat] = useState<number | ''>('');
    const [targetWeight, setTargetWeight] = useState<number | ''>('');
    const [targetBodyfat, setTargetBodyfat] = useState<number | ''>('');
    const [lastMeasurementDate, setLastMeasurementDate] = useState<string>('');

    // Field errors and shake animation
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [shakingField, setShakingField] = useState<string | null>(null);
    const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const triggerShake = useCallback((field: string) => {
        setShakingField(null);
        requestAnimationFrame(() => {
            setShakingField(field);
        });
    }, []);

    useEffect(() => {
        const loadData = async () => {
            const existingSettings = await getUserSettings();
            if (existingSettings) {
                setIsNewUser(false);
                setGender(existingSettings.gender || '');
                setHeightCm(existingSettings.height_cm || '');
                setDateOfBirth(convertToDisplayFormat(existingSettings.date_of_birth || ''));
                setGoal(existingSettings.goal || '');
                setStartingWeight(existingSettings.starting_weight || '');
                setStartingBodyfat(existingSettings.starting_bodyfat || '');
                setTargetWeight(existingSettings.target_weight || '');
                setTargetBodyfat(existingSettings.target_bodyfat || '');
                setLastMeasurementDate(convertToDisplayFormat(existingSettings.last_measurement_date || ''));
            }
            
            // Get username from Supabase auth user metadata
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.user_metadata?.username) {
                setUsername(user.user_metadata.username);
            }
        };
        void loadData();
    }, []);

const validateForm = () => {
        const errors: Record<string, string> = {};
        
        if (!gender) {
            errors.gender = 'Please select your gender.';
        }
        if (!heightCm) {
            errors.height_cm = 'Please enter your height.';
        }
        if (!dateOfBirth) {
            errors.date_of_birth = 'Please enter your date of birth.';
        } else if (dateOfBirth.replace(/\D/g, '').length !== 8) {
            errors.date_of_birth = 'Date must be in DD/MM/YYYY format.';
        } else {
            // Validate age range (5-120 years)
            const parts = dateOfBirth.split('/');
            const birthDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            const today = new Date();
            const age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) 
                ? age - 1 : age;
            if (actualAge < 5 || actualAge > 120) {
                errors.date_of_birth = 'Age must be between 5 and 120 years.';
            }
        }
        if (lastMeasurementDate && lastMeasurementDate.replace(/\D/g, '').length === 8) {
            const parts = lastMeasurementDate.split('/');
            const inputDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (inputDate > today) {
                errors.last_measurement_date = 'Date cannot be in the future.';
            }
        }
        if (!goal) {
            errors.goal = 'Please select your goal.';
        }

        setFieldErrors(errors);
        
        if (Object.keys(errors).length > 0) {
            const firstErrorField = Object.keys(errors)[0];
            triggerShake(firstErrorField);
            return false;
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!validateForm()) {
            return;
        }

        setLoading(true);
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No user found');
            }

            const settings: UserSettings = {
                user_id: user.id,
                gender,
                height_cm: typeof heightCm === 'number' ? heightCm : null,
                date_of_birth: convertToStorageFormat(dateOfBirth) || null,
                goal,
                starting_weight: typeof startingWeight === 'number' ? startingWeight : null,
                last_measurement_date: convertToStorageFormat(lastMeasurementDate) || null,
                starting_bodyfat: typeof startingBodyfat === 'number' ? startingBodyfat : null,
                target_weight: typeof targetWeight === 'number' ? targetWeight : null,
                target_bodyfat: typeof targetBodyfat === 'number' ? targetBodyfat : null,
            };

            if (isNewUser) {
                await createUserSettings(settings);
            } else {
                await updateUserSettings(settings);
            }

            navigate('/profile');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save profile. Please try again.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const clearFieldError = (field: string) => {
        setFieldErrors((prev) => {
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    const renderInput = (
        id: string, 
        label: string, 
        value: string | number, 
        onChange: (value: string) => void, 
        type: 'text' | 'number' = 'text', 
        placeholder?: string, 
        required: boolean = false, 
        step?: string,
        isDate: boolean = false
    ) => (
        <div className="mb-3 text-start">
            <label htmlFor={id} className="form-label">{label}</label>
            <div
                className={`t-input-wrap ${fieldErrors[id] ? 'is-error' : ''}`}
                ref={(el) => { fieldRefs.current[id] = el; }}
            >
                <div className={`t-input ${fieldErrors[id] ? 'is-error' : ''} ${shakingField === id ? 'is-shaking' : ''}`}>
                    <input
                        className="form-control"
                        id={id}
                        type={type}
                        placeholder={placeholder}
                        value={value}
                        step={step}
                        onChange={(e) => {
                            const val = isDate ? formatDateInput(e.target.value) : e.target.value;
                            onChange(val);
                            clearFieldError(id);
                        }}
                        required={required}
                    />
                </div>
                {fieldErrors[id] && <p className="t-error-msg">{fieldErrors[id]}</p>}
            </div>
        </div>
    );

    const renderSelect = (
        id: string, 
        label: string, 
        value: string, 
        options: { value: string; label: string }[], 
        required: boolean = false,
        onSelect: (value: string) => void
    ) => (
        <div className="mb-3 text-start">
            <label htmlFor={id} className="form-label">{label}</label>
            <div
                className={`t-input-wrap ${fieldErrors[id] ? 'is-error' : ''}`}
                ref={(el) => { fieldRefs.current[id] = el; }}
            >
                <div className={`t-input ${fieldErrors[id] ? 'is-error' : ''} ${shakingField === id ? 'is-shaking' : ''}`}>
                    <select
                        className="form-control form-select"
                        id={id}
                        value={value}
                        onChange={(e) => {
                            onSelect(e.target.value);
                            clearFieldError(id);
                        }}
                        required={required}
                    >
                        <option value="">Select {label.toLowerCase()}</option>
                        {options.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                {fieldErrors[id] && <p className="t-error-msg">{fieldErrors[id]}</p>}
            </div>
        </div>
    );

    return (
        <>
            <Title title={isNewUser ? "Complete Your Profile" : "Edit Profile"} />
            <div className="page-main-with-secondary">
                <div className="auth-card profile-form-card">
                    <h2 className="auth-title">{isNewUser ? "Welcome! Complete Your Profile" : "Edit Your Profile"}</h2>
                    <p className="auth-text" style={{ marginBottom: '1.5rem' }}>
                        {isNewUser ? "Let's set up your fitness profile to get started." : "Update your fitness profile information."}
                    </p>
                    <form onSubmit={handleSubmit} noValidate>
                        {error && <div className="auth-error">{error}</div>}
                        
                        {/* Personal Info Section */}
                        <div className="form-grid">
                            {renderInput('username', 'Username', username, setUsername, 'text', 'Enter your username', false)}
                        </div>
                        
                        {/* Body Stats Section */}
                        <div className="form-grid">
                            {renderInput('height_cm', 'Height (cm)', heightCm, (v) => setHeightCm(v ? parseFloat(v) : ''), 'number', 'Enter height in cm', true)}
                            {renderInput('date_of_birth', 'Date of Birth', dateOfBirth, setDateOfBirth, 'text', 'DD/MM/YYYY', true, undefined, true)}
                        </div>
                        
                        <div className="form-grid">
                            {renderSelect('gender', 'Gender', gender, [
                                { value: 'male', label: 'Male' },
                                { value: 'female', label: 'Female' },
                                { value: 'other', label: 'Other' },
                                { value: 'prefer_not_to_say', label: 'Prefer not to say' }
                            ], true, (v) => setGender(v as GenderType))}
                            {renderSelect('goal', 'Goal', goal, [
                                { value: 'maintain', label: 'Maintain Weight' },
                                { value: 'lose', label: 'Lose Weight' },
                                { value: 'gain', label: 'Gain Weight' }
                            ], true, (v) => setGoal(v as GoalType))}
                        </div>
                        
                        {/* Starting Measurements Section */}
                        <div className="form-grid">
                            {renderInput('starting_weight', 'Starting Weight (kg)', startingWeight, (v) => setStartingWeight(v ? parseFloat(v) : ''), 'number', 'Enter starting weight', false, '0.1')}
                            {renderInput('starting_bodyfat', 'Starting Body Fat (%)', startingBodyfat, (v) => setStartingBodyfat(v ? parseFloat(v) : ''), 'number', 'Enter starting body fat', false, '0.1')}
                        </div>
                        
                        {/* Target Measurements Section */}
                        <div className="form-grid">
                            {renderInput('target_weight', 'Target Weight (kg)', targetWeight, (v) => setTargetWeight(v ? parseFloat(v) : ''), 'number', 'Enter target weight', false, '0.1')}
                            {renderInput('target_bodyfat', 'Target Body Fat (%)', targetBodyfat, (v) => setTargetBodyfat(v ? parseFloat(v) : ''), 'number', 'Enter target body fat', false, '0.1')}
                        </div>
                        
                        {/* Last Measurement Date */}
                        <div className="form-grid">
                            {renderInput('last_measurement_date', 'Last Measurement Date', lastMeasurementDate, setLastMeasurementDate, 'text', 'DD/MM/YYYY', false, undefined, true)}
                        </div>

                        <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                            {loading ? (isNewUser ? 'Creating...' : 'Saving...') : (isNewUser ? 'Complete Profile' : 'Save Changes')}
                        </button>
                        
                        {!isNewUser && (
                            <button 
                                type="button" 
                                className="btn btn-secondary w-100 mt-2" 
                                onClick={() => navigate('/profile')}
                                style={{ background: 'transparent', border: '1px solid #ffffff1f', color: 'var(--color-light)' }}
                            >
                                Cancel
                            </button>
                        )}
                    </form>
                </div>
            </div>
        </>
    );
};

export default EditProfilePage;