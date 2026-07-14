import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserSettings, createUserSettings, updateUserSettings } from '../services/profileService';
import { getCurrentUser } from '../services/profileService';
import type { UserSettings } from '../services/profileService';
import Title from '../Components/Title';

type GenderType = 'male' | 'female' | 'other' | 'prefer_not_to_say' | '';
type GoalType = 'maintain' | 'lose' | 'gain' | '';

const EditProfilePage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isNewUser, setIsNewUser] = useState(true);
    
    // Form states
    const [gender, setGender] = useState<GenderType>('');
    const [heightCm, setHeightCm] = useState<number | ''>('');
    const [dateOfBirth, setDateOfBirth] = useState<string>('');
    const [goal, setGoal] = useState<GoalType>('');
    const [startingWeight, setStartingWeight] = useState<number | ''>('');
    const [startingWeightDate, setStartingWeightDate] = useState<string>('');
    const [startingBodyfat, setStartingBodyfat] = useState<number | ''>('');
    const [startingBodyfatDate, setStartingBodyfatDate] = useState<string>('');
    const [targetWeight, setTargetWeight] = useState<number | ''>('');
    const [targetBodyfat, setTargetBodyfat] = useState<number | ''>('');

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
                setDateOfBirth(existingSettings.date_of_birth || '');
                setGoal(existingSettings.goal || '');
                setStartingWeight(existingSettings.starting_weight || '');
                setStartingWeightDate(existingSettings.starting_weight_date || '');
                setStartingBodyfat(existingSettings.starting_bodyfat || '');
                setStartingBodyfatDate(existingSettings.starting_bodyfat_date || '');
                setTargetWeight(existingSettings.target_weight || '');
                setTargetBodyfat(existingSettings.target_bodyfat || '');
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
                date_of_birth: dateOfBirth || null,
                goal,
                starting_weight: typeof startingWeight === 'number' ? startingWeight : null,
                starting_weight_date: startingWeightDate || null,
                starting_bodyfat: typeof startingBodyfat === 'number' ? startingBodyfat : null,
                starting_bodyfat_date: startingBodyfatDate || null,
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

    return (
        <>
            <Title title={isNewUser ? "Complete Your Profile" : "Edit Profile"} />
            <div className="page-main-with-secondary">
                <div className="auth-card">
                    <h2 className="auth-title">{isNewUser ? "Welcome! Complete Your Profile" : "Edit Your Profile"}</h2>
                    <p className="auth-text" style={{ marginBottom: '1.5rem' }}>
                        {isNewUser ? "Let's set up your fitness profile to get started." : "Update your fitness profile information."}
                    </p>
                    <form onSubmit={handleSubmit} noValidate>
                        {error && <div className="auth-error">{error}</div>}
                        
                        {/* Gender */}
                        <div className="mb-3 text-start">
                            <label htmlFor="gender" className="form-label">Gender</label>
                            <div
                                className={`t-input-wrap ${fieldErrors.gender ? 'is-error' : ''}`}
                                ref={(el) => { fieldRefs.current['gender'] = el; }}
                            >
                                <div className={`t-input ${fieldErrors.gender ? 'is-error' : ''} ${shakingField === 'gender' ? 'is-shaking' : ''}`}>
                                    <select
                                        className="form-control"
                                        id="gender"
                                        value={gender}
                                        onChange={(e) => {
                                            setGender(e.target.value as GenderType);
                                            clearFieldError('gender');
                                        }}
                                        required
                                    >
                                        <option value="">Select gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                        <option value="prefer_not_to_say">Prefer not to say</option>
                                    </select>
                                </div>
                                {fieldErrors.gender && <p className="t-error-msg">{fieldErrors.gender}</p>}
                            </div>
                        </div>

                        {/* Height */}
                        <div className="mb-3 text-start">
                            <label htmlFor="height_cm" className="form-label">Height (cm)</label>
                            <div
                                className={`t-input-wrap ${fieldErrors.height_cm ? 'is-error' : ''}`}
                                ref={(el) => { fieldRefs.current['height_cm'] = el; }}
                            >
                                <div className={`t-input ${fieldErrors.height_cm ? 'is-error' : ''} ${shakingField === 'height_cm' ? 'is-shaking' : ''}`}>
                                    <input
                                        className="form-control"
                                        id="height_cm"
                                        type="number"
                                        placeholder="Enter height in cm"
                                        value={heightCm}
                                        onChange={(e) => {
                                            setHeightCm(e.target.value ? parseFloat(e.target.value) : '');
                                            clearFieldError('height_cm');
                                        }}
                                        required
                                    />
                                </div>
                                {fieldErrors.height_cm && <p className="t-error-msg">{fieldErrors.height_cm}</p>}
                            </div>
                        </div>

                        {/* Date of Birth */}
                        <div className="mb-3 text-start">
                            <label htmlFor="date_of_birth" className="form-label">Date of Birth</label>
                            <div
                                className={`t-input-wrap ${fieldErrors.date_of_birth ? 'is-error' : ''}`}
                                ref={(el) => { fieldRefs.current['date_of_birth'] = el; }}
                            >
                                <div className={`t-input ${fieldErrors.date_of_birth ? 'is-error' : ''} ${shakingField === 'date_of_birth' ? 'is-shaking' : ''}`}>
                                    <input
                                        className="form-control"
                                        id="date_of_birth"
                                        type="date"
                                        value={dateOfBirth}
                                        onChange={(e) => {
                                            setDateOfBirth(e.target.value);
                                            clearFieldError('date_of_birth');
                                        }}
                                        required
                                    />
                                </div>
                                {fieldErrors.date_of_birth && <p className="t-error-msg">{fieldErrors.date_of_birth}</p>}
                            </div>
                        </div>

                        {/* Goal */}
                        <div className="mb-3 text-start">
                            <label htmlFor="goal" className="form-label">Goal</label>
                            <div
                                className={`t-input-wrap ${fieldErrors.goal ? 'is-error' : ''}`}
                                ref={(el) => { fieldRefs.current['goal'] = el; }}
                            >
                                <div className={`t-input ${fieldErrors.goal ? 'is-error' : ''} ${shakingField === 'goal' ? 'is-shaking' : ''}`}>
                                    <select
                                        className="form-control"
                                        id="goal"
                                        value={goal}
                                        onChange={(e) => {
                                            setGoal(e.target.value as GoalType);
                                            clearFieldError('goal');
                                        }}
                                        required
                                    >
                                        <option value="">Select goal</option>
                                        <option value="maintain">Maintain Weight</option>
                                        <option value="lose">Lose Weight</option>
                                        <option value="gain">Gain Weight</option>
                                    </select>
                                </div>
                                {fieldErrors.goal && <p className="t-error-msg">{fieldErrors.goal}</p>}
                            </div>
                        </div>

                        {/* Starting Weight */}
                        <div className="mb-3 text-start">
                            <label htmlFor="starting_weight" className="form-label">Starting Weight (kg)</label>
                            <div className="t-input-wrap">
                                <div className="t-input">
                                    <input
                                        className="form-control"
                                        id="starting_weight"
                                        type="number"
                                        step="0.1"
                                        placeholder="Enter starting weight"
                                        value={startingWeight}
                                        onChange={(e) => setStartingWeight(e.target.value ? parseFloat(e.target.value) : '')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Starting Weight Date */}
                        <div className="mb-3 text-start">
                            <label htmlFor="starting_weight_date" className="form-label">Starting Weight Date</label>
                            <div className="t-input-wrap">
                                <div className="t-input">
                                    <input
                                        className="form-control"
                                        id="starting_weight_date"
                                        type="date"
                                        value={startingWeightDate}
                                        onChange={(e) => setStartingWeightDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Starting Body Fat */}
                        <div className="mb-3 text-start">
                            <label htmlFor="starting_bodyfat" className="form-label">Starting Body Fat (%)</label>
                            <div className="t-input-wrap">
                                <div className="t-input">
                                    <input
                                        className="form-control"
                                        id="starting_bodyfat"
                                        type="number"
                                        step="0.1"
                                        placeholder="Enter starting body fat"
                                        value={startingBodyfat}
                                        onChange={(e) => setStartingBodyfat(e.target.value ? parseFloat(e.target.value) : '')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Starting Body Fat Date */}
                        <div className="mb-3 text-start">
                            <label htmlFor="starting_bodyfat_date" className="form-label">Starting Body Fat Date</label>
                            <div className="t-input-wrap">
                                <div className="t-input">
                                    <input
                                        className="form-control"
                                        id="starting_bodyfat_date"
                                        type="date"
                                        value={startingBodyfatDate}
                                        onChange={(e) => setStartingBodyfatDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Target Weight */}
                        <div className="mb-3 text-start">
                            <label htmlFor="target_weight" className="form-label">Target Weight (kg)</label>
                            <div className="t-input-wrap">
                                <div className="t-input">
                                    <input
                                        className="form-control"
                                        id="target_weight"
                                        type="number"
                                        step="0.1"
                                        placeholder="Enter target weight"
                                        value={targetWeight}
                                        onChange={(e) => setTargetWeight(e.target.value ? parseFloat(e.target.value) : '')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Target Body Fat */}
                        <div className="mb-3 text-start">
                            <label htmlFor="target_bodyfat" className="form-label">Target Body Fat (%)</label>
                            <div className="t-input-wrap">
                                <div className="t-input">
                                    <input
                                        className="form-control"
                                        id="target_bodyfat"
                                        type="number"
                                        step="0.1"
                                        placeholder="Enter target body fat"
                                        value={targetBodyfat}
                                        onChange={(e) => setTargetBodyfat(e.target.value ? parseFloat(e.target.value) : '')}
                                    />
                                </div>
                            </div>
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