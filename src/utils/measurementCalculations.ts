// Body measurement derived-value calculations.
// Raw measurements are stored as-is; every derived field below is computed
// client-side using standard published formulas and written back to the
// matching body_measurements columns on save.

export interface MeasurementInput {
    weight?: number | null;
    wrist_left?: number | null;
    wrist_right?: number | null;
    neck?: number | null;
    shoulders?: number | null;
    chest?: number | null;
    forearm_left_relaxed?: number | null;
    forearm_left_flexed?: number | null;
    forearm_right_relaxed?: number | null;
    forearm_right_flexed?: number | null;
    bicep_left_relaxed?: number | null;
    bicep_left_flexed?: number | null;
    bicep_right_relaxed?: number | null;
    bicep_right_flexed?: number | null;
    waist?: number | null;
    hips?: number | null;
    thigh_left?: number | null;
    thigh_right?: number | null;
    calf_left?: number | null;
    calf_right?: number | null;
}

export interface CalculationContext {
    gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | '';
    height_cm?: number | null;
    age?: number | null;
    // Optional strength snapshot: best recent lifts (Epley 1RM) relative to
    // bodyweight, used for dynamic_strength.
    relativeBestLift?: number | null;
}

export interface BodyCalculations {
    waist_hip_ratio: number | null;
    waist_height_ratio: number | null;
    shoulder_waist_ratio: number | null;
    shoulder_chest_ratio: number | null;
    shoulder_hip_ratio: number | null;
    thigh_calf_ratio: number | null;
    bicep_ratio: number | null;
    bicep_flexing_symmetry: number | null;
    forearm_symmetry: number | null;
    lean_body_mass: number | null;
    fat_mass: number | null;
    bmr: number | null;
    ffmi: number | null;
    adonis_index: number | null;
    torso_taper: number | null;
    leg_torso_ratio: number | null;
    metabolic_age: number | null;
    muscle_quality: number | null;
    dynamic_strength: number | null;
    // Estimated body-fat percentage (US Navy method). Not a stored column but
    // surfaced in the UI and used by the body-composition formula above.
    body_fat_percent: number | null;
}

const CM_TO_IN = 0.393701;

const safeDiv = (a: number | null | undefined, b: number | null | undefined): number | null =>
    a != null && b != null && b > 0 ? a / b : null;

const avg = (...values: Array<number | null | undefined>): number | null => {
    const valid = values.filter((v): v is number => typeof v === 'number' && v > 0);
    if (valid.length === 0) return null;
    return valid.reduce((acc, v) => acc + v, 0) / valid.length;
};

// Ratio difference expressed as a 0-100 symmetry score (100 = perfectly even).
const symmetRy = (left: number | null | undefined, right: number | null | undefined): number | null => {
    const max = Math.max(left ?? 0, right ?? 0);
    if (max <= 0) return null;
    const diff = Math.abs((left ?? 0) - (right ?? 0));
    return Math.max(0, 100 - (diff / max) * 100);
};

// US Navy circumference method for body-fat percentage.
const navyBodyFatPercent = (m: MeasurementInput, ctx: CalculationContext): number | null => {
    const heightIn = (ctx.height_cm ?? 0) * CM_TO_IN;
    if (heightIn <= 0 || !m.neck) return null;
    const waistIn = (m.waist ?? 0) * CM_TO_IN;
    if (waistIn <= 0) return null;

    const gender: string = ctx.gender || 'male';
    if (gender === 'female') {
        const hipsIn = (m.hips ?? 0) * CM_TO_IN;
        if (hipsIn <= 0) return null;
        const n = 1.29579 - 0.35004 * Math.log10(waistIn + hipsIn - m.neck * CM_TO_IN)
            + 0.221 * Math.log10(heightIn);
        if (n <= 0) return null;
        return Math.max(0, 495 / n - 450);
    }
    const n = 1.0324 - 0.19077 * Math.log10(waistIn - m.neck * CM_TO_IN)
        + 0.15456 * Math.log10(heightIn);
    if (n <= 0) return null;
    return Math.max(0, 495 / n - 450);
};

// Mifflin-St Jeor to compute BMR from weight (kg), height (cm), age.
const mifflinStJeor = (weight: number, heightCm: number, age: number, gender: string): number => {
    const base = 10 * weight + 6.25 * heightCm - 5 * age;
    if (gender === 'female') return Math.round(base - 161);
    if (gender === 'male') return Math.round(base + 5);
    return Math.round(base - 78); // average of the two adjustments
};

