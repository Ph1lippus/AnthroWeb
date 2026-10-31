// Body measurement derived-value calculations.
// Raw measurements are stored as-is; every derived field below is computed
// client-side using standard published formulas and written back to the
// matching body_measurements columns on save.

export interface MeasurementInput {
    weight?: number | null;
    /**
     * A body-fat percentage the user actually supplied.
     *
     * Preferred over the Navy circumference derivation below. A number off a scale
     * is a measurement and a figure derived from tape is an estimate, and when
     * both are available the measurement is the one worth keeping -- which is why
     * this is not merged into the derived set.
     */
    body_fat?: number | null;
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
    /** Body-mass index: weight (kg) / height (m)^2. */
    bmi: number | null;
    /** Body-fat percentage the user actually supplied (a reading, not an estimate). */
    body_fat_measured: number | null;
    /** The US Navy circumference estimate, computed from centimetres directly. */
    body_fat_navy: number | null;
    /** The YMCA method: waist and weight only, no neck or height needed. */
    body_fat_ymca: number | null;
    /** The body-fat percentage preferred by the rest of the app: the measured
     * reading when one was entered, otherwise the Navy estimate. */
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

// Body-mass index: weight in kilograms over height in metres squared.
const bmiFrom = (weight: number | null | undefined, heightCm: number | null | undefined): number | null => {
    if (weight == null || heightCm == null || heightCm <= 0) return null;
    const heightM = heightCm / 100;
    return round2(weight / (heightM * heightM));
};

// US Navy circumference method for body-fat percentage.
//
// The Hodgdon & Beckett equations take centimetres directly. They were fitted
// against hydrostatic weighing with the raw metric inputs -- a 172 cm man with
// an 85 cm waist and 37 cm neck resolves to 18.2%. Converting to inches first
// (which is what this used to do) pushes the log terms through a different scale
// and lands near 11.8%, which is why the estimate read far too low for anyone
// entering metric. Both forms are the same equation; only the unit of the inputs
// changes, so the conversion was simply wrong to be there.
const navyBodyFatPercent = (m: MeasurementInput, ctx: CalculationContext): number | null => {
    const heightCm = ctx.height_cm ?? 0;
    if (heightCm <= 0 || !m.neck) return null;
    const waistCm = m.waist ?? 0;
    if (waistCm <= 0) return null;

    const gender: string = ctx.gender || 'male';
    if (gender === 'female') {
        const hipsCm = m.hips ?? 0;
        if (hipsCm <= 0) return null;
        const n = 1.29579 - 0.35004 * Math.log10(waistCm + hipsCm - m.neck)
            + 0.221 * Math.log10(heightCm);
        if (n <= 0) return null;
        return Math.max(0, 495 / n - 450);
    }
    const n = 1.0324 - 0.19077 * Math.log10(waistCm - m.neck)
        + 0.15456 * Math.log10(heightCm);
    if (n <= 0) return null;
    return Math.max(0, 495 / n - 450);
};

// YMCA body-fat method: waist and weight only, so it needs neither neck nor
// height. Imperial inputs -- waist in inches, weight in pounds -- which is the
// form the formula was published in, so it is the one place a conversion is
// required rather than an error to remove.
const ymcaBodyFatPercent = (m: MeasurementInput, ctx: CalculationContext): number | null => {
    const waistIn = (m.waist ?? 0) * CM_TO_IN;
    if (waistIn <= 0 || m.weight == null || m.weight <= 0) return null;
    const weightLb = m.weight / 0.453592;
    const gender: string = ctx.gender || 'male';
    const constant = gender === 'female' ? -76.76 : -98.42;
    const raw = (constant + 4.15 * waistIn - 0.082 * weightLb) / weightLb;
    if (!Number.isFinite(raw)) return null;
    return Math.max(0, raw * 100);
};

// Mifflin-St Jeor to compute BMR from weight (kg), height (cm), age.
const mifflinStJeor = (weight: number, heightCm: number, age: number, gender: string): number => {
    const base = 10 * weight + 6.25 * heightCm - 5 * age;
    if (gender === 'female') return Math.floor(base - 161);
    if (gender === 'male') return Math.floor(base + 5);
    return Math.floor(base - 78); // average of the two adjustments
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

    // A body-fat percentage the user supplied beats the Navy derivation for the
    // rest of the app. Both exist now that body_fat is a real column: one is a
    // reading off a scale, the other an estimate from tape. The estimate is
    // still computed and surfaced separately so the two can be compared -- the
    // user asked to see them argue rather than have one silently replace the
    // other. The Navy value fills in when nothing was entered, so an existing
    // tape-only measurement is not left with nothing.
    const measuredFat = m.body_fat ?? null;
    const navyFat = navyBodyFatPercent(m, ctx);
    const ymcaFat = ymcaBodyFatPercent(m, ctx);
    const bodyFat = measuredFat ?? navyFat;

    const fatMass = weight != null && bodyFat != null ? round2((weight * bodyFat) / 100) : null;
    const leanMass = weight != null && fatMass != null ? round2(weight - fatMass) : null;

    const bmr = weight != null && heightCm != null && ctx.age != null
        ? mifflinStJeor(weight, heightCm, ctx.age, ctx.gender || 'male')
        : null;

    const heightM = heightCm != null ? heightCm / 100 : null;
    const ffmi = leanMass != null && heightM != null ? round2(leanMass / (heightM * heightM)) : null;

    // Dynamic strength: best recent relative 1RM (kg lifted per kg bodyweight) scaled to 0-100.
    const dynamicStrength = weight != null && ctx.relativeBestLift != null
        ? Math.floor((ctx.relativeBestLift / weight) * 100)
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
        adonis_index: round2OrNull(safeDiv(m.shoulders ?? null, m.waist ?? null)),
        torso_taper: m.shoulders != null && m.waist != null ? round1(m.shoulders - m.waist) : null,
        leg_torso_ratio: round2OrNull(safeDiv(avgThigh, avgBicepFlexed)),
        metabolic_age: bmr != null && weight != null && heightCm != null
            ? estimateMetabolicAge(bmr, weight, heightCm, ctx.gender || 'male')
            : null,
        muscle_quality: weight != null && leanMass != null ? round1((leanMass / weight) * 100) : null,
        dynamic_strength: dynamicStrength,
        bmi: bmiFrom(weight, heightCm),
        body_fat_measured: measuredFat != null ? round1(measuredFat) : null,
        body_fat_navy: navyFat != null ? round1(navyFat) : null,
        body_fat_ymca: ymcaFat != null ? round1(ymcaFat) : null,
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