// Find the age whose normative BMR (same weight/height/gender) is closest to
// the user's actual BMR. A higher BMR than the norm maps to a younger age.
const estimateMetabolicAge = (
    bmr: number,
    weight: number,
    heightCm: number,
    gender: string
): number | null => {
    let bestAge = 30;
    let bestDiff = Infinity;
    for (let age = 10; age <= 90; age++) {
        const norm = mifflinStJeor(weight, heightCm, age, gender);
        const diff = Math.abs(norm - bmr);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestAge = age;
        }
    }
    return bestAge;
};

export const computeBodyCalculations = (
    m: MeasurementInput,
    ctx: CalculationContext = {}
): BodyCalculations => {
    const weight = m.weight ?? null;
    const heightCm = ctx.height_cm ?? null;

    const avgThigh = avg(m.thigh_left, m.thigh_right);
    const avgCalf = avg(m.calf_left, m.calf_right);
    const avgBicepFlexed = avg(m.bicep_left_flexed, m.bicep_right_flexed);
    const avgForearmFlexed = avg(m.forearm_left_flexed, m.forearm_right_flexed);

    const bodyFat = navyBodyFatPercent(m, ctx);

    const fatMass = weight != null && bodyFat != null ? round2((weight * bodyFat) / 100) : null;
    const leanMass = weight != null && fatMass != null ? round2(weight - fatMass) : null;

    const bmr = weight != null && heightCm != null && ctx.age != null
        ? mifflinStJeor(weight, heightCm, ctx.age, ctx.gender || 'male')
        : null;

    const heightM = heightCm != null ? heightCm / 100 : null;
    const ffmi = leanMass != null && heightM != null ? round2(leanMass / (heightM * heightM)) : null;

    // Dynamic strength: best recent relative 1RM (kg lifted per kg bodyweight) scaled to 0-100.
    const dynamicStrength = weight != null && ctx.relativeBestLift != null
        ? Math.round((ctx.relativeBestLift / weight) * 100)
        : null;

    return {
        waist_hip_ratio: round2OrNull(safeDiv(m.waist ?? null, m.hips ?? null)),
        waist_height_ratio: round2OrNull(safeDiv(m.waist ?? null, heightCm)),
        shoulder_waist_ratio: round2OrNull(safeDiv(m.shoulders ?? null, m.waist ?? null)),
        shoulder_chest_ratio: round2OrNull(safeDiv(m.shoulders ?? null, m.chest ?? null)),
        shoulder_hip_ratio: round2OrNull(safeDiv(m.shoulders ?? null, m.hips ?? null)),
        thigh_calf_ratio: round2OrNull(safeDiv(avgThigh, avgCalf)),
        bicep_ratio: round2OrNull(safeDiv(avgBicepFlexed, avgForearmFlexed)),
        bicep_flexing_symmetry: round1OrNull(symmetRy(m.bicep_left_flexed, m.bicep_right_flexed)),
        forearm_symmetry: round1OrNull(symmetRy(m.forearm_left_flexed, m.forearm_right_flexed)),
        lean_body_mass: leanMass,
        fat_mass: fatMass,
        bmr,
        ffmi,
        adonis_index: round2OrNull(
            m.shoulders != null && m.waist != null && m.waist > 0 && m.hips != null
                ? (m.shoulders / m.waist) * (m.hips / m.waist)
                : null
        ),
        torso_taper: m.shoulders != null && m.waist != null ? round1(m.shoulders - m.waist) : null,
        leg_torso_ratio: round2OrNull(safeDiv(avgThigh, avgBicepFlexed)),
        metabolic_age: bmr != null && weight != null && heightCm != null
            ? estimateMetabolicAge(bmr, weight, heightCm, ctx.gender || 'male')
            : null,
        muscle_quality: weight != null && leanMass != null ? round1((leanMass / weight) * 100) : null,
        dynamic_strength: dynamicStrength,
        body_fat_percent: bodyFat != null ? round1(bodyFat) : null,
    };
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round1 = (value: number): number => Math.round(value * 10) / 10;
const round2OrNull = (value: number | null): number | null => (value == null ? null : round2(value));
const round1OrNull = (value: number | null): number | null => (value == null ? null : round1(value));

// Whole years from a YYYY-MM-DD birth date (null when missing/invalid).
export const ageFromDob = (dob?: string | null): number | null => {
    if (!dob) return null;
    const birth = new Date(dob + 'T00:00:00');
    if (isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age;
};

// Full value from an ISO date used by forms (mirrors the document `toDateString`).
export const measureDateToInput = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